/**
 * Acceptance Criteria Classifier
 * Classifies criterion types and extracts configuration from descriptions
 */

import type {
  CriterionType,
  ElementSelector,
  CheckConfig,
} from "./types.js";

/**
 * Classify criterion type based on description text
 */
export function classifyCriterionType(description: string): CriterionType {
  const lower = description.toLowerCase();

  // Color checks (must check before visible since they often include "is")
  if (
    /#[0-9a-f]{3,6}/i.test(description) ||
    /\b(color|colour)\s+(is|should be)/i.test(lower) ||
    /\b(background|text|border)\s+.*#[0-9a-f]/i.test(lower)
  ) {
    return "element_color";
  }

  // Interaction checks
  if (
    /\b(tap|click|press|swipe|scroll).*(?:opens?|closes?|shows?|hides?|toggles?)/i.test(
      lower
    ) ||
    /\b(tapping|clicking|pressing|swiping|scrolling)\b/i.test(lower) ||
    /\bis\s+tappable\b/i.test(lower) ||
    /\btouch\s+feedback\b/i.test(lower)
  ) {
    return "interaction";
  }

  // Modal/drawer behavior
  if (
    /\b(modal|drawer|sheet|dialog|overlay)\b/i.test(lower) &&
    /\b(opens?|closes?|appears?|disappears?|slides?)\b/i.test(lower)
  ) {
    return "modal";
  }

  // Navigation
  if (
    /\b(navigat|route|screen|page)\b/i.test(lower) &&
    /\b(shows?|displays?|opens?|goes?\s+to)\b/i.test(lower)
  ) {
    return "navigation";
  }

  // Scroll behavior
  if (
    /\b(scroll|scrollable|scrolling)\b/i.test(lower) &&
    /\b(smooth|horizontal|vertical|is)\b/i.test(lower)
  ) {
    return "scroll";
  }

  // State change
  if (
    /\b(updates?|changes?|becomes?|transitions?)\b/i.test(lower) &&
    /\bwhen\b/i.test(lower)
  ) {
    return "state_change";
  }

  // Text content checks
  if (
    /\btext\s+(is|says?|reads?|displays?|shows?)\b/i.test(lower) ||
    /\bshows?\s+(text|message|label)\b/i.test(lower) ||
    /"[^"]+"\s+(text|is displayed|is shown)/i.test(lower)
  ) {
    return "element_text";
  }

  // Layout checks (visual)
  if (
    /\b(layout|positioning|alignment|spacing|padding|margin|gap|width|height)\b/i.test(
      lower
    ) ||
    /\b(left|right|top|bottom|center|middle)\s+(side|of|aligned)/i.test(
      lower
    ) ||
    /\b(side\s+by\s+side|horizontal|vertical)\b/i.test(lower)
  ) {
    return "layout";
  }

  // Element visibility (most common, check last)
  if (
    /\b(is\s+)?(displayed|visible|shown|rendered|appears?)\b/i.test(lower) ||
    /\b(shows?|displays?|has|contains?)\s+(a|an|the)?\s*\w+/i.test(lower) ||
    /\bis\s+available\b/i.test(lower)
  ) {
    return "element_visible";
  }

  // Default to manual if we can't classify
  return "manual";
}

/**
 * Extract check configuration from description
 */
