/**
 * Zod schemas for MCP tool inputs and outputs
 */

import { z } from "zod";

// Common schemas
export const SelectorSchema = z.object({
  by: z.enum(["id", "text", "label"]),
  value: z.string(),
});

export const DirectionSchema = z.enum(["up", "down", "left", "right"]);

// Simulator tool schemas
export const SimulatorBootInputSchema = z.object({
  device: z.string().optional().describe("Device name or UDID. Defaults to config defaultDeviceName."),
});

export const SimulatorShutdownInputSchema = z.object({
  device: z.string().optional().describe("Device name or UDID. If not specified, shuts down the booted device."),
});

export const SimulatorEraseInputSchema = z.object({
  device: z.string().describe("Device name or UDID to erase."),
});

export const SimulatorScreenshotInputSchema = z.object({
  name: z.string().optional().default("screenshot").describe("Name prefix for the screenshot file."),
});

export const VideoRecordingInputSchema = z.object({
  name: z.string().optional().default("recording").describe("Name prefix for the video file."),
});

// Expo tool schemas
export const ExpoStartInputSchema = z.object({
  clearCache: z.boolean().optional().default(false).describe("Clear Metro cache before starting."),
});

export const ExpoLogsTailInputSchema = z.object({
  lines: z.number().optional().default(100).describe("Number of log lines to return."),
});

// Detox session schemas
export const DetoxSessionStartInputSchema = z.object({
  configuration: z.string().optional().describe("Detox configuration name. Defaults to config value."),
  reuse: z.boolean().optional().default(true).describe("Reuse existing session if available."),
});

// UI action schemas
export const UiTapInputSchema = z.object({
  selector: SelectorSchema.describe("Element selector."),
  x: z.number().optional().describe("X offset from element center."),
  y: z.number().optional().describe("Y offset from element center."),
});

export const UiLongPressInputSchema = z.object({
  selector: SelectorSchema.describe("Element selector."),
  duration: z.number().optional().default(1000).describe("Press duration in milliseconds."),
});

export const UiSwipeInputSchema = z.object({
  selector: SelectorSchema.describe("Element selector to swipe on."),
  direction: DirectionSchema.describe("Swipe direction."),
  speed: z.enum(["fast", "slow"]).optional().default("fast").describe("Swipe speed."),
  percentage: z.number().min(0).max(1).optional().default(0.75).describe("Swipe distance as percentage of element."),
});

export const UiScrollInputSchema = z.object({
  selector: SelectorSchema.describe("Scrollable element selector."),
  direction: DirectionSchema.describe("Scroll direction."),
  amount: z.number().optional().default(200).describe("Scroll amount in pixels."),
});

export const UiTypeInputSchema = z.object({
  selector: SelectorSchema.describe("Input element selector."),
  text: z.string().describe("Text to type."),
  replace: z.boolean().optional().default(true).describe("Clear existing text before typing."),
});

export const UiPressKeyInputSchema = z.object({
  key: z.enum(["return", "backspace", "delete"]).describe("Key to press."),
});

export const UiWaitForInputSchema = z.object({
  selector: SelectorSchema.describe("Element selector to wait for."),
  visible: z.boolean().optional().default(true).describe("Wait for visibility (true) or existence (false)."),
  timeout: z.number().optional().default(30000).describe("Timeout in milliseconds."),
});

export const UiAssertTextInputSchema = z.object({
  selector: SelectorSchema.describe("Element selector."),
  text: z.string().describe("Expected text content."),
  exact: z.boolean().optional().default(true).describe("Exact match (true) or contains (false)."),
});

// Visual comparison schemas
export const VisualBaselineSaveInputSchema = z.object({
  name: z.string().describe("Baseline image name."),
});

export const VisualCompareInputSchema = z.object({
  name: z.string().describe("Baseline name to compare against."),
  threshold: z.number().min(0).max(1).optional().describe("Mismatch threshold (0-1). Defaults to config value."),
});

