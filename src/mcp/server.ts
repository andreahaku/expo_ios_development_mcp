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

// Import schemas
import {
  SimulatorBootInputSchema,
  SimulatorShutdownInputSchema,
  SimulatorEraseInputSchema,
  SimulatorScreenshotInputSchema,
  VideoRecordingInputSchema,
  ExpoLogsTailInputSchema,
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

  logger.info("mcp", "MCP server created with simulator tools registered");

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
