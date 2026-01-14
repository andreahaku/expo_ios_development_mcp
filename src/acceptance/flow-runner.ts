/**
 * Acceptance Criteria Flow Runner
 * Executes multi-step test flows via Detox
 */

import type {
  FlowStep,
  FlowStepResult,
  FlowResult,
  TestFlow,
  MissingRequirement,
  CheckEvidence,
} from "./types.js";
import { mapFlowStep } from "./mapper.js";
import { inferTestId } from "./parser.js";
import { DEFAULT_FLOW_STEP_TIMEOUT_MS } from "./constants.js";
import { runDetoxAction, type RunnerResult } from "../detox/runner.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import { logger } from "../core/logger.js";

/**
 * Execute a test flow
 */
export async function executeTestFlow(
  flow: TestFlow,
  options: { screenshotEachStep?: boolean; stopOnFailure?: boolean } = {}
): Promise<FlowResult> {
  const startTime = Date.now();
  const { screenshotEachStep = true, stopOnFailure = true } = options;

  try {
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
          timeoutMs: DEFAULT_FLOW_STEP_TIMEOUT_MS,
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
  } catch (error) {
    logger.error("acceptance", `Error executing flow: ${flow.name}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      flow,
      success: false,
      completedSteps: 0,
      totalSteps: flow.steps.length,
      stepResults: [],
      blockedReason: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      elapsedMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Analyze a flow step failure
 */
export function analyzeStepFailure(
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
export async function captureStepEvidence(
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
