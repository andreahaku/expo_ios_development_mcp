/**
 * Simulator log streaming
 */

import { execa, type ResultPromise } from "execa";
import { createError } from "../core/errors.js";
import { logger, type LogEntry } from "../core/logger.js";
import { stateManager } from "../core/state.js";
import { getBootedDevice } from "./devices.js";

let logStreamProcess: ResultPromise | null = null;
let isStreaming = false;

export interface LogStreamInfo {
  isStreaming: boolean;
  startedAt?: string;
}

export async function startLogStream(): Promise<LogStreamInfo> {
  logger.info("simulator", "Starting simulator log stream");

  if (logStreamProcess) {
    throw createError("SIMCTL_FAILED", "Log stream is already running");
  }

  // Check if simulator is booted
  if (!stateManager.isSimulatorReady()) {
    const bootedDevice = await getBootedDevice();
    if (!bootedDevice) {
      throw createError("SIM_NOT_BOOTED", "No simulator is currently booted", {
        details: "Boot a simulator first using simulator.boot",
      });
    }
    stateManager.updateSimulator({
      state: "booted",
      udid: bootedDevice.udid,
      deviceName: bootedDevice.name,
    });
  }

  // Start log stream
  logStreamProcess = execa("xcrun", ["simctl", "spawn", "booted", "log", "stream", "--style", "compact"], {
    reject: false,
  });

  isStreaming = true;
  const startedAt = new Date().toISOString();

  // Process stdout line by line
  logStreamProcess.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      logger.debug("simulator", line);
    }
  });

  logStreamProcess.stderr?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      logger.warn("simulator", `[stderr] ${line}`);
    }
  });

  logStreamProcess.on("exit", (code: number | null) => {
    logger.info("simulator", `Log stream ended with code ${code}`);
    isStreaming = false;
    logStreamProcess = null;
  });

  logger.info("simulator", "Simulator log stream started");

  return {
    isStreaming: true,
    startedAt,
  };
}

export async function stopLogStream(): Promise<void> {
  logger.info("simulator", "Stopping simulator log stream");

  if (!logStreamProcess) {
    logger.info("simulator", "No log stream is running");
    return;
  }

  logStreamProcess.kill("SIGTERM");
  logStreamProcess = null;
  isStreaming = false;

  logger.info("simulator", "Simulator log stream stopped");
}

export function getLogStreamStatus(): LogStreamInfo {
  return {
    isStreaming,
  };
}

export function getSimulatorLogs(lines: number = 100): LogEntry[] {
  return logger.tail("simulator", lines);
}
