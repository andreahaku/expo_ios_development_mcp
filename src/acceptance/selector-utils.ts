/**
 * Selector Utilities
 * Converts internal selectors to Detox-compatible format
 */

import type { ElementSelector } from "./types.js";
import type { Selector } from "../mcp/schemas.js";

/**
 * Convert our ElementSelector to Detox Selector format
 */
export function toDetoxSelector(selector: ElementSelector): Selector {
  return {
    by: selector.by,
    value: selector.value,
  };
}

/**
 * Convert selector to Detox expression string
 */
export function selectorToExpression(selector: Selector): string {
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
