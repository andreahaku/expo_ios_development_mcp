/**
 * Acceptance Criteria Extractor
 * Extracts sections, flows, and criteria from markdown content
 */

import type {
  CriteriaSection,
  CriteriaSubsection,
  AcceptanceCriterion,
  TestFlow,
  FlowStep,
} from "./types.js";
import {
  classifyCriterionType,
  extractCheckConfig,
  inferSelectorFromDescription,
  slugify,
} from "./classifier.js";

/**
 * Extract title from first H1 heading
 */
export function extractTitle(lines: string[]): string {
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
export function extractOverview(content: string): string | undefined {
  const match = content.match(/##\s*Overview\s*\n([\s\S]*?)(?=\n##|\n---|\Z)/i);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

/**
 * Extract prerequisites from the Prerequisites section
 */
export function extractPrerequisites(content: string): string[] {
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
export function extractSections(
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
export function extractTestFlows(
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
 * Parse action from a flow step description
 */
export function parseStepAction(description: string): string | undefined {
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
export function parseExpectedResult(description: string): string | undefined {
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