// Design comparison schema
export const VisualCompareToDesignInputSchema = z.object({
  designImage: z.string().describe("Base64 encoded design image (from pasted Figma screenshot)."),
  name: z.string().optional().describe("Name for organizing artifacts."),
  threshold: z.number().min(0).max(1).optional().default(0.05).describe("Mismatch threshold (0-1). Default 0.05 for design comparison."),
  region: z.object({
    x: z.number().describe("X coordinate of region."),
    y: z.number().describe("Y coordinate of region."),
    width: z.number().describe("Width of region."),
    height: z.number().describe("Height of region."),
  }).optional().describe("Optional region to compare (crop screenshot to specific area)."),
  resizeStrategy: z.enum(["design", "actual", "none"]).optional().default("actual").describe("How to handle size differences: resize to design size, actual size, or fail."),
});

// Flow runner schemas
export const FlowStepSchema = z.object({
  tool: z.string().describe("Tool name to execute."),
  input: z.record(z.unknown()).describe("Tool input parameters."),
  description: z.string().optional().describe("Step description for logging."),
});

export const FlowRunInputSchema = z.object({
  steps: z.array(FlowStepSchema).describe("Steps to execute in sequence."),
  stopOnError: z.boolean().optional().default(true).describe("Stop flow on first error."),
});

// Acceptance criteria schemas
export const AcceptanceParseInputSchema = z.object({
  filePath: z.string().optional().describe("Path to acceptance criteria markdown file."),
  content: z.string().optional().describe("Markdown content to parse (alternative to filePath)."),
});

export const AcceptanceRunInputSchema = z.object({
  filePath: z.string().optional().describe("Path to acceptance criteria markdown file."),
  content: z.string().optional().describe("Markdown content to test against."),
  stopOnFailure: z.boolean().optional().default(false).describe("Stop testing on first failure."),
  sections: z.array(z.string()).optional().describe("Specific sections to test (omit for all)."),
  skipFlows: z.boolean().optional().default(false).describe("Skip test flow execution."),
  skipManual: z.boolean().optional().default(true).describe("Skip manual verification criteria."),
  captureEvidenceOnPass: z.boolean().optional().default(false).describe("Capture screenshots for passing tests."),
  timeout: z.number().optional().default(30000).describe("Timeout per criterion in milliseconds."),
});

export const AcceptanceRunFlowInputSchema = z.object({
  filePath: z.string().optional().describe("Path to acceptance criteria file."),
  content: z.string().optional().describe("Markdown content."),
  flowName: z.string().describe("Name of the test flow to execute."),
  screenshotEachStep: z.boolean().optional().default(true).describe("Capture screenshot after each step."),
});

export const AcceptanceCheckInputSchema = z.object({
  filePath: z.string().optional().describe("Path to acceptance criteria file."),
  content: z.string().optional().describe("Markdown content."),
  criterionId: z.string().optional().describe("Criterion ID to check."),
  description: z.string().optional().describe("Criterion description to match (partial match)."),
});

// Type exports
export type Selector = z.infer<typeof SelectorSchema>;
export type Direction = z.infer<typeof DirectionSchema>;
export type UiTapInput = z.infer<typeof UiTapInputSchema>;
export type UiTypeInput = z.infer<typeof UiTypeInputSchema>;
export type UiSwipeInput = z.infer<typeof UiSwipeInputSchema>;
export type UiWaitForInput = z.infer<typeof UiWaitForInputSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type AcceptanceParseInput = z.infer<typeof AcceptanceParseInputSchema>;
export type AcceptanceRunInput = z.infer<typeof AcceptanceRunInputSchema>;
export type AcceptanceRunFlowInput = z.infer<typeof AcceptanceRunFlowInputSchema>;
export type AcceptanceCheckInput = z.infer<typeof AcceptanceCheckInputSchema>;
