/**
 * Acceptance Criteria Mapper
 * Maps parsed criteria to executable Detox checks
 */

import type {
  AcceptanceCriterion,
  FlowStep,
  ElementSelector,
  CriterionType,
} from "./types.js";
import type { Selector } from "../mcp/schemas.js";

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
  confidence: number;  // 0-1, how confident we are this check will work
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
  const { type, config } = criterion;

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
 * Map element visibility criterion to Detox check
 */
function mapElementVisibilityCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config } = criterion;

  if (!config.selector) {
    return {
      type: "manual",
      criterion,
      manualReason: "Cannot infer element selector from description",
      confidence: 0,
    };
  }

  const selector = toDetoxSelector(config.selector);
  const selectorExpr = selectorToExpression(selector);

  const snippet = `await waitFor(element(${selectorExpr})).toBeVisible().withTimeout(10000);`;

  return {
    type: "detox",
    criterion,
    detoxSnippet: snippet,
    confidence: config.selector.confidence,
  };
}

/**
 * Map text assertion criterion to Detox check
 */
function mapTextAssertionCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config } = criterion;

  if (!config.selector && !config.expectedText) {
    return {
      type: "manual",
      criterion,
      manualReason: "Cannot infer element selector or expected text",
      confidence: 0,
    };
  }

  // If we have expected text but no selector, try to find by text
  const selector = config.selector
    ? toDetoxSelector(config.selector)
    : { by: "text" as const, value: config.expectedText! };

  const selectorExpr = selectorToExpression(selector);
  const escapedText = JSON.stringify(config.expectedText || selector.value);

  let snippet: string;
  if (config.textMatchMode === "contains") {
    snippet = `await expect(element(${selectorExpr})).toHaveText(new RegExp(${escapedText}));`;
  } else {
    snippet = `await expect(element(${selectorExpr})).toHaveText(${escapedText});`;
  }

  return {
    type: "detox",
    criterion,
    detoxSnippet: snippet,
    confidence: config.selector?.confidence ?? 0.5,
  };
}

/**
 * Map color criterion to screenshot analysis check
 */
function mapColorCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config } = criterion;

  if (!config.colorHex) {
    return {
      type: "manual",
      criterion,
      manualReason: "No color specification found",
      confidence: 0,
    };
  }

  // Color checks require screenshot analysis
  return {
    type: "screenshot_analysis",
    criterion,
    visualConfig: {
      colorExtraction: {
        targetColor: config.colorHex,
        tolerance: 10, // Allow some tolerance for anti-aliasing
      },
    },
    confidence: 0.6, // Color checks have moderate confidence
  };
}

/**
 * Map interaction criterion to Detox check
 */
function mapInteractionCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config, description } = criterion;

  if (!config.selector) {
    return {
      type: "manual",
      criterion,
      manualReason: "Cannot infer element selector for interaction",
      confidence: 0,
    };
  }

  const selector = toDetoxSelector(config.selector);
  const selectorExpr = selectorToExpression(selector);

  let snippet: string;
  switch (config.interactionType) {
    case "tap":
      // For "is tappable" checks, we just verify the element exists and tap it
      snippet = `const el = element(${selectorExpr});
      await expect(el).toBeVisible();
      await el.tap();`;
      break;

    case "longPress":
      snippet = `await element(${selectorExpr}).longPress(1000);`;
      break;

    case "swipe":
      const direction = config.swipeDirection || "up";
      snippet = `await element(${selectorExpr}).swipe('${direction}');`;
      break;

    case "scroll":
      snippet = `await element(${selectorExpr}).scroll(200, 'down');`;
      break;

    default:
      // Default to tap for generic interaction checks
      snippet = `await element(${selectorExpr}).tap();`;
  }

  // Check for expected result after interaction
  if (description.toLowerCase().includes("opens")) {
    // After interaction, we might need to verify something opened
    // This would require additional context about what should appear
  }

  return {
    type: "detox",
    criterion,
    detoxSnippet: snippet,
    confidence: config.selector.confidence * 0.9, // Slightly lower due to interaction complexity
  };
}

/**
 * Map modal behavior criterion to Detox check
 */
function mapModalCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config, description } = criterion;
  const lower = description.toLowerCase();

  // Check if this is about modal opening or closing
  const isOpen = /opens?|appears?|shows?|slides?\s*(up|in)/i.test(lower);
  const isClose =
    /closes?|disappears?|hides?|dismiss/i.test(lower);

  if (!config.selector && !isOpen && !isClose) {
    return {
      type: "manual",
      criterion,
      manualReason: "Cannot determine modal behavior to test",
      confidence: 0,
    };
  }

  // For modal checks, we typically verify visibility changes
  if (config.selector) {
    const selector = toDetoxSelector(config.selector);
    const selectorExpr = selectorToExpression(selector);

    let snippet: string;
    if (isClose) {
      snippet = `await waitFor(element(${selectorExpr})).not.toBeVisible().withTimeout(5000);`;
    } else {
      snippet = `await waitFor(element(${selectorExpr})).toBeVisible().withTimeout(5000);`;
    }

    return {
      type: "detox",
      criterion,
      detoxSnippet: snippet,
      confidence: config.selector.confidence * 0.8,
    };
  }

  return {
    type: "manual",
    criterion,
    manualReason: "Modal behavior requires specific element selector",
    confidence: 0,
  };
}

/**
 * Map navigation criterion to check
 */
function mapNavigationCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config, description } = criterion;

  // Navigation checks often need to verify a screen appeared
  // This is similar to element visibility but at screen level
  if (config.selector) {
    const selector = toDetoxSelector(config.selector);
    const selectorExpr = selectorToExpression(selector);

    const snippet = `await waitFor(element(${selectorExpr})).toBeVisible().withTimeout(10000);`;

    return {
      type: "detox",
      criterion,
      detoxSnippet: snippet,
      confidence: config.selector.confidence * 0.7,
    };
  }

  return {
    type: "manual",
    criterion,
    manualReason: "Navigation check requires screen identifier",
    confidence: 0,
  };
}

/**
 * Map scroll behavior criterion to check
 */
function mapScrollCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config, description } = criterion;
  const lower = description.toLowerCase();

  // Scroll behavior is often about smoothness which is hard to test
  // We can at least verify scrolling works
  if (/smooth|responsive|works/i.test(lower)) {
    return {
      type: "manual",
      criterion,
      manualReason: "Scroll smoothness requires manual visual verification",
      confidence: 0,
    };
  }

  if (config.selector) {
    const selector = toDetoxSelector(config.selector);
    const selectorExpr = selectorToExpression(selector);

    const direction = lower.includes("horizontal") ? "right" : "down";
    const snippet = `await element(${selectorExpr}).scroll(100, '${direction}');`;

    return {
      type: "detox",
      criterion,
      detoxSnippet: snippet,
      confidence: config.selector.confidence * 0.6,
    };
  }

  return {
    type: "manual",
    criterion,
    manualReason: "Scroll check requires scrollable element selector",
    confidence: 0,
  };
}

/**
 * Map state change criterion to check
 */
function mapStateChangeCheck(criterion: AcceptanceCriterion): MappedCheck {
  // State changes typically require:
  // 1. Performing an action
  // 2. Verifying the new state
  // This is complex and usually needs manual setup

  return {
    type: "manual",
    criterion,
    manualReason: "State change verification requires multi-step flow",
    confidence: 0,
  };
}

/**
 * Map layout criterion to visual check
 */
function mapLayoutCheck(criterion: AcceptanceCriterion): MappedCheck {
  // Layout checks are best done with visual regression testing
  return {
    type: "visual",
    criterion,
    visualConfig: {
      // Will use full screenshot comparison
    },
    confidence: 0.5,
  };
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
          detoxSnippet = `const input = element(${expr});
      await input.tap();
      await input.clearText();
      await input.typeText(${text});`;
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
 * Convert our ElementSelector to Detox Selector format
 */
function toDetoxSelector(selector: ElementSelector): Selector {
  return {
    by: selector.by,
    value: selector.value,
  };
}

/**
 * Convert selector to Detox expression string
 */
function selectorToExpression(selector: Selector): string {
  const value = JSON.stringify(selector.value);
  switch (selector.by) {
    case "id":
      return `by.id(${value})`;
    case "text":
      return `by.text(${value})`;
    case "label":
      return `by.label(${value})`;
    default:
      return `by.id(${value})`;
  }
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
