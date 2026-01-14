/**
 * Type definitions for Acceptance Criteria Testing
 */

/**
 * Type of criterion - determines how it should be tested
 */
export type CriterionType =
  | "element_visible"    // Element should be visible on screen
  | "element_text"       // Element should contain specific text
  | "element_color"      // Element should have specific color
  | "interaction"        // Element should respond to interaction (tap, etc.)
  | "layout"             // Layout/positioning verification (visual)
  | "navigation"         // Navigation between screens
  | "modal"              // Modal/drawer behavior
  | "scroll"             // Scroll behavior
  | "state_change"       // State change after action
  | "flow_step"          // Step within a test flow
  | "prerequisite"       // Prerequisite condition
  | "manual";            // Cannot be automated, needs manual check

/**
 * Selector for identifying UI elements
 */
export interface ElementSelector {
  by: "id" | "text" | "label";
  value: string;
  confidence: number;  // 0-1, how confident we are in this inference
}

/**
 * Configuration extracted from criterion text for execution
 */
export interface CheckConfig {
  // For element checks
  selector?: ElementSelector;

  // For text checks
  expectedText?: string;
  textMatchMode?: "exact" | "contains";

  // For color checks
  colorHex?: string;
  colorTarget?: "background" | "text" | "border" | "icon";

  // For interaction checks
  interactionType?: "tap" | "longPress" | "swipe" | "scroll";
  swipeDirection?: "up" | "down" | "left" | "right";
  expectedResult?: string;

  // For wait/timing
  timeout?: number;
}

/**
 * A single testable criterion from the acceptance criteria file
 */
export interface AcceptanceCriterion {
  id: string;               // Unique identifier (e.g., "section-1-item-3")
  section: string;          // Section name from markdown
  subsection?: string;      // Optional subsection
  description: string;      // Original checkbox text
  type: CriterionType;      // Classified type
  config: CheckConfig;      // Extracted testable properties
  lineNumber: number;       // Source line for reporting
  rawLine: string;          // Original markdown line
}

/**
 * A step within a test flow
 */
export interface FlowStep {
  stepNumber: number;
  description: string;      // Original step text
  action?: string;          // Parsed action (tap, verify, etc.)
  selector?: ElementSelector;
  expectedResult?: string;
  lineNumber: number;
}

/**
 * A complete test flow from the acceptance criteria
 */
export interface TestFlow {
  name: string;             // Flow name (e.g., "Flow 1: View Owner Home")
  description?: string;
  steps: FlowStep[];
  preconditions?: string[];
  lineNumber: number;
}

/**
 * A section of criteria from the markdown
 */
export interface CriteriaSection {
  name: string;
  description?: string;
  subsections: CriteriaSubsection[];
  criteria: AcceptanceCriterion[];
  lineNumber: number;
}

/**
 * A subsection within a section
 */
export interface CriteriaSubsection {
  name: string;
  criteria: AcceptanceCriterion[];
  lineNumber: number;
}

/**
 * Complete parsed acceptance criteria document
 */
export interface ParsedCriteria {
  title: string;
  overview?: string;
  prerequisites: string[];
  sections: CriteriaSection[];
  testFlows: TestFlow[];
  totalCriteria: number;
  rawMarkdown: string;
}

/**
 * What's missing to make a criterion testable
 */
export interface MissingRequirement {
  type: "testID" | "accessibilityLabel" | "accessibilityHint";
  elementDescription: string;
  suggestedValue: string;
  codeLocation?: string;    // Hint about where to add it
  reason: string;           // Why this is needed
  criterionId: string;      // Which criterion needs this
}

/**
 * Result status for a criterion check
 */
export type CriterionStatus = "pass" | "fail" | "skip" | "blocked" | "error";

/**
 * Evidence collected during a check
 */
export interface CheckEvidence {
  screenshots: string[];
  logs?: string;
  actualValue?: string;     // What was actually found
  expectedValue?: string;   // What was expected
}

/**
 * Result of checking a single criterion
 */
export interface CriterionResult {
  criterion: AcceptanceCriterion;
  status: CriterionStatus;
  message: string;
  evidence?: CheckEvidence;
  missingRequirements?: MissingRequirement[];
  elapsedMs: number;
  timestamp: string;
}

/**
 * Result of executing a test flow
 */
export interface FlowResult {
  flow: TestFlow;
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  stepResults: FlowStepResult[];
  blockedReason?: string;
  missingRequirements?: MissingRequirement[];
  evidence?: CheckEvidence;
  elapsedMs: number;
  timestamp: string;
}

/**
 * Result of a single flow step
 */
export interface FlowStepResult {
  step: FlowStep;
  status: CriterionStatus;
  message: string;
  evidence?: CheckEvidence;
  missingRequirements?: MissingRequirement[];
  elapsedMs: number;
}

/**
 * Summary statistics for a report
 */
export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  errors: number;
  passRate: number;         // Percentage 0-100
  testableRate: number;     // Percentage of non-blocked criteria
}

/**
 * Report for a single section
 */
export interface SectionReport {
  section: CriteriaSection;
  results: CriterionResult[];
  summary: ReportSummary;
}

/**
 * Complete acceptance test report
 */
export interface AcceptanceReport {
  title: string;
  timestamp: string;
  duration: number;         // Total elapsed milliseconds
  summary: ReportSummary;
  sections: SectionReport[];
  flowResults: FlowResult[];
  missingRequirements: MissingRequirement[];  // Aggregated from all blocked items
  artifacts: {
    reportPath?: string;
    screenshotsDir?: string;
    jsonPath?: string;
  };
  metadata: {
    criteriaFile?: string;
    configuration?: string;
    deviceName?: string;
  };
}

/**
 * Options for running acceptance tests
 */
export interface AcceptanceRunOptions {
  stopOnFailure?: boolean;
  sections?: string[];           // Filter to specific sections
  skipFlows?: boolean;           // Skip flow tests
  skipManual?: boolean;          // Skip manual criteria (default: true)
  captureEvidenceOnPass?: boolean;
  timeout?: number;              // Per-criterion timeout in ms
}

/**
 * Options for parsing acceptance criteria
 */
export interface ParseOptions {
  inferSelectors?: boolean;      // Try to infer selectors from descriptions
  classifyTypes?: boolean;       // Classify criterion types
}
