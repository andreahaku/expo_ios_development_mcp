/**
 * Acceptance Criteria Parser
 * Parses markdown acceptance criteria files into structured data
 */

import { readFile } from "fs/promises";
import type {
  ParsedCriteria,
  CriteriaSection,
  CriteriaSubsection,
  AcceptanceCriterion,
  TestFlow,
  FlowStep,
  CriterionType,
  ElementSelector,
  CheckConfig,
  ParseOptions,
} from "./types.js";

/**
 * Parse an acceptance criteria markdown file
 */
export async function parseCriteriaFile(
  filePath: string,
  options?: ParseOptions
): Promise<ParsedCriteria> {
  try {
    const content = await readFile(filePath, "utf-8");
    return parseCriteriaContent(content, options);
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      throw new Error(`Acceptance criteria file not found: ${filePath}`);
    }
    throw error;
  }
}

/**
 * Parse acceptance criteria from markdown content
 */
export function parseCriteriaContent(
  content: string,
  options: ParseOptions = {}
): ParsedCriteria {
  const { inferSelectors = true, classifyTypes = true } = options;
  const lines = content.split("\n");

  // Extract title from first H1
  const title = extractTitle(lines);

  // Extract overview
  const overview = extractOverview(content);

  // Extract prerequisites
  const prerequisites = extractPrerequisites(content);

  // Extract sections with criteria
  const sections = extractSections(lines, inferSelectors, classifyTypes);

  // Extract test flows
  const testFlows = extractTestFlows(lines, inferSelectors);

  // Count total criteria
  const totalCriteria = sections.reduce(
    (sum, s) =>
      sum +
      s.criteria.length +
      s.subsections.reduce((ss, sub) => ss + sub.criteria.length, 0),
    0
  );

  return {
    title,
    overview,
    prerequisites,
    sections,
    testFlows,
    totalCriteria,
    rawMarkdown: content,
  };
}

/**
 * Extract title from first H1 heading
 */
