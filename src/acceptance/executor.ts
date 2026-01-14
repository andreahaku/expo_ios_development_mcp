/**
 * Acceptance Criteria Executor
 * Handles execution of individual criterion checks via Detox
 */

import type {
  AcceptanceCriterion,
  CriterionResult,
  MissingRequirement,
  CheckEvidence,
} from "./types.js";
import type { MappedCheck } from "./mapper.js";
import { inferTestId } from "./parser.js";
import { runDetoxAction, type RunnerResult } from "../detox/runner.js";
import { takeScreenshot } from "../simulator/screenshots.js";

/**
 * Execute a Detox-based check
 */
export async function executeDetoxCheck(
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
export function analyzeDetoxFailure(
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
export function generateMissingRequirements(
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
export async function executeVisualCheck(
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
        message: `Color check requires manual verification. ` +
          `Target color: ${mappedCheck.visualConfig.colorExtraction.targetColor}`,
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
export async function captureSuccessEvidence(
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
