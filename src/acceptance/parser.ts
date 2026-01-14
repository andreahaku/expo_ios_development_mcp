/**
 * Acceptance Criteria Parser
 * Parses markdown acceptance criteria files into structured data
 */

import { readFile } from "fs/promises";
import type {
  ParsedCriteria,
  CriterionType,
  ParseOptions,
} from "./types.js";
import {
  extractTitle,
  extractOverview,
  extractPrerequisites,
  extractSections,
  extractTestFlows,
} from "./extractor.js";

// Re-export classification functions for external consumers
export {
  classifyCriterionType,
  extractCheckConfig,
  inferSelectorFromDescription,
  inferTestId,
} from "./classifier.js";

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
