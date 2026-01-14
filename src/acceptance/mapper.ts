/**
 * Acceptance Criteria Mapper
 * Orchestrates mapping of criteria to executable checks
 */

import type {
  AcceptanceCriterion,
  FlowStep,
} from "./types.js";
import type { Selector } from "../mcp/schemas.js";
import { toDetoxSelector, selectorToExpression } from "./selector-utils.js";
import {
  mapElementVisibilityCheck,
  mapTextAssertionCheck,
  mapColorCheck,
  mapInteractionCheck,
  mapModalCheck,
  mapNavigationCheck,
  mapScrollCheck,
  mapStateChangeCheck,
  mapLayoutCheck,
} from "./check-mappers.js";

/**
 * Type of check to execute
 */
export type CheckType = "detox" | "visual" | "screenshot_analysis" | "flow" | "manual";

/**
 * A mapped check ready for execution
 */
export interface MappedCheck {
  type: CheckType;
  criterion: AcceptanceCriterion;
  detoxSnippet?: string;
  visualConfig?: VisualCheckConfig;
  flowSteps?: MappedFlowStep[];
  manualReason?: string;
  confidence: number; // 0-1, how confident we are this check will work
}

/**
 * Configuration for visual checks
 */
export interface VisualCheckConfig {
  captureRegion?: { x: number; y: number; width: number; height: number };
  colorExtraction?: {
    targetColor: string;
    tolerance: number;
  };
  baselineName?: string;
}

/**
 * A mapped flow step ready for execution
 */
export interface MappedFlowStep {
  step: FlowStep;
  detoxSnippet?: string;
  action: string;
  selector?: Selector;
  expectedResult?: string;
}

/**
 * Map a criterion to an executable check
 */
export function mapCriterionToCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { type } = criterion;

  switch (type) {
    case "element_visible":
      return mapElementVisibilityCheck(criterion);

    case "element_text":
      return mapTextAssertionCheck(criterion);

    case "element_color":
      return mapColorCheck(criterion);

    case "interaction":
      return mapInteractionCheck(criterion);

    case "modal":
      return mapModalCheck(criterion);

    case "navigation":
      return mapNavigationCheck(criterion);

    case "scroll":
      return mapScrollCheck(criterion);

    case "state_change":
      return mapStateChangeCheck(criterion);

    case "layout":
      return mapLayoutCheck(criterion);

    default:
      return {
        type: "manual",
        criterion,
        manualReason: `Criterion type "${type}" requires manual verification`,
        confidence: 0,
      };
  }
}

/**
 * Map a flow step to an executable action
 */
export function mapFlowStep(step: FlowStep): MappedFlowStep {
  const { action, description, selector } = step;

  const detoxSelector = selector ? toDetoxSelector(selector) : undefined;
  let detoxSnippet: string | undefined;

  switch (action) {
    case "tap":
      if (detoxSelector) {
        const expr = selectorToExpression(detoxSelector);
        detoxSnippet = `await element(${expr}).tap();`;
      }
      break;

    case "type":
      if (detoxSelector) {
        const expr = selectorToExpression(detoxSelector);
        // Extract text to type from description
        const textMatch = description.match(/["']([^"']+)["']/);
        if (textMatch) {
          const text = JSON.stringify(textMatch[1]);
          detoxSnippet = `const input = element(${expr});\n` +
            `      await input.tap();\n` +
            `      await input.clearText();\n` +
            `      await input.typeText(${text});`;
        }
      }
      break;

    case "verify":
      if (detoxSelector) {
        const expr = selectorToExpression(detoxSelector);
        detoxSnippet = `await expect(element(${expr})).toBeVisible();`;
      }
      break;

    case "wait":
      const timeMatch = description.match(/(\d+)\s*(s|seconds?|ms|milliseconds?)/i);
      if (timeMatch) {
        const time = parseInt(timeMatch[1], 10);
        const unit = timeMatch[2].toLowerCase().startsWith("s") ? 1000 : 1;
        detoxSnippet = `await new Promise(r => setTimeout(r, ${time * unit}));`;
      }
      break;

    case "swipe":
      if (detoxSelector) {
        const expr = selectorToExpression(detoxSelector);
        const dirMatch = description.match(/\b(up|down|left|right)\b/i);
        const direction = dirMatch ? dirMatch[1].toLowerCase() : "up";
        detoxSnippet = `await element(${expr}).swipe('${direction}');`;
      }
      break;
  }

  return {
    step,
    detoxSnippet,
    action: action || "unknown",
    selector: detoxSelector,
    expectedResult: step.expectedResult,
  };
}

/**
 * Estimate overall testability of criteria
 */
export function estimateTestability(criteria: AcceptanceCriterion[]): {
  automatable: number;
  manual: number;
  blocked: number;
  averageConfidence: number;
} {
  let automatable = 0;
  let manual = 0;
  let blocked = 0;
  let totalConfidence = 0;

  for (const criterion of criteria) {
    const mapped = mapCriterionToCheck(criterion);

    if (mapped.type === "manual") {
      if (criterion.type === "manual") {
        manual++;
      } else {
        blocked++; // Was supposed to be automatable but couldn't map
      }
    } else {
      automatable++;
      totalConfidence += mapped.confidence;
    }
  }

  return {
    automatable,
    manual,
    blocked,
    averageConfidence: automatable > 0 ? totalConfidence / automatable : 0,
  };
}
