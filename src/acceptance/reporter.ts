/**
 * Acceptance Criteria Reporter
 * Generates markdown and JSON reports from test results
 */

import { writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { existsSync } from "fs";
import type {
  AcceptanceReport,
  CriterionResult,
  FlowResult,
  FlowStepResult,
  MissingRequirement,
  ReportSummary,
  SectionReport,
  ParsedCriteria,
} from "./types.js";
import { artifactManager } from "../core/artifacts.js";

/**
 * Generate a complete acceptance test report
 */
export function generateReport(
  criteria: ParsedCriteria,
  sectionReports: SectionReport[],
  flowResults: FlowResult[],
  missingRequirements: MissingRequirement[],
  totalDuration: number,
  metadata?: {
    criteriaFile?: string;
    configuration?: string;
    deviceName?: string;
  }
): AcceptanceReport {
  // Calculate overall summary
  const summary = calculateOverallSummary(sectionReports, flowResults);

  return {
    title: criteria.title,
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    summary,
    sections: sectionReports,
    flowResults,
    missingRequirements: deduplicateMissingRequirements(missingRequirements),
    artifacts: {},
    metadata: metadata || {},
  };
}

/**
 * Calculate overall summary from all sections and flows
 */
function calculateOverallSummary(
  sectionReports: SectionReport[],
  flowResults: FlowResult[]
): ReportSummary {
  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let blocked = 0;
  let errors = 0;

  for (const section of sectionReports) {
    total += section.summary.total;
    passed += section.summary.passed;
    failed += section.summary.failed;
    skipped += section.summary.skipped;
    blocked += section.summary.blocked;
    errors += section.summary.errors;
  }

  // Add flow statistics
  for (const flow of flowResults) {
    for (const stepResult of flow.stepResults) {
      total++;
      switch (stepResult.status) {
        case "pass":
          passed++;
          break;
        case "fail":
          failed++;
          break;
        case "skip":
          skipped++;
          break;
        case "blocked":
          blocked++;
          break;
        case "error":
          errors++;
          break;
      }
    }
  }

  const testable = total - skipped;
  const passRate = testable > 0 ? (passed / testable) * 100 : 0;
  const testableRate = total > 0 ? (testable / total) * 100 : 0;

  return {
    total,
    passed,
    failed,
    skipped,
    blocked,
    errors,
    passRate: Math.round(passRate * 10) / 10,
    testableRate: Math.round(testableRate * 10) / 10,
  };
}

/**
 * Deduplicate missing requirements by suggested value
 */
function deduplicateMissingRequirements(
  requirements: MissingRequirement[]
): MissingRequirement[] {
  const seen = new Map<string, MissingRequirement>();

  for (const req of requirements) {
    const key = `${req.type}:${req.suggestedValue}`;
    if (!seen.has(key)) {
      seen.set(key, req);
    }
  }

  return Array.from(seen.values());
}

/**
 * Generate markdown-formatted report
 */
export function generateMarkdownReport(report: AcceptanceReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Acceptance Test Report: ${report.title}`);
  lines.push("");
  lines.push(`**Generated:** ${report.timestamp}`);
  lines.push(`**Duration:** ${formatDuration(report.duration)}`);
  if (report.metadata.deviceName) {
    lines.push(`**Device:** ${report.metadata.deviceName}`);
  }
  if (report.metadata.configuration) {
    lines.push(`**Configuration:** ${report.metadata.configuration}`);
  }
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Passed | ${report.summary.passed} |`);
  lines.push(`| Failed | ${report.summary.failed} |`);
  lines.push(`| Blocked (Missing Requirements) | ${report.summary.blocked} |`);
  lines.push(`| Skipped | ${report.summary.skipped} |`);
  lines.push(`| Errors | ${report.summary.errors} |`);
  lines.push(`| **Total** | **${report.summary.total}** |`);
  lines.push("");
  lines.push(`**Pass Rate:** ${report.summary.passRate}% (of testable criteria)`);
  lines.push(`**Testable Rate:** ${report.summary.testableRate}%`);
  lines.push("");

  // Missing Requirements Section (if any)
  if (report.missingRequirements.length > 0) {
    lines.push("## Missing Requirements for Testability");
    lines.push("");
    lines.push(
      "The following elements need testIDs or accessibility labels to be fully testable:"
    );
    lines.push("");
    lines.push("| Element | Suggested testID | Type | Reason |");
    lines.push("|---------|-----------------|------|--------|");

    for (const req of report.missingRequirements) {
      const desc = truncate(req.elementDescription, 40);
      lines.push(
        `| ${desc} | \`${req.suggestedValue}\` | ${req.type} | ${truncate(req.reason, 50)} |`
      );
    }

    lines.push("");
    lines.push("### How to Fix");
    lines.push("");
    lines.push("Add `testID` prop to React Native components:");
    lines.push("");
    lines.push("```jsx");
    lines.push('// Example fix');
    if (report.missingRequirements[0]) {
      lines.push(
        `<TouchableOpacity testID="${report.missingRequirements[0].suggestedValue}" onPress={...}>`
      );
    } else {
      lines.push('<TouchableOpacity testID="your-element-id" onPress={...}>');
    }
    lines.push("```");
    lines.push("");
  }

  // Results by Section
  lines.push("## Results by Section");
  lines.push("");

  for (const sectionReport of report.sections) {
    const { section, results, summary } = sectionReport;

    lines.push(`### ${section.name} (${summary.passRate}% pass rate)`);
    lines.push("");

    if (results.length === 0) {
      lines.push("_No criteria in this section_");
      lines.push("");
      continue;
    }

    for (const result of results) {
      const statusIcon = getStatusIcon(result.status);
      const statusLabel = getStatusLabel(result.status);
      const desc = truncate(result.criterion.description, 80);

      lines.push(`- ${statusIcon} **${statusLabel}** - ${desc}`);

      if (result.status === "fail" || result.status === "error") {
        lines.push(`  - Error: ${result.message}`);
        if (result.evidence?.screenshots?.length) {
          lines.push(`  - Evidence: \`${result.evidence.screenshots[0]}\``);
        }
      } else if (result.status === "blocked" && result.missingRequirements?.length) {
        const req = result.missingRequirements[0];
        lines.push(`  - Missing: \`testID="${req.suggestedValue}"\``);
      }
    }

    lines.push("");
  }

  // Test Flow Results
  if (report.flowResults.length > 0) {
    lines.push("## Test Flow Results");
    lines.push("");

    for (const flowResult of report.flowResults) {
      const { flow, success, completedSteps, totalSteps, stepResults, blockedReason } =
        flowResult;

      const statusIcon = success ? "[PASS]" : blockedReason ? "[BLOCKED]" : "[FAIL]";
      lines.push(`### ${flow.name} ${statusIcon}`);
      lines.push("");
      lines.push(`**Progress:** ${completedSteps}/${totalSteps} steps completed`);
      lines.push("");

      lines.push("| Step | Status | Details |");
      lines.push("|------|--------|---------|");

      for (const stepResult of stepResults) {
        const statusLabel = getStatusLabel(stepResult.status);
        const desc = truncate(stepResult.step.description, 50);
        let details = "";

        if (stepResult.status === "blocked" && stepResult.missingRequirements?.length) {
          details = `Missing: \`${stepResult.missingRequirements[0].suggestedValue}\``;
        } else if (stepResult.status === "fail" || stepResult.status === "error") {
          details = truncate(stepResult.message, 40);
        }

        lines.push(
          `| ${stepResult.step.stepNumber}. ${desc} | ${statusLabel} | ${details} |`
        );
      }

      lines.push("");

      if (blockedReason) {
        lines.push(`**Flow blocked:** ${blockedReason}`);
        lines.push("");
      }
    }
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push("_Report generated by Acceptance Criteria Testing Tool_");

  return lines.join("\n");
}

/**
 * Generate JSON report
 */
export function generateJsonReport(report: AcceptanceReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Save report to files
 */
export async function saveReport(
  report: AcceptanceReport,
  baseName: string = "acceptance-report"
): Promise<{
  markdownPath: string;
  jsonPath: string;
}> {
  const artifactsDir = await artifactManager.getSessionDir();
  const reportsDir = join(artifactsDir, "reports");

  // Ensure reports directory exists
  if (!existsSync(reportsDir)) {
    await mkdir(reportsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const markdownPath = join(reportsDir, `${baseName}-${timestamp}.md`);
  const jsonPath = join(reportsDir, `${baseName}-${timestamp}.json`);

  // Generate and save markdown
  const markdown = generateMarkdownReport(report);
  await writeFile(markdownPath, markdown, "utf-8");

  // Generate and save JSON
  const json = generateJsonReport(report);
  await writeFile(jsonPath, json, "utf-8");

  // Update report with artifact paths
  report.artifacts.reportPath = markdownPath;
  report.artifacts.jsonPath = jsonPath;
  report.artifacts.screenshotsDir = join(artifactsDir, "screenshots");

  return { markdownPath, jsonPath };
}

/**
 * Generate a summary string for quick display
 */
export function generateSummaryString(report: AcceptanceReport): string {
  const { summary } = report;
  const lines: string[] = [];

  lines.push(`## ${report.title} - Test Results`);
  lines.push("");
  lines.push(`**Pass Rate:** ${summary.passRate}% (${summary.passed}/${summary.total - summary.skipped} testable)`);
  lines.push("");
  lines.push(`- Passed: ${summary.passed}`);
  lines.push(`- Failed: ${summary.failed}`);
  lines.push(`- Blocked: ${summary.blocked}`);
  lines.push(`- Skipped: ${summary.skipped}`);

  if (report.missingRequirements.length > 0) {
    lines.push("");
    lines.push(`**${report.missingRequirements.length} missing testIDs detected**`);
    lines.push("Run with full report to see required changes.");
  }

  return lines.join("\n");
}

/**
 * Get status icon for display
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case "pass":
      return "[x]";
    case "fail":
      return "[ ]";
    case "blocked":
      return "[!]";
    case "skip":
      return "[-]";
    case "error":
      return "[E]";
    default:
      return "[ ]";
  }
}

/**
 * Get status label
 */
function getStatusLabel(status: string): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "fail":
      return "FAIL";
    case "blocked":
      return "BLOCKED";
    case "skip":
      return "SKIP";
    case "error":
      return "ERROR";
    default:
      return "UNKNOWN";
  }
}

/**
 * Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + "...";
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

/**
 * Generate a criterion-level report line
 */
export function formatCriterionResult(result: CriterionResult): string {
  const statusIcon = getStatusIcon(result.status);
  const statusLabel = getStatusLabel(result.status);
  const desc = result.criterion.description;

  let line = `${statusIcon} **${statusLabel}** - ${desc}`;

  if (result.message && result.status !== "pass") {
    line += `\n  - ${result.message}`;
  }

  if (result.missingRequirements?.length) {
    const req = result.missingRequirements[0];
    line += `\n  - Suggested fix: Add testID="${req.suggestedValue}"`;
  }

  return line;
}

/**
 * Generate table of missing requirements for quick reference
 */
export function generateMissingRequirementsTable(
  requirements: MissingRequirement[]
): string {
  if (requirements.length === 0) {
    return "_All tested elements have proper testIDs._";
  }

  const lines: string[] = [];
  lines.push("| Element | Suggested testID |");
  lines.push("|---------|-----------------|");

  for (const req of requirements) {
    lines.push(`| ${truncate(req.elementDescription, 50)} | \`${req.suggestedValue}\` |`);
  }

  return lines.join("\n");
}
