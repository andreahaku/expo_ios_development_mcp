/**
 * Acceptance Criteria Testing Module
 *
 * Provides tools to parse, test, and report on acceptance criteria
 * defined in markdown format.
 */

// Export types
export type {
  CriterionType,
  ElementSelector,
  CheckConfig,
  AcceptanceCriterion,
  FlowStep,
  TestFlow,
  CriteriaSection,
  CriteriaSubsection,
  ParsedCriteria,
  MissingRequirement,
  CriterionStatus,
  CheckEvidence,
  CriterionResult,
  FlowResult,
  FlowStepResult,
  ReportSummary,
  SectionReport,
  AcceptanceReport,
  AcceptanceRunOptions,
  ParseOptions,
} from "./types.js";

// Export parser functions
export {
  parseCriteriaFile,
  parseCriteriaContent,
  classifyCriterionType,
  extractCheckConfig,
  inferSelectorFromDescription,
  inferTestId,
  getCriteriaStats,
} from "./parser.js";

// Export mapper functions
export {
  mapCriterionToCheck,
  mapFlowStep,
  estimateTestability,
  type MappedCheck,
  type MappedFlowStep,
  type CheckType,
  type VisualCheckConfig,
} from "./mapper.js";

// Export checker functions
export {
  executeCriterionCheck,
  executeTestFlow,
  runAcceptanceChecks,
} from "./checker.js";

// Export reporter functions
export {
  generateReport,
  generateMarkdownReport,
  generateJsonReport,
  generateSummaryString,
  saveReport,
  formatCriterionResult,
  generateMissingRequirementsTable,
} from "./reporter.js";