export function extractCheckConfig(description: string): CheckConfig {
  const config: CheckConfig = {};

  // Extract color hex codes
  const colorMatch = description.match(/#([0-9a-fA-F]{3,6})\b/);
  if (colorMatch) {
    config.colorHex = `#${colorMatch[1].toUpperCase()}`;

    // Try to determine color target
    const lower = description.toLowerCase();
    if (/background/i.test(lower)) {
      config.colorTarget = "background";
    } else if (/\btext\b/i.test(lower)) {
      config.colorTarget = "text";
    } else if (/border/i.test(lower)) {
      config.colorTarget = "border";
    } else if (/icon/i.test(lower)) {
      config.colorTarget = "icon";
    }
  }

  // Extract expected text from quotes
  const textMatch = description.match(
    /["']([^"']+)["']\s*(?:text|is displayed|is shown|is visible|appears)/i
  );
  if (textMatch) {
    config.expectedText = textMatch[1];
    config.textMatchMode = "exact";
  } else {
    // Try to find text content in other patterns
    const altTextMatch = description.match(
      /(?:shows?|displays?|says?|reads?)\s+["']([^"']+)["']/i
    );
    if (altTextMatch) {
      config.expectedText = altTextMatch[1];
      config.textMatchMode = "exact";
    }
  }

  // Infer selector
  const selector = inferSelectorFromDescription(description);
  if (selector) {
    config.selector = selector;
  }

  // Extract interaction type
  if (/\btap(ping)?\b/i.test(description)) {
    config.interactionType = "tap";
  } else if (/\blong\s*press/i.test(description)) {
    config.interactionType = "longPress";
  } else if (/\bswipe/i.test(description)) {
    config.interactionType = "swipe";
    if (/\b(left|right|up|down)\b/i.test(description)) {
      const dirMatch = description.match(/\b(left|right|up|down)\b/i);
      if (dirMatch) {
        config.swipeDirection = dirMatch[1].toLowerCase() as
          | "up"
          | "down"
          | "left"
          | "right";
      }
    }
  } else if (/\bscroll/i.test(description)) {
    config.interactionType = "scroll";
  }

  return config;
}

/**
 * Infer element selector from description text
 */
export function inferSelectorFromDescription(
  description: string
): ElementSelector | undefined {
  // Check for explicit testID reference
  const testIdMatch = description.match(
    /\btestID[=:\s]+["']?([a-zA-Z0-9_-]+)["']?/i
  );
  if (testIdMatch) {
    return {
      by: "id",
      value: testIdMatch[1],
      confidence: 1.0,
    };
  }

  // Check for accessibility label reference
  const labelMatch = description.match(
    /\b(?:accessibility\s*label|label)[=:\s]+["']([^"']+)["']/i
  );
  if (labelMatch) {
    return {
      by: "label",
      value: labelMatch[1],
      confidence: 0.95,
    };
  }

  // Check for quoted text that might be a button/label
  const quotedMatch = description.match(
    /["']([^"']+)["']\s*(?:button|text|link|label|tab|option)/i
  );
  if (quotedMatch) {
    return {
      by: "text",
      value: quotedMatch[1],
      confidence: 0.7,
    };
  }

  // Check for "button with text X" pattern
  const buttonTextMatch = description.match(
    /button\s+(?:with\s+)?(?:text\s+)?["']([^"']+)["']/i
  );
  if (buttonTextMatch) {
    return {
      by: "text",
      value: buttonTextMatch[1],
      confidence: 0.75,
    };
  }

  // Check for common element patterns with specific names
  const elementPatterns = [
    {
      pattern: /\b(Login|Sign\s*In|Sign\s*Up|Submit|Cancel|Save|Delete|Edit|Close)\s+button\b/i,
      confidence: 0.6,
    },
    {
      pattern: /\b(email|password|username|search)\s+(?:input\s+)?field\b/i,
      confidence: 0.5,
    },
    { pattern: /\bavatar(?:\s+button)?\b/i, confidence: 0.5 },
    { pattern: /\blogo\b/i, confidence: 0.4 },
  ];

  for (const { pattern, confidence } of elementPatterns) {
    const match = description.match(pattern);
    if (match) {
      const value = match[1] || match[0];
      return {
        by: "text",
        value: value.replace(/\s+/g, " ").trim(),
        confidence,
      };
    }
  }

  return undefined;
}

/**
 * Infer a testID suggestion from criterion description
 */
export function inferTestId(description: string): string {
  // Remove common phrases
  let id = description
    .toLowerCase()
    .replace(
      /is\s+(displayed|visible|shown|rendered|available|tappable).*$/i,
      ""
    )
    .replace(/should\s+(be|have|show|display).*$/i, "")
    .replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+(is|has|shows?|displays?)\s+.+$/, "")
    .trim();

  // Extract key element name
  const elementMatch = id.match(
    /^([\w\s-]+?)(?:\s+(?:button|icon|text|label|field|input|card|container|section))?$/i
  );
  if (elementMatch) {
    id = elementMatch[1];
  }

  // Convert to kebab-case
  return id
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/**
 * Convert string to URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
}