function extractTitle(lines: string[]): string {
  for (const line of lines) {
    const match = line.match(/^#\s+(.+)$/);
    if (match) {
      return match[1].trim();
    }
  }
  return "Acceptance Criteria";
}

/**
 * Extract overview section content
 */
function extractOverview(content: string): string | undefined {
  const match = content.match(/##\s*Overview\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extract prerequisites from the Prerequisites section
 */
function extractPrerequisites(content: string): string[] {
  const match = content.match(
    /##\s*Prerequisites\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/i
  );
  if (!match) return [];

  const prereqContent = match[1];
  const prerequisites: string[] = [];

  // Match checkbox items
  const checkboxRegex = /^-\s*\[.\]\s*(.+)$/gm;
  let checkboxMatch;
  while ((checkboxMatch = checkboxRegex.exec(prereqContent)) !== null) {
    prerequisites.push(checkboxMatch[1].trim());
  }

  return prerequisites;
}

/**
 * Extract all sections with their criteria
 */
function extractSections(
  lines: string[],
  inferSelectors: boolean,
  classifyTypes: boolean
): CriteriaSection[] {
  const sections: CriteriaSection[] = [];
  let currentSection: CriteriaSection | null = null;
  let currentSubsection: CriteriaSubsection | null = null;
  let criterionIndex = 0;

  // Skip sections that are meta (Overview, Prerequisites, Test Flows)
  const metaSections = [
    "overview",
    "prerequisites",
    "test flows",
    "test flows summary",
    "sign-off",
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for H2 section header
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      const sectionName = h2Match[1].trim();
      const normalizedName = sectionName.toLowerCase();

      // Skip meta sections
      if (metaSections.some((meta) => normalizedName.includes(meta))) {
        currentSection = null;
        currentSubsection = null;
        continue;
      }

      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }

      currentSection = {
        name: sectionName,
        subsections: [],
        criteria: [],
        lineNumber,
      };
      currentSubsection = null;
      continue;
    }

    // Check for H3 subsection header
    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match && currentSection) {
      const subsectionName = h3Match[1].trim();

      // Skip if this looks like a flow header
      if (/^Flow\s+\d+/i.test(subsectionName)) {
        continue;
      }

      currentSubsection = {
        name: subsectionName,
        criteria: [],
        lineNumber,
      };
      currentSection.subsections.push(currentSubsection);
      continue;
    }

    // Check for checkbox criterion
    const checkboxMatch = line.match(/^-\s*\[(.)\]\s*(.+)$/);
    if (checkboxMatch && currentSection) {
      const isChecked = checkboxMatch[1] !== " ";
      const description = checkboxMatch[2].trim();

      criterionIndex++;
      const sectionSlug = slugify(currentSection.name);
      const id = currentSubsection
        ? `${sectionSlug}-${slugify(currentSubsection.name)}-${criterionIndex}`
        : `${sectionSlug}-${criterionIndex}`;

      const criterion: AcceptanceCriterion = {
        id,
        section: currentSection.name,
        subsection: currentSubsection?.name,
        description,
        type: classifyTypes ? classifyCriterionType(description) : "manual",
        config: inferSelectors ? extractCheckConfig(description) : {},
        lineNumber,
        rawLine: line,
      };

      if (currentSubsection) {
        currentSubsection.criteria.push(criterion);
      } else {
        currentSection.criteria.push(criterion);
      }
    }
  }

  // Don't forget the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extract test flows from the document
 */
function extractTestFlows(
  lines: string[],
  inferSelectors: boolean
): TestFlow[] {
  const flows: TestFlow[] = [];
  let inFlowSection = false;
  let currentFlow: TestFlow | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check if we're entering the Test Flows section
    if (/^##\s*Test Flows/i.test(line)) {
      inFlowSection = true;
      continue;
    }

    // Check if we're leaving the flows section
    if (inFlowSection && /^##\s+/.test(line) && !/Test Flows/i.test(line)) {
      if (currentFlow) {
        flows.push(currentFlow);
        currentFlow = null;
      }
      inFlowSection = false;
      continue;
    }

    if (!inFlowSection) continue;

    // Check for flow header (### Flow N: Name)
    const flowMatch = line.match(/^###\s*(Flow\s*\d+[:\s]+.+)$/i);
    if (flowMatch) {
      if (currentFlow) {
        flows.push(currentFlow);
      }
      currentFlow = {
        name: flowMatch[1].trim(),
        steps: [],
        lineNumber,
      };
      continue;
    }

    // Check for numbered step
    const stepMatch = line.match(/^(\d+)\.\s*(.+)$/);
    if (stepMatch && currentFlow) {
      const stepNumber = parseInt(stepMatch[1], 10);
      const stepDescription = stepMatch[2].trim();

      const step: FlowStep = {
        stepNumber,
        description: stepDescription,
        action: parseStepAction(stepDescription),
        selector: inferSelectors
          ? inferSelectorFromDescription(stepDescription)
          : undefined,
        expectedResult: parseExpectedResult(stepDescription),
        lineNumber,
      };

      currentFlow.steps.push(step);
    }
  }

  // Don't forget the last flow
  if (currentFlow) {
    flows.push(currentFlow);
  }

  return flows;
}

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
    { pattern: /\b(Login|Sign\s*In|Sign\s*Up|Submit|Cancel|Save|Delete|Edit|Close)\s+button\b/i, confidence: 0.6 },
    { pattern: /\b(email|password|username|search)\s+(?:input\s+)?field\b/i, confidence: 0.5 },
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
 * Parse action from a flow step description
 */
function parseStepAction(description: string): string | undefined {
  const lower = description.toLowerCase();

  if (/^(tap|click|press)\b/i.test(lower)) return "tap";
  if (/^(enter|type|input)\b/i.test(lower)) return "type";
  if (/^(swipe|scroll)\b/i.test(lower)) return "swipe";
  if (/^(verify|check|confirm|ensure)\b/i.test(lower)) return "verify";
  if (/^(wait|pause)\b/i.test(lower)) return "wait";
  if (/^(navigate|go\s+to|open)\b/i.test(lower)) return "navigate";
  if (/^(login|sign\s*in)\b/i.test(lower)) return "login";
  if (/^(note|observe)\b/i.test(lower)) return "observe";

  return undefined;
}

/**
 * Parse expected result from step description
 */
function parseExpectedResult(description: string): string | undefined {
  // Look for "Verify X" pattern
  const verifyMatch = description.match(/^verify\s+(.+)$/i);
  if (verifyMatch) {
    return verifyMatch[1].trim();
  }

  // Look for result after action
  const resultPatterns = [
    /should\s+(.+)$/i,
    /(?:to\s+)?(?:see|show|display|open|close)\s+(.+)$/i,
    /(?:is|are)\s+(?:displayed|shown|visible)$/i,
  ];

  for (const pattern of resultPatterns) {
    const match = description.match(pattern);
    if (match) {
      return match[1]?.trim() || match[0].trim();
    }
  }

  return undefined;
}

/**
 * Convert string to URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
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
 * Get statistics about parsed criteria
 */
export function getCriteriaStats(criteria: ParsedCriteria): {
  byType: Record<CriterionType, number>;
  bySection: Record<string, number>;
  automatable: number;
  manual: number;
} {
  const byType: Record<CriterionType, number> = {
    element_visible: 0,
    element_text: 0,
    element_color: 0,
    interaction: 0,
    layout: 0,
    navigation: 0,
    modal: 0,
    scroll: 0,
    state_change: 0,
    flow_step: 0,
    prerequisite: 0,
    manual: 0,
  };

  const bySection: Record<string, number> = {};

  let automatable = 0;
  let manual = 0;

  for (const section of criteria.sections) {
    const sectionTotal =
      section.criteria.length +
      section.subsections.reduce((sum, sub) => sum + sub.criteria.length, 0);
    bySection[section.name] = sectionTotal;

    const allCriteria = [
      ...section.criteria,
      ...section.subsections.flatMap((sub) => sub.criteria),
    ];

    for (const criterion of allCriteria) {
      byType[criterion.type]++;
      if (criterion.type === "manual") {
        manual++;
      } else {
        automatable++;
      }
    }
  }

  return { byType, bySection, automatable, manual };
}
