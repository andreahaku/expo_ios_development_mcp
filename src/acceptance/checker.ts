/**
 * Acceptance Criteria Checker
 * Orchestrates criterion checks and aggregates results
 */

import type {
  AcceptanceCriterion,
  CriterionResult,
  MissingRequirement,
  FlowResult,
  ParsedCriteria,
  AcceptanceRunOptions,
  SectionReport,
  ReportSummary,
} from "./types.js";
import { mapCriterionToCheck } from "./mapper.js";
import {
  DEFAULT_CRITERION_TIMEOUT_MS,
  PERCENTAGE_ROUNDING_FACTOR,
} from "./constants.js";
import {
  executeDetoxCheck,
  executeVisualCheck,
} from "./executor.js";
import { executeTestFlow } from "./flow-runner.js";
import { stateManager } from "../core/state.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";

// Re-export executeTestFlow for external consumers
export { executeTestFlow } from "./flow-runner.js";

/**
 * Execute a single criterion check
 */
export async function executeCriterionCheck(
  criterion: AcceptanceCriterion,
  options: { captureEvidence?: boolean; timeout?: number } = {}
): Promise<CriterionResult> {
  const startTime = Date.now();
  const { captureEvidence = true, timeout = DEFAULT_CRITERION_TIMEOUT_MS } = options;

  try {
    // Map criterion to executable check
    const mappedCheck = mapCriterionToCheck(criterion);

    // Handle manual checks
    if (mappedCheck.type === "manual") {
      return {
        criterion,
        status: "skip",
        message: mappedCheck.manualReason || "Requires manual verification",
        elapsedMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Handle visual checks (screenshot analysis)
    if (mappedCheck.type === "visual" || mappedCheck.type === "screenshot_analysis") {
      return executeVisualCheck(criterion, mappedCheck, startTime, captureEvidence);
    }

    // Execute Detox check
    if (mappedCheck.type === "detox" && mappedCheck.detoxSnippet) {
      return executeDetoxCheck(criterion, mappedCheck, startTime, captureEvidence, timeout);
    }

    return {
      criterion,
      status: "skip",
      message: "No executable check could be generated",
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("acceptance", `Error executing criterion check: ${criterion.id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      criterion,
      status: "error",
      message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Run all acceptance criteria checks
 */
export async function runAcceptanceChecks(
  criteria: ParsedCriteria,
  options: AcceptanceRunOptions = {}
): Promise<{
  sectionReports: SectionReport[];
  flowResults: FlowResult[];
  allMissingRequirements: MissingRequirement[];
  summary: ReportSummary;
}> {
  const {
    stopOnFailure = false,
    sections: filterSections,
    skipFlows = false,
    skipManual = true,
    timeout = DEFAULT_CRITERION_TIMEOUT_MS,
  } = options;

  // Check prerequisites
  if (!stateManager.isDetoxReady()) {
    throw createError(
      "DETOX_NOT_READY",
      "Detox session must be started before running acceptance checks"
    );
  }

  try {
    const sectionReports: SectionReport[] = [];
    const flowResults: FlowResult[] = [];
    const allMissingRequirements: MissingRequirement[] = [];

    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    let totalBlocked = 0;
    let totalErrors = 0;

    // Run section checks
    for (const section of criteria.sections) {
      // Filter sections if specified
      if (filterSections && !filterSections.some((s) =>
        section.name.toLowerCase().includes(s.toLowerCase())
      )) {
        continue;
      }

      const results: CriterionResult[] = [];

      // Get all criteria in section (including subsections)
      const allCriteria = [
        ...section.criteria,
        ...section.subsections.flatMap((sub) => sub.criteria),
      ];

      for (const criterion of allCriteria) {
        // Skip manual criteria if requested
        if (skipManual && criterion.type === "manual") {
          results.push({
            criterion,
            status: "skip",
            message: "Manual check skipped",
            elapsedMs: 0,
            timestamp: new Date().toISOString(),
          });
          totalSkipped++;
          continue;
        }

        logger.info("acceptance", `Checking: ${criterion.description.slice(0, 50)}...`);

        const result = await executeCriterionCheck(criterion, {
          captureEvidence: true, // Always capture evidence for reporting
          timeout,
        });

        results.push(result);

        // Collect missing requirements
        if (result.missingRequirements) {
          allMissingRequirements.push(...result.missingRequirements);
        }

        // Update counters
        switch (result.status) {
          case "pass":
            totalPassed++;
            break;
          case "fail":
            totalFailed++;
            break;
          case "skip":
            totalSkipped++;
            break;
          case "blocked":
            totalBlocked++;
            break;
          case "error":
            totalErrors++;
            break;
        }

        // Stop on failure if requested
        if (stopOnFailure && (result.status === "fail" || result.status === "error")) {
          break;
        }
      }

      // Calculate section summary
      const sectionSummary = calculateSummary(results);

      sectionReports.push({
        section,
        results,
        summary: sectionSummary,
      });

      if (stopOnFailure && (totalFailed > 0 || totalErrors > 0)) {
        break;
      }
    }

    // Run test flows
    if (!skipFlows && !stopOnFailure) {
      for (const flow of criteria.testFlows) {
        logger.info("acceptance", `Running flow: ${flow.name}`);

        const flowResult = await executeTestFlow(flow, {
          screenshotEachStep: true,
          stopOnFailure: true,
        });

        flowResults.push(flowResult);

        if (flowResult.missingRequirements) {
          allMissingRequirements.push(...flowResult.missingRequirements);
        }
      }
    }

    // Calculate overall summary
    const total = totalPassed + totalFailed + totalSkipped + totalBlocked + totalErrors;
    const testable = total - totalSkipped;
    const passRate = testable > 0 ? (totalPassed / testable) * 100 : 0;
    const testableRate = total > 0 ? (testable / total) * 100 : 0;

    const summary: ReportSummary = {
      total,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      blocked: totalBlocked,
      errors: totalErrors,
      passRate: Math.round(passRate * PERCENTAGE_ROUNDING_FACTOR) / PERCENTAGE_ROUNDING_FACTOR,
      testableRate: Math.round(testableRate * PERCENTAGE_ROUNDING_FACTOR) / PERCENTAGE_ROUNDING_FACTOR,
    };

    return {
      sectionReports,
      flowResults,
      allMissingRequirements,
      summary,
    };
  } catch (error) {
    logger.error("acceptance", "Error running acceptance checks", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Calculate summary statistics from results
 */
function calculateSummary(results: CriterionResult[]): ReportSummary {
  const counts = {
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    errors: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case "pass":
        counts.passed++;
        break;
      case "fail":
        counts.failed++;
        break;
      case "skip":
        counts.skipped++;
        break;
      case "blocked":
        counts.blocked++;
        break;
      case "error":
        counts.errors++;
        break;
    }
  }

  const total = results.length;
  const testable = total - counts.skipped;
  const passRate = testable > 0 ? (counts.passed / testable) * 100 : 0;
  const testableRate = total > 0 ? (testable / total) * 100 : 0;

  return {
    total,
    passed: counts.passed,
    failed: counts.failed,
    skipped: counts.skipped,
    blocked: counts.blocked,
    errors: counts.errors,
    passRate: Math.round(passRate * PERCENTAGE_ROUNDING_FACTOR) / PERCENTAGE_ROUNDING_FACTOR,
    testableRate: Math.round(testableRate * PERCENTAGE_ROUNDING_FACTOR) / PERCENTAGE_ROUNDING_FACTOR,
  };
}
