/**
 * Flow Runner - Execute sequences of MCP tool calls
 */

import { logger } from "../core/logger.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import type { FlowStep } from "../mcp/schemas.js";

export interface FlowResult {
  success: boolean;
  totalSteps: number;
  completedSteps: number;
  failedStep?: number;
  results: StepResult[];
  totalElapsedMs: number;
  evidence?: string[];
}

export interface StepResult {
  step: number;
  tool: string;
  success: boolean;
  elapsedMs: number;
  result?: unknown;
  error?: string;
}

export type ToolExecutor = (
  toolName: string,
  input: Record<string, unknown>
) => Promise<{ success: boolean; result?: unknown; error?: string }>;

export async function runFlow(
  steps: FlowStep[],
  executor: ToolExecutor,
  options: {
    stopOnError?: boolean;
    screenshotOnError?: boolean;
  } = {}
): Promise<FlowResult> {
  const { stopOnError = true, screenshotOnError = true } = options;
  const startTime = Date.now();
  const results: StepResult[] = [];
  const evidence: string[] = [];

  logger.info("expo", `Starting flow with ${steps.length} steps`);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepNumber = i + 1;
    const stepStart = Date.now();

    logger.info("expo", `Step ${stepNumber}/${steps.length}: ${step.tool}`, {
      description: step.description,
    });

    try {
      const { success, result, error } = await executor(
        step.tool,
        step.input as Record<string, unknown>
      );

      const stepResult: StepResult = {
        step: stepNumber,
        tool: step.tool,
        success,
        elapsedMs: Date.now() - stepStart,
        result,
        error,
      };

      results.push(stepResult);

      if (!success) {
        logger.error("expo", `Step ${stepNumber} failed: ${error}`);

        if (screenshotOnError) {
          try {
            const screenshot = await takeScreenshot(`flow-error-step-${stepNumber}`);
            evidence.push(screenshot.path);
          } catch {
            logger.warn("expo", "Failed to capture error screenshot");
          }
        }

        if (stopOnError) {
          return {
            success: false,
            totalSteps: steps.length,
            completedSteps: stepNumber - 1,
            failedStep: stepNumber,
            results,
            totalElapsedMs: Date.now() - startTime,
            evidence: evidence.length > 0 ? evidence : undefined,
          };
        }
      } else {
        logger.info("expo", `Step ${stepNumber} completed in ${stepResult.elapsedMs}ms`);
      }
    } catch (err) {
      const stepResult: StepResult = {
        step: stepNumber,
        tool: step.tool,
        success: false,
        elapsedMs: Date.now() - stepStart,
        error: err instanceof Error ? err.message : "Unknown error",
      };

      results.push(stepResult);

      if (screenshotOnError) {
        try {
          const screenshot = await takeScreenshot(`flow-error-step-${stepNumber}`);
          evidence.push(screenshot.path);
        } catch {
          // Ignore screenshot errors
        }
      }

      if (stopOnError) {
        return {
          success: false,
          totalSteps: steps.length,
          completedSteps: stepNumber - 1,
          failedStep: stepNumber,
          results,
          totalElapsedMs: Date.now() - startTime,
          evidence: evidence.length > 0 ? evidence : undefined,
        };
      }
    }
  }

  const allSuccess = results.every((r) => r.success);

  logger.info("expo", `Flow completed: ${allSuccess ? "SUCCESS" : "FAILED"}`, {
    totalSteps: steps.length,
    completedSteps: results.filter((r) => r.success).length,
    totalElapsedMs: Date.now() - startTime,
  });

  return {
    success: allSuccess,
    totalSteps: steps.length,
    completedSteps: results.filter((r) => r.success).length,
    failedStep: allSuccess ? undefined : results.findIndex((r) => !r.success) + 1,
    results,
    totalElapsedMs: Date.now() - startTime,
    evidence: evidence.length > 0 ? evidence : undefined,
  };
}
