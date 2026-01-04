/**
 * Detox selector mapping
 * Converts MCP selector format to Detox matcher expressions
 */

import type { Selector } from "../mcp/schemas.js";

export type SelectorType = "id" | "text" | "label";

export function selectorToDetoxExpr(selector: Selector): string {
  switch (selector.by) {
    case "id":
      return `by.id(${JSON.stringify(selector.value)})`;
    case "text":
      return `by.text(${JSON.stringify(selector.value)})`;
    case "label":
      return `by.label(${JSON.stringify(selector.value)})`;
    default:
      throw new Error(`Unsupported selector type: ${(selector as Selector).by}`);
  }
}

export function describeSelector(selector: Selector): string {
  return `${selector.by}="${selector.value}"`;
}

/**
 * Build a Detox element expression with optional index
 */
export function buildElementExpr(selector: Selector, index?: number): string {
  const matcher = selectorToDetoxExpr(selector);
  if (index !== undefined) {
    return `element(${matcher}).atIndex(${index})`;
  }
  return `element(${matcher})`;
}

/**
 * Supported matcher modifiers
 */
export interface MatcherModifiers {
  index?: number;
  ancestor?: Selector;
  descendant?: Selector;
}

export function buildMatcherWithModifiers(
  selector: Selector,
  modifiers?: MatcherModifiers
): string {
  let matcher = selectorToDetoxExpr(selector);

  if (modifiers?.ancestor) {
    matcher = `${matcher}.withAncestor(${selectorToDetoxExpr(modifiers.ancestor)})`;
  }

  if (modifiers?.descendant) {
    matcher = `${matcher}.withDescendant(${selectorToDetoxExpr(modifiers.descendant)})`;
  }

  return matcher;
}
