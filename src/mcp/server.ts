/**
 * MCP Server implementation with tool registry
 */

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { stateManager } from "../core/state.js";
import { logger } from "../core/logger.js";
import { artifactManager } from "../core/artifacts.js";
import { McpOperationError } from "../core/errors.js";
import { getConfig, hasConfig } from "../config/load.js";

// Import simulator modules
import { listDevices, bootDevice, shutdownDevice, eraseDevice, getBootedDevice } from "../simulator/devices.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import { startVideoRecording, stopVideoRecording, getVideoRecordingStatus } from "../simulator/video.js";
import { startLogStream, stopLogStream, getSimulatorLogs } from "../simulator/logs.js";

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
} from "./schemas.js";

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
        const result = await bootDevice(device);
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

  logger.info("mcp", "MCP server created with simulator and Detox tools registered");

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
