/**
 * Acceptance Criteria Checker
 * Executes criterion checks and detects missing requirements
 */

import type {
  AcceptanceCriterion,
  CriterionResult,
  CriterionStatus,
  MissingRequirement,
  FlowStep,
  FlowStepResult,
  FlowResult,
  TestFlow,
  CheckEvidence,
  ParsedCriteria,
  AcceptanceRunOptions,
  SectionReport,
  ReportSummary,
} from "./types.js";
import { mapCriterionToCheck, mapFlowStep, type MappedCheck } from "./mapper.js";
import { inferTestId } from "./parser.js";
import { runDetoxAction, type RunnerResult } from "../detox/runner.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import { stateManager } from "../core/state.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";

/**
 * Execute a single criterion check
 */
export async function executeCriterionCheck(
  criterion: AcceptanceCriterion,
  options: { captureEvidence?: boolean; timeout?: number } = {}
): Promise<CriterionResult> {
  const startTime = Date.now();
  const { captureEvidence = true, timeout = 30000 } = options;

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
}

/**
 * Execute a Detox-based check
 */
async function executeDetoxCheck(
  criterion: AcceptanceCriterion,
  mappedCheck: MappedCheck,
  startTime: number,
  captureEvidence: boolean,
  timeout: number
): Promise<CriterionResult> {
  try {
    const result = await runDetoxAction({
      actionName: `check:${criterion.id}`,
      actionSnippet: mappedCheck.detoxSnippet!,
      timeoutMs: timeout,
    });

    if (result.success) {
      const evidence: CheckEvidence | undefined = captureEvidence
        ? await captureSuccessEvidence(criterion.id)
        : undefined;

      return {
        criterion,
        status: "pass",
        message: "Check passed",
        evidence,
        elapsedMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // Check failed - analyze the failure
    return analyzeDetoxFailure(criterion, result, startTime);
  } catch (error) {
    return {
      criterion,
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Analyze a Detox failure to determine if it's a real failure or missing testability
 */
function analyzeDetoxFailure(
  criterion: AcceptanceCriterion,
  result: RunnerResult,
  startTime: number
): CriterionResult {
  const errorMessage = result.error?.message || "Unknown failure";
  const lowerError = errorMessage.toLowerCase();

  // Check for element not found errors - indicates missing testID
  const elementNotFoundPatterns = [
    "cannot find",
    "element not found",
    "no matching element",
    "unable to find",
    "could not find",
    "doesn't exist",
    "does not exist",
  ];

  const isElementNotFound = elementNotFoundPatterns.some((p) =>
    lowerError.includes(p)
  );

  if (isElementNotFound) {
    // This is a blocked check - missing testID or accessibility label
    const missingRequirements = generateMissingRequirements(criterion, errorMessage);

    return {
      criterion,
      status: "blocked",
      message: "Element not found - missing testID or accessibility label",
      evidence: {
        screenshots: result.evidence || [],
        logs: result.error?.details,
      },
      missingRequirements,
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Check for timeout errors
  if (lowerError.includes("timeout") || lowerError.includes("timed out")) {
    return {
      criterion,
      status: "fail",
      message: `Timeout waiting for element: ${errorMessage}`,
      evidence: {
        screenshots: result.evidence || [],
        logs: result.error?.details,
      },
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Check for assertion failures
  if (
    lowerError.includes("expect") ||
    lowerError.includes("assertion") ||
    lowerError.includes("expected")
  ) {
    return {
      criterion,
      status: "fail",
      message: `Assertion failed: ${errorMessage}`,
      evidence: {
        screenshots: result.evidence || [],
        logs: result.error?.details,
      },
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }

  // Generic failure
  return {
    criterion,
    status: "fail",
    message: errorMessage,
    evidence: {
      screenshots: result.evidence || [],
      logs: result.error?.details,
    },
    elapsedMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate missing requirements from a blocked criterion
 */
function generateMissingRequirements(
  criterion: AcceptanceCriterion,
  errorMessage: string
): MissingRequirement[] {
  const requirements: MissingRequirement[] = [];

  // Determine what type of identifier is needed
  const suggestedTestId = inferTestId(criterion.description);

  // Try to extract element info from error message
  let elementDescription = criterion.description;
  const selectorMatch = errorMessage.match(
    /(?:by\.(?:id|text|label)\()["']([^"']+)["']/
  );
  if (selectorMatch) {
    elementDescription = selectorMatch[1];
  }

  requirements.push({
    type: "testID",
    elementDescription: criterion.description,
    suggestedValue: suggestedTestId,
    reason: `Add testID="${suggestedTestId}" to make this element testable`,
    criterionId: criterion.id,
  });

  // If the selector was by text or label, also suggest alternatives
  if (criterion.config.selector?.by === "text") {
    requirements.push({
      type: "accessibilityLabel",
      elementDescription: criterion.description,
      suggestedValue: criterion.config.selector.value,
      reason: `Alternatively, add accessibilityLabel="${criterion.config.selector.value}"`,
      criterionId: criterion.id,
    });
  }

  return requirements;
}

/**
 * Execute a visual/screenshot analysis check
 */
async function executeVisualCheck(
  criterion: AcceptanceCriterion,
  mappedCheck: MappedCheck,
  startTime: number,
  captureEvidence: boolean
): Promise<CriterionResult> {
  try {
    // Take a screenshot for analysis
    const screenshot = await takeScreenshot(`visual-${criterion.id}`);

    // For color checks, we would analyze the screenshot
    // This is a simplified version - full implementation would use pixel analysis
    if (mappedCheck.visualConfig?.colorExtraction) {
      // Note: Full color extraction would require image processing library
      // For now, we return a skip status with instructions
      return {
        criterion,
        status: "skip",
        message: `Color check requires manual verification. Target color: ${mappedCheck.visualConfig.colorExtraction.targetColor}`,
        evidence: {
          screenshots: [screenshot.path],
          expectedValue: mappedCheck.visualConfig.colorExtraction.targetColor,
        },
        elapsedMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };
    }

    // For layout checks, we would compare against baseline
    return {
      criterion,
      status: "skip",
      message: "Visual check requires baseline comparison or manual verification",
      evidence: captureEvidence
        ? { screenshots: [screenshot.path] }
        : undefined,
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      criterion,
      status: "error",
      message: error instanceof Error ? error.message : "Screenshot capture failed",
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Capture evidence screenshot for successful checks
 */
async function captureSuccessEvidence(
  criterionId: string
): Promise<CheckEvidence | undefined> {
  try {
    const screenshot = await takeScreenshot(`pass-${criterionId}`);
    return {
      screenshots: [screenshot.path],
    };
  } catch {
    return undefined;
  }
}

/**
 * Execute a test flow
 */
export async function executeTestFlow(
  flow: TestFlow,
  options: { screenshotEachStep?: boolean; stopOnFailure?: boolean } = {}
): Promise<FlowResult> {
  const startTime = Date.now();
  const { screenshotEachStep = true, stopOnFailure = true } = options;

  const stepResults: FlowStepResult[] = [];
  const allMissingRequirements: MissingRequirement[] = [];
  let completedSteps = 0;
  let blocked = false;
  let blockedReason: string | undefined;

  logger.info("acceptance", `Starting flow: ${flow.name}`, {
    totalSteps: flow.steps.length,
  });

  for (const step of flow.steps) {
    const stepStartTime = Date.now();
    const mappedStep = mapFlowStep(step);

    // If no action could be mapped, skip
    if (!mappedStep.detoxSnippet) {
      const result: FlowStepResult = {
        step,
        status: "skip",
        message: `Could not map action "${step.action || step.description}" to executable step`,
        elapsedMs: Date.now() - stepStartTime,
      };
      stepResults.push(result);

      if (stopOnFailure) {
        blocked = true;
        blockedReason = `Step ${step.stepNumber}: ${result.message}`;
        break;
      }
      continue;
    }

    // Execute the step
    try {
      const detoxResult = await runDetoxAction({
        actionName: `flow:${flow.name}:step${step.stepNumber}`,
        actionSnippet: mappedStep.detoxSnippet,
        timeoutMs: 30000,
      });

      if (detoxResult.success) {
        completedSteps++;

        const evidence: CheckEvidence | undefined = screenshotEachStep
          ? await captureStepEvidence(flow.name, step.stepNumber)
          : undefined;

        stepResults.push({
          step,
          status: "pass",
          message: "Step completed successfully",
          evidence,
          elapsedMs: Date.now() - stepStartTime,
        });
      } else {
        // Analyze the failure
        const stepResult = analyzeStepFailure(step, detoxResult, stepStartTime);
        stepResults.push(stepResult);

        if (stepResult.missingRequirements) {
          allMissingRequirements.push(...stepResult.missingRequirements);
        }

        if (stepResult.status === "blocked" || stopOnFailure) {
          blocked = stepResult.status === "blocked";
          blockedReason = `Step ${step.stepNumber}: ${stepResult.message}`;
          break;
        }
      }
    } catch (error) {
      const stepResult: FlowStepResult = {
        step,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        elapsedMs: Date.now() - stepStartTime,
      };
      stepResults.push(stepResult);

      if (stopOnFailure) {
        blockedReason = `Step ${step.stepNumber}: ${stepResult.message}`;
        break;
      }
    }
  }

  const success = completedSteps === flow.steps.length;

  return {
    flow,
    success,
    completedSteps,
    totalSteps: flow.steps.length,
    stepResults,
    blockedReason: blocked ? blockedReason : undefined,
    missingRequirements:
      allMissingRequirements.length > 0 ? allMissingRequirements : undefined,
    elapsedMs: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Analyze a flow step failure
 */
function analyzeStepFailure(
  step: FlowStep,
  result: RunnerResult,
  startTime: number
): FlowStepResult {
  const errorMessage = result.error?.message || "Unknown failure";
  const lowerError = errorMessage.toLowerCase();

  // Check for element not found
  const isElementNotFound =
    lowerError.includes("cannot find") ||
    lowerError.includes("element not found") ||
    lowerError.includes("no matching element");

  if (isElementNotFound) {
    const suggestedTestId = inferTestId(step.description);

    return {
      step,
      status: "blocked",
      message: "Element not found - missing testID",
      evidence: {
        screenshots: result.evidence || [],
        logs: result.error?.details,
      },
      missingRequirements: [
        {
          type: "testID",
          elementDescription: step.description,
          suggestedValue: suggestedTestId,
          reason: `Add testID="${suggestedTestId}" for step: "${step.description}"`,
          criterionId: `flow-step-${step.stepNumber}`,
        },
      ],
      elapsedMs: Date.now() - startTime,
    };
  }

  return {
    step,
    status: "fail",
    message: errorMessage,
    evidence: {
      screenshots: result.evidence || [],
      logs: result.error?.details,
    },
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Capture evidence for a flow step
 */
async function captureStepEvidence(
  flowName: string,
  stepNumber: number
): Promise<CheckEvidence | undefined> {
  try {
    const safeName = flowName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const screenshot = await takeScreenshot(`flow-${safeName}-step${stepNumber}`);
    return {
      screenshots: [screenshot.path],
    };
  } catch {
    return undefined;
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
    captureEvidenceOnPass = false,
    timeout = 30000,
  } = options;

  // Check prerequisites
  if (!stateManager.isDetoxReady()) {
    throw createError("DETOX_NOT_READY", "Detox session must be started before running acceptance checks");
  }

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
    passRate: Math.round(passRate * 10) / 10,
    testableRate: Math.round(testableRate * 10) / 10,
  };

  return {
    sectionReports,
    flowResults,
    allMissingRequirements,
    summary,
  };
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
    passRate: Math.round(passRate * 10) / 10,
    testableRate: Math.round(testableRate * 10) / 10,
  };
}
