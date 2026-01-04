/**
 * Expo/Metro orchestrator
 * Manages the Expo development server lifecycle
 */

import { execa, type ResultPromise } from "execa";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { stateManager } from "../core/state.js";
import { getConfig, hasConfig } from "../config/load.js";
import { detectMetroReady, isMetroError } from "./metro.js";
import { processExpoOutput, getExpoLogs } from "./logs.js";

let expoProcess: ResultPromise | null = null;
let outputBuffer = "";
let startedAt: string | null = null;

export interface ExpoStartOptions {
  clearCache?: boolean;
  port?: number;
}

export interface ExpoStartResult {
  started: boolean;
  metroUrl?: string;
  message: string;
}

export interface ExpoStatus {
  running: boolean;
  metroUrl?: string;
  startedAt?: string;
  pid?: number;
}

export async function startExpo(options: ExpoStartOptions = {}): Promise<ExpoStartResult> {
  logger.info("expo", "Starting Expo/Metro...");

  if (expoProcess) {
    const status = detectMetroReady(outputBuffer);
    if (status.ready) {
      logger.info("expo", "Expo is already running");
      return {
        started: true,
        metroUrl: status.url,
        message: "Expo is already running",
      };
    }
    // Process exists but not ready - kill it and restart
    await stopExpo();
  }

  if (!hasConfig()) {
    throw createError("CONFIG_NOT_FOUND", "Configuration required to start Expo");
  }

  const config = getConfig();
  stateManager.updateExpo({ state: "starting" });

  // Build command
  let command = config.expo.startCommand;

  if (options.clearCache) {
    command += ` ${config.expo.clearCacheFlag}`;
  }

  if (options.port) {
    command += ` --port ${options.port}`;
  }

  const [cmd, ...args] = command.split(" ").filter(Boolean);

  logger.info("expo", `Executing: ${command}`, { cwd: config.projectPath });

  try {
    // Start Expo process
    expoProcess = execa(cmd, args, {
      cwd: config.projectPath,
      reject: false,
      env: {
        ...process.env,
        FORCE_COLOR: "1",
        CI: "false", // Ensure interactive mode
      },
    });

    startedAt = new Date().toISOString();
    outputBuffer = "";

    // Handle stdout
    expoProcess.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      outputBuffer += text;
      processExpoOutput(text, "stdout");

      // Check for Metro ready
      const status = detectMetroReady(outputBuffer);
      if (status.ready && stateManager.getExpo().state !== "running") {
        stateManager.updateExpo({
          state: "running",
          metroUrl: status.url,
          processId: expoProcess?.pid,
        });
        logger.info("expo", `Metro ready at ${status.url}`);
      }
    });

    // Handle stderr
    expoProcess.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      outputBuffer += text;
      processExpoOutput(text, "stderr");

      // Check for errors
      if (isMetroError(text)) {
        stateManager.updateExpo({ state: "crashed" });
        logger.error("expo", "Metro encountered an error", { output: text });
      }
    });

    // Handle process exit
    expoProcess.on("exit", (code: number | null) => {
      logger.info("expo", `Expo process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        stateManager.updateExpo({ state: "crashed" });
      } else {
        stateManager.updateExpo({ state: "stopped" });
      }
      expoProcess = null;
    });

    // Wait for Metro to be ready (with timeout)
    const waitResult = await waitForMetroReady(30000);

    if (waitResult.ready) {
      return {
        started: true,
        metroUrl: waitResult.url,
        message: "Expo started successfully",
      };
    }

    return {
      started: true,
      message: "Expo started but Metro readiness not confirmed yet",
    };
  } catch (error) {
    stateManager.updateExpo({ state: "crashed" });
    throw createError("EXPO_START_FAILED", "Failed to start Expo", {
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function waitForMetroReady(
  timeoutMs: number
): Promise<{ ready: boolean; url?: string }> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < timeoutMs) {
    const status = detectMetroReady(outputBuffer);
    if (status.ready) {
      return { ready: true, url: status.url };
    }

    // Check if process crashed
    if (!expoProcess) {
      return { ready: false };
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return { ready: false };
}

export async function stopExpo(): Promise<void> {
  logger.info("expo", "Stopping Expo/Metro...");

  if (!expoProcess) {
    logger.info("expo", "No Expo process running");
    stateManager.updateExpo({ state: "stopped" });
    return;
  }

  try {
    // Send SIGTERM first for graceful shutdown
    expoProcess.kill("SIGTERM");

    // Wait a bit for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // If still running, force kill
    if (expoProcess) {
      expoProcess.kill("SIGKILL");
    }
  } catch {
    // Ignore errors during cleanup
  }

  expoProcess = null;
  outputBuffer = "";
  startedAt = null;

  stateManager.updateExpo({
    state: "stopped",
    metroUrl: undefined,
    processId: undefined,
  });

  logger.info("expo", "Expo stopped");
}

export function getExpoStatus(): ExpoStatus {
  const expoState = stateManager.getExpo();
  const status = detectMetroReady(outputBuffer);

  return {
    running: expoProcess !== null && expoState.state === "running",
    metroUrl: status.url ?? expoState.metroUrl,
    startedAt: startedAt ?? undefined,
    pid: expoProcess?.pid,
  };
}

export function getExpoLogsTail(lines: number = 100) {
  return getExpoLogs(lines);
}

export async function reloadApp(): Promise<void> {
  if (!expoProcess) {
    throw createError("EXPO_NOT_RUNNING", "Expo is not running");
  }

  logger.info("expo", "Reloading app...");

  try {
    // Send 'r' key to reload (Expo CLI shortcut)
    expoProcess.stdin?.write("r");

    // Wait a bit for reload to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    throw createError("EXPO_RELOAD_FAILED", "Failed to reload app", {
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export async function openDevMenu(): Promise<void> {
  if (!expoProcess) {
    throw createError("EXPO_NOT_RUNNING", "Expo is not running");
  }

  logger.info("expo", "Opening dev menu...");

  try {
    // Send 'm' key to open dev menu (Expo CLI shortcut)
    expoProcess.stdin?.write("m");
  } catch (error) {
    throw createError("EXPO_DEV_MENU_FAILED", "Failed to open dev menu", {
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
