/**
 * Check Mappers
 * Maps specific criterion types to Detox executable checks
 */

import type { AcceptanceCriterion } from "./types.js";
import type { MappedCheck, VisualCheckConfig } from "./mapper.js";
import { toDetoxSelector, selectorToExpression } from "./selector-utils.js";
import {
  DEFAULT_LONG_PRESS_DURATION_MS,
  DEFAULT_SCROLL_AMOUNT_PX,
  MODAL_VISIBILITY_TIMEOUT_MS,
  INTERACTION_CONFIDENCE_MULTIPLIER,
  MODAL_CONFIDENCE_MULTIPLIER,
} from "./constants.js";

/**
 * Map element visibility criterion to Detox check
 */
export function mapElementVisibilityCheck(criterion: AcceptanceCriterion): MappedCheck {
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
export function mapTextAssertionCheck(criterion: AcceptanceCriterion): MappedCheck {
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
export function mapColorCheck(criterion: AcceptanceCriterion): MappedCheck {
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
export function mapInteractionCheck(criterion: AcceptanceCriterion): MappedCheck {
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
      snippet = `const el = element(${selectorExpr});\n` +
        `      await expect(el).toBeVisible();\n` +
        `      await el.tap();`;
      break;

    case "longPress":
      snippet = `await element(${selectorExpr}).longPress(${DEFAULT_LONG_PRESS_DURATION_MS});`;
      break;

    case "swipe":
      const direction = config.swipeDirection || "up";
      snippet = `await element(${selectorExpr}).swipe('${direction}');`;
      break;

    case "scroll":
      snippet = `await element(${selectorExpr}).scroll(${DEFAULT_SCROLL_AMOUNT_PX}, 'down');`;
      break;

    default:
      // Default to tap for generic interaction checks
      snippet = `await element(${selectorExpr}).tap();`;
  }

  return {
    type: "detox",
    criterion,
    detoxSnippet: snippet,
    confidence: config.selector.confidence * INTERACTION_CONFIDENCE_MULTIPLIER,
  };
}

/**
 * Map modal behavior criterion to Detox check
 */
export function mapModalCheck(criterion: AcceptanceCriterion): MappedCheck {
  const { config, description } = criterion;
  const lower = description.toLowerCase();

  // Check if this is about modal opening or closing
  const isOpen = /opens?|appears?|shows?|slides?\s*(up|in)/i.test(lower);
  const isClose = /closes?|disappears?|hides?|dismiss/i.test(lower);

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
      snippet = `await waitFor(element(${selectorExpr})).not.toBeVisible()` +
        `.withTimeout(${MODAL_VISIBILITY_TIMEOUT_MS});`;
    } else {
      snippet = `await waitFor(element(${selectorExpr})).toBeVisible()` +
        `.withTimeout(${MODAL_VISIBILITY_TIMEOUT_MS});`;
    }

    return {
      type: "detox",
      criterion,
      detoxSnippet: snippet,
      confidence: config.selector.confidence * MODAL_CONFIDENCE_MULTIPLIER,
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
export function mapNavigationCheck(criterion: AcceptanceCriterion): MappedCheck {
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
export function mapScrollCheck(criterion: AcceptanceCriterion): MappedCheck {
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
export function mapStateChangeCheck(criterion: AcceptanceCriterion): MappedCheck {
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
export function mapLayoutCheck(criterion: AcceptanceCriterion): MappedCheck {
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
