/**
 * MCP Server implementation with tool registry
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateManager } from "../core/state.js";
import { logger } from "../core/logger.js";
import { artifactManager } from "../core/artifacts.js";
import { McpOperationError, createError } from "../core/errors.js";
import { getConfig, hasConfig } from "../config/load.js";

// Import simulator modules
import { listDevices, bootDevice, shutdownDevice, eraseDevice, getBootedDevice } from "../simulator/devices.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import { startVideoRecording, stopVideoRecording, getVideoRecordingStatus } from "../simulator/video.js";
import { startLogStream, stopLogStream, getSimulatorLogs } from "../simulator/logs.js";

// Import Expo modules
import { startExpo, stopExpo, getExpoStatus, getExpoLogsTail, reloadApp } from "../expo/expo.js";
import { runFlow, type ToolExecutor } from "../expo/flow.js";

// Import Detox modules
import { startDetoxSession, stopDetoxSession, healthCheck, runDetoxAction } from "../detox/runner.js";
import {
  generateTapSnippet,
  generateLongPressSnippet,
  generateSwipeSnippet,
  generateScrollSnippet,
  generateTypeSnippet,
  generatePressKeySnippet,
  generateWaitForSnippet,
  generateAssertTextSnippet,
  generateAssertVisibleSnippet,
} from "../detox/actions.js";
import { describeSelector } from "../detox/selectors.js";

// Import schemas
import {
  SimulatorBootInputSchema,
  SimulatorShutdownInputSchema,
  SimulatorEraseInputSchema,
  SimulatorScreenshotInputSchema,
  VideoRecordingInputSchema,
  ExpoLogsTailInputSchema,
  DetoxSessionStartInputSchema,
  UiTapInputSchema,
  UiLongPressInputSchema,
  UiSwipeInputSchema,
  UiScrollInputSchema,
  UiTypeInputSchema,
  UiPressKeyInputSchema,
  UiWaitForInputSchema,
  UiAssertTextInputSchema,
  ExpoStartInputSchema,
  FlowRunInputSchema,
  VisualBaselineSaveInputSchema,
  VisualCompareInputSchema,
  VisualCompareToDesignInputSchema,
  AcceptanceParseInputSchema,
  AcceptanceRunInputSchema,
  AcceptanceRunFlowInputSchema,
  AcceptanceCheckInputSchema,
} from "./schemas.js";

// Import visual modules
import { saveBaseline, listBaselines, deleteBaseline, baselineExists } from "../visual/baseline.js";
import { compareWithBaseline, generateDiffReport } from "../visual/diff.js";
import { compareToDesign, generateDesignReport } from "../visual/design.js";

// Import acceptance modules
import {
  parseCriteriaFile,
  parseCriteriaContent,
  runAcceptanceChecks,
  executeTestFlow,
  executeCriterionCheck,
  generateReport,
  generateMarkdownReport,
  generateSummaryString,
  saveReport,
  getCriteriaStats,
  DEFAULT_CRITERION_TIMEOUT_MS,
} from "../acceptance/index.js";

// Import hardening modules
import { lockManager, withLock } from "../core/lock.js";
import { registerPrompts } from "./prompts.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "expo-ios-detox",
    version: "0.1.0",
  });

  // === SIMULATOR TOOLS ===

  server.tool(
    "simulator.list_devices",
    "List all available iOS simulator devices and their states",
    {},
    async () => {
      try {
        const result = await listDevices();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.boot",
    "Boot an iOS simulator device",
    SimulatorBootInputSchema.shape,
    async (args) => {
      try {
        const device = args.device ?? (hasConfig() ? getConfig().defaultDeviceName : "iPhone 15");
        const result = await withLock("simulator", "boot", async () => {
          return bootDevice(device);
        }, { timeoutMs: 120000 });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                device: result,
                state: stateManager.getSimulator(),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.shutdown",
    "Shut down an iOS simulator device",
    SimulatorShutdownInputSchema.shape,
    async (args) => {
      try {
        const device = args.device ?? stateManager.getSimulator().udid;
        if (!device) {
          const booted = await getBootedDevice();
          if (!booted) {
            return {
              content: [{ type: "text", text: JSON.stringify({ success: true, message: "No simulator is running" }) }],
            };
          }
          await shutdownDevice(booted.udid);
        } else {
          await shutdownDevice(device);
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, state: stateManager.getSimulator() }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.erase",
    "Erase all content and settings from a simulator (factory reset)",
    SimulatorEraseInputSchema.shape,
    async (args) => {
      try {
        await eraseDevice(args.device);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: `Device ${args.device} erased` }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.screenshot",
    "Take a screenshot of the booted simulator",
    SimulatorScreenshotInputSchema.shape,
    async (args) => {
      try {
        const result = await takeScreenshot(args.name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.record_video.start",
    "Start recording video of the simulator screen",
    VideoRecordingInputSchema.shape,
    async (args) => {
      try {
        const result = await startVideoRecording(args.name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.record_video.stop",
    "Stop video recording and save the file",
    {},
    async () => {
      try {
        const result = await stopVideoRecording();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.log_stream.start",
    "Start streaming simulator system logs",
    {},
    async () => {
      try {
        const result = await startLogStream();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "simulator.log_stream.stop",
    "Stop streaming simulator system logs",
    {},
    async () => {
      try {
        await stopLogStream();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: "Log stream stopped" }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === EXPO TOOLS ===

  server.tool(
    "expo.start",
    "Start the Expo/Metro development server",
    ExpoStartInputSchema.shape,
    async (args) => {
      try {
        const result = await startExpo({
          clearCache: args.clearCache,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "expo.stop",
    "Stop the Expo/Metro development server",
    {},
    async () => {
      try {
        await stopExpo();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: "Expo stopped" }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "expo.status",
    "Get the current status of Expo/Metro",
    {},
    async () => {
      try {
        const status = getExpoStatus();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(status, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "expo.logs.tail",
    "Get recent Expo/Metro logs",
    ExpoLogsTailInputSchema.shape,
    async (args) => {
      try {
        const logs = getExpoLogsTail(args.lines);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(logs, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "expo.reload",
    "Reload the app in the simulator",
    {},
    async () => {
      try {
        await reloadApp();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: "App reload triggered" }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === DETOX SESSION TOOLS ===

  server.tool(
    "detox.session.start",
    "Start a Detox testing session. Required before running UI actions.",
    DetoxSessionStartInputSchema.shape,
    async (args) => {
      try {
        const result = await startDetoxSession(args.configuration);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "detox.session.stop",
    "Stop the current Detox testing session",
    {},
    async () => {
      try {
        await stopDetoxSession();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: "Detox session stopped" }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "detox.healthcheck",
    "Check if Detox session is ready",
    {},
    async () => {
      try {
        const result = await healthCheck();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === UI TOOLS (via Detox) ===

  server.tool(
    "ui.tap",
    "Tap on an element identified by selector",
    UiTapInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateTapSnippet({
          selector: args.selector,
          x: args.x,
          y: args.y,
        });
        const result = await runDetoxAction({
          actionName: `tap:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.long_press",
    "Long press on an element",
    UiLongPressInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateLongPressSnippet({
          selector: args.selector,
          duration: args.duration,
        });
        const result = await runDetoxAction({
          actionName: `longPress:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.swipe",
    "Swipe on an element in a direction",
    UiSwipeInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateSwipeSnippet({
          selector: args.selector,
          direction: args.direction,
          speed: args.speed,
          percentage: args.percentage,
        });
        const result = await runDetoxAction({
          actionName: `swipe:${args.direction}:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.scroll",
    "Scroll within a scrollable element",
    UiScrollInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateScrollSnippet({
          selector: args.selector,
          direction: args.direction,
          amount: args.amount,
        });
        const result = await runDetoxAction({
          actionName: `scroll:${args.direction}:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.type",
    "Type text into an input element",
    UiTypeInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateTypeSnippet({
          selector: args.selector,
          text: args.text,
          replace: args.replace,
        });
        const result = await runDetoxAction({
          actionName: `type:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.press_key",
    "Press a special key (return, backspace, delete)",
    UiPressKeyInputSchema.shape,
    async (args) => {
      try {
        const snippet = generatePressKeySnippet(args.key);
        const result = await runDetoxAction({
          actionName: `pressKey:${args.key}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.wait_for",
    "Wait for an element to be visible or exist",
    UiWaitForInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateWaitForSnippet({
          selector: args.selector,
          visible: args.visible,
          timeout: args.timeout,
        });
        const result = await runDetoxAction({
          actionName: `waitFor:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
          timeoutMs: (args.timeout ?? 30000) + 5000, // Add buffer
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.assert_text",
    "Assert that an element has specific text content",
    UiAssertTextInputSchema.shape,
    async (args) => {
      try {
        const snippet = generateAssertTextSnippet({
          selector: args.selector,
          text: args.text,
          exact: args.exact,
        });
        const result = await runDetoxAction({
          actionName: `assertText:${describeSelector(args.selector)}`,
          actionSnippet: snippet,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "ui.screenshot",
    "Take a screenshot of the current UI state (via simctl)",
    SimulatorScreenshotInputSchema.shape,
    async (args) => {
      try {
        const result = await takeScreenshot(args.name ?? "ui-screenshot");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === FLOW RUNNER ===

  // Tool executor for flow.run - maps tool names to implementations
  const toolExecutor: ToolExecutor = async (toolName, input) => {
    // This is a simplified executor - in production you might want to
    // route through the actual MCP tool handlers
    try {
      switch (toolName) {
        case "ui.tap":
          const tapSnippet = generateTapSnippet({
            selector: input.selector as { by: "id" | "text" | "label"; value: string },
            x: input.x as number | undefined,
            y: input.y as number | undefined,
          });
          const tapResult = await runDetoxAction({
            actionName: `tap:${(input.selector as { value: string }).value}`,
            actionSnippet: tapSnippet,
          });
          return { success: tapResult.success, result: tapResult, error: tapResult.error?.message };

        case "ui.type":
          const typeSnippet = generateTypeSnippet({
            selector: input.selector as { by: "id" | "text" | "label"; value: string },
            text: input.text as string,
            replace: input.replace as boolean | undefined,
          });
          const typeResult = await runDetoxAction({
            actionName: `type:${(input.selector as { value: string }).value}`,
            actionSnippet: typeSnippet,
          });
          return { success: typeResult.success, result: typeResult, error: typeResult.error?.message };

        case "ui.wait_for":
          const waitSnippet = generateWaitForSnippet({
            selector: input.selector as { by: "id" | "text" | "label"; value: string },
            visible: input.visible as boolean | undefined,
            timeout: input.timeout as number | undefined,
          });
          const waitResult = await runDetoxAction({
            actionName: `waitFor:${(input.selector as { value: string }).value}`,
            actionSnippet: waitSnippet,
          });
          return { success: waitResult.success, result: waitResult, error: waitResult.error?.message };

        case "simulator.screenshot":
          const screenshot = await takeScreenshot(input.name as string | undefined);
          return { success: true, result: screenshot };

        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  server.tool(
    "flow.run",
    "Execute a sequence of tool calls (macro flow)",
    FlowRunInputSchema.shape,
    async (args) => {
      try {
        const result = await runFlow(args.steps, toolExecutor, {
          stopOnError: args.stopOnError,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === VISUAL REGRESSION TOOLS ===

  server.tool(
    "visual.baseline.save",
    "Save a new baseline screenshot for visual regression testing",
    {
      ...VisualBaselineSaveInputSchema.shape,
      overwrite: z.boolean().optional().default(false).describe("Overwrite existing baseline if it exists."),
    },
    async (args) => {
      try {
        const result = await saveBaseline(args.name, { overwrite: args.overwrite });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "visual.baseline.list",
    "List all saved baselines for the current configuration",
    {},
    async () => {
      try {
        const baselines = listBaselines();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(baselines, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "visual.baseline.delete",
    "Delete a saved baseline",
    VisualBaselineSaveInputSchema.shape,
    async (args) => {
      try {
        deleteBaseline(args.name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, message: `Baseline '${args.name}' deleted` }),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "visual.compare",
    "Compare current screenshot against a saved baseline",
    VisualCompareInputSchema.shape,
    async (args) => {
      try {
        const result = await compareWithBaseline(args.name, {
          threshold: args.threshold,
        });

        // Generate markdown report for context
        const report = generateDiffReport(result);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
            {
              type: "text",
              text: `\n---\n${report}`,
            },
          ],
          isError: !result.pass,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "visual.compare_to_design",
    "Compare current simulator screenshot against a pasted Figma/design image. Use this to verify that the implementation matches the design mockup. Returns images for LLM visual analysis alongside quantitative pixelmatch data.",
    VisualCompareToDesignInputSchema.shape,
    async (args) => {
      try {
        const result = await compareToDesign(args.designImage, {
          name: args.name,
          threshold: args.threshold,
          region: args.region,
          resizeStrategy: args.resizeStrategy,
        });

        // Generate markdown report for context
        const report = generateDesignReport(result);

        // Read the overlay image to send back for LLM visual analysis
        const fs = await import("node:fs");
        const overlayBuffer = fs.readFileSync(result.artifacts.overlay);
        const overlayBase64 = overlayBuffer.toString("base64");

        // Also send the diff image for analysis
        const diffBuffer = fs.readFileSync(result.artifacts.diff);
        const diffBase64 = diffBuffer.toString("base64");

        return {
          content: [
            {
              type: "text",
              text: `## Design Comparison Results\n\n${report}\n\n**Note**: The images below show a side-by-side overlay (Design | Actual | Diff) and the diff highlighting. Please analyze these visually for semantic differences like layout, spacing, colors, and typography that pixel matching may not capture accurately.`,
            },
            {
              type: "image",
              data: overlayBase64,
              mimeType: "image/png",
            },
            {
              type: "text",
              text: "\n### Diff Image (Red = Differences)\n",
            },
            {
              type: "image",
              data: diffBase64,
              mimeType: "image/png",
            },
            {
              type: "text",
              text: JSON.stringify({
                match: result.match,
                matchPercent: result.matchPercent,
                mismatchPercent: result.mismatchPercent,
                dimensions: result.dimensions,
                artifacts: result.artifacts,
              }, null, 2),
            },
          ],
          isError: !result.match,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === ACCEPTANCE CRITERIA TOOLS ===

  server.tool(
    "acceptance.parse",
    "Parse an acceptance criteria markdown file and return structured test criteria. Use this to understand what criteria exist before running tests.",
    AcceptanceParseInputSchema.shape,
    async (args) => {
      try {
        if (!args.filePath && !args.content) {
          throw createError("AC_NO_INPUT", "Either filePath or content must be provided");
        }

        let criteria;
        if (args.filePath) {
          criteria = await parseCriteriaFile(args.filePath);
        } else {
          criteria = parseCriteriaContent(args.content!);
        }

        const stats = getCriteriaStats(criteria);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                title: criteria.title,
                totalCriteria: criteria.totalCriteria,
                sections: criteria.sections.map(s => ({
                  name: s.name,
                  criteriaCount: s.criteria.length + s.subsections.reduce((sum, sub) => sum + sub.criteria.length, 0),
                  subsections: s.subsections.map(sub => sub.name),
                })),
                testFlows: criteria.testFlows.map(f => ({
                  name: f.name,
                  stepCount: f.steps.length,
                })),
                statistics: stats,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "acceptance.run",
    "Run acceptance criteria tests against current app state. Requires Detox session. " +
      "Returns report with pass/fail/blocked status and missing testIDs for blocked tests.",
    AcceptanceRunInputSchema.shape,
    async (args) => {
      try {
        if (!args.filePath && !args.content) {
          throw createError("AC_NO_INPUT", "Either filePath or content must be provided");
        }

        const startTime = Date.now();

        // Parse criteria
        let criteria;
        if (args.filePath) {
          criteria = await parseCriteriaFile(args.filePath);
        } else {
          criteria = parseCriteriaContent(args.content!);
        }

        // Run checks
        const { sectionReports, flowResults, allMissingRequirements, summary } = await runAcceptanceChecks(criteria, {
          stopOnFailure: args.stopOnFailure,
          sections: args.sections,
          skipFlows: args.skipFlows,
          skipManual: args.skipManual,
          captureEvidenceOnPass: args.captureEvidenceOnPass,
          timeout: args.timeout,
        });

        const totalDuration = Date.now() - startTime;

        // Generate report
        const report = generateReport(
          criteria,
          sectionReports,
          flowResults,
          allMissingRequirements,
          totalDuration,
          {
            criteriaFile: args.filePath,
            configuration: stateManager.getDetox().configuration,
            deviceName: stateManager.getSimulator().deviceName,
          }
        );

        // Save report files
        const { markdownPath, jsonPath } = await saveReport(report);
        report.artifacts.reportPath = markdownPath;
        report.artifacts.jsonPath = jsonPath;

        // Generate markdown for display
        const markdown = generateMarkdownReport(report);

        return {
          content: [
            {
              type: "text",
              text: markdown,
            },
            {
              type: "text",
              text: `\n---\n**Report saved to:** ${markdownPath}\n**JSON data:** ${jsonPath}`,
            },
          ],
          isError: summary.failed > 0 || summary.errors > 0,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "acceptance.run_flow",
    "Execute a specific test flow from acceptance criteria. " +
      "Returns step-by-step results with evidence and lists missing testIDs that blocked completion.",
    AcceptanceRunFlowInputSchema.shape,
    async (args) => {
      try {
        if (!args.filePath && !args.content) {
          throw createError("AC_NO_INPUT", "Either filePath or content must be provided");
        }

        // Parse criteria
        let criteria;
        if (args.filePath) {
          criteria = await parseCriteriaFile(args.filePath);
        } else {
          criteria = parseCriteriaContent(args.content!);
        }

        // Find the flow
        const flow = criteria.testFlows.find(f =>
          f.name.toLowerCase().includes(args.flowName.toLowerCase())
        );

        if (!flow) {
          throw createError("AC_FLOW_NOT_FOUND", `Flow "${args.flowName}" not found`, {
            details: `Available flows: ${criteria.testFlows.map(f => f.name).join(", ")}`,
          });
        }

        // Execute flow
        const result = await executeTestFlow(flow, {
          screenshotEachStep: args.screenshotEachStep,
          stopOnFailure: true,
        });

        // Format output
        const lines: string[] = [];
        lines.push(`## Flow: ${flow.name}`);
        lines.push("");
        lines.push(`**Progress:** ${result.completedSteps}/${result.totalSteps} steps`);
        lines.push(`**Status:** ${result.success ? "PASSED" : result.blockedReason ? "BLOCKED" : "FAILED"}`);
        lines.push("");

        lines.push("### Steps");
        lines.push("");
        lines.push("| # | Description | Status | Details |");
        lines.push("|---|-------------|--------|---------|");

        for (const stepResult of result.stepResults) {
          const status = stepResult.status.toUpperCase();
          const desc = stepResult.step.description.slice(0, 50);
          let details = "";
          if (stepResult.missingRequirements?.length) {
            details = `Missing: \`${stepResult.missingRequirements[0].suggestedValue}\``;
          } else if (stepResult.status !== "pass") {
            details = stepResult.message.slice(0, 40);
          }
          lines.push(`| ${stepResult.step.stepNumber} | ${desc} | ${status} | ${details} |`);
        }

        if (result.missingRequirements?.length) {
          lines.push("");
          lines.push("### Missing Requirements");
          lines.push("");
          lines.push("Add the following testIDs to make this flow fully testable:");
          lines.push("");
          for (const req of result.missingRequirements) {
            lines.push(`- \`testID="${req.suggestedValue}"\` for: ${req.elementDescription.slice(0, 60)}`);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: lines.join("\n"),
            },
            {
              type: "text",
              text: JSON.stringify({
                success: result.success,
                completedSteps: result.completedSteps,
                totalSteps: result.totalSteps,
                blocked: !!result.blockedReason,
                missingRequirements: result.missingRequirements,
                elapsedMs: result.elapsedMs,
              }, null, 2),
            },
          ],
          isError: !result.success,
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  server.tool(
    "acceptance.check",
    "Check a single acceptance criterion by ID or description match. Useful for verifying specific requirements.",
    AcceptanceCheckInputSchema.shape,
    async (args) => {
      try {
        if (!args.filePath && !args.content) {
          throw createError("AC_NO_INPUT", "Either filePath or content must be provided");
        }

        if (!args.criterionId && !args.description) {
          throw createError("AC_CRITERION_NOT_FOUND", "Either criterionId or description must be provided");
        }

        // Parse criteria
        let criteria;
        if (args.filePath) {
          criteria = await parseCriteriaFile(args.filePath);
        } else {
          criteria = parseCriteriaContent(args.content!);
        }

        // Find the criterion
        let foundCriterion = null;
        for (const section of criteria.sections) {
          const allCriteria = [
            ...section.criteria,
            ...section.subsections.flatMap(sub => sub.criteria),
          ];

          for (const criterion of allCriteria) {
            if (args.criterionId && criterion.id === args.criterionId) {
              foundCriterion = criterion;
              break;
            }
            if (args.description && criterion.description.toLowerCase().includes(args.description.toLowerCase())) {
              foundCriterion = criterion;
              break;
            }
          }
          if (foundCriterion) break;
        }

        if (!foundCriterion) {
          throw createError("AC_CRITERION_NOT_FOUND", `Criterion not found: ${args.criterionId || args.description}`);
        }

        // Execute check
        const result = await executeCriterionCheck(foundCriterion, {
          captureEvidence: true,
          timeout: DEFAULT_CRITERION_TIMEOUT_MS,
        });

        // Format output
        const statusIcon = result.status === "pass" ? "[x]" : result.status === "blocked" ? "[!]" : "[ ]";
        const lines: string[] = [];
        lines.push(`## ${statusIcon} ${result.criterion.description}`);
        lines.push("");
        lines.push(`**Status:** ${result.status.toUpperCase()}`);
        lines.push(`**Section:** ${result.criterion.section}`);
        lines.push(`**Type:** ${result.criterion.type}`);
        lines.push(`**Duration:** ${result.elapsedMs}ms`);
        lines.push("");

        if (result.message && result.status !== "pass") {
          lines.push(`**Message:** ${result.message}`);
          lines.push("");
        }

        if (result.missingRequirements?.length) {
          lines.push("### Missing Requirements");
          lines.push("");
          for (const req of result.missingRequirements) {
            lines.push(`Add \`testID="${req.suggestedValue}"\` to enable testing.`);
          }
          lines.push("");
        }

        if (result.evidence?.screenshots?.length) {
          lines.push(`**Evidence:** ${result.evidence.screenshots.join(", ")}`);
        }

        return {
          content: [
            {
              type: "text",
              text: lines.join("\n"),
            },
          ],
          isError: result.status === "fail" || result.status === "error",
        };
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // === RESOURCES ===

  server.resource(
    "state",
    "resource://state",
    async () => {
      return {
        contents: [
          {
            uri: "resource://state",
            mimeType: "application/json",
            text: JSON.stringify(stateManager.getState(), null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "logs/simulator/latest",
    "resource://logs/simulator/latest",
    async () => {
      const logs = getSimulatorLogs(200);
      return {
        contents: [
          {
            uri: "resource://logs/simulator/latest",
            mimeType: "application/json",
            text: JSON.stringify(logs, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "artifacts/latest",
    "resource://artifacts/latest",
    async () => {
      const manifest = artifactManager.getManifest();
      return {
        contents: [
          {
            uri: "resource://artifacts/latest",
            mimeType: "application/json",
            text: JSON.stringify(manifest, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "logs/detox/latest",
    "resource://logs/detox/latest",
    async () => {
      const logs = logger.tail("detox", 200);
      return {
        contents: [
          {
            uri: "resource://logs/detox/latest",
            mimeType: "application/json",
            text: JSON.stringify(logs, null, 2),
          },
        ],
      };
    }
  );

  server.resource(
    "logs/expo/latest",
    "resource://logs/expo/latest",
    async () => {
      const logs = getExpoLogsTail(200);
      return {
        contents: [
          {
            uri: "resource://logs/expo/latest",
            mimeType: "application/json",
            text: JSON.stringify(logs, null, 2),
          },
        ],
      };
    }
  );

  // Register prompt templates
  registerPrompts(server);

  logger.info("mcp", "MCP server created with simulator, Expo, Detox, visual regression tools, and prompt templates registered");

  return server;
}

function handleToolError(error: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  if (error instanceof McpOperationError) {
    logger.error("mcp", `Tool error: ${error.code} - ${error.message}`, {
      details: error.details,
      remediation: error.remediation,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(error.toMcpError(), null, 2),
        },
      ],
      isError: true,
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  logger.error("mcp", `Unexpected error: ${message}`);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          code: "INTERNAL_ERROR",
          message,
          remediation: "Check server logs for details.",
        }, null, 2),
      },
    ],
    isError: true,
  };
}
