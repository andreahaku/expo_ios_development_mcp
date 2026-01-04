/**
 * Simulator screenshot capture
 */

import { simctl } from "./simctl.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { artifactManager } from "../core/artifacts.js";
import { stateManager } from "../core/state.js";
import { getBootedDevice } from "./devices.js";

export interface ScreenshotResult {
  path: string;
  width?: number;
  height?: number;
  timestamp: string;
}

export async function takeScreenshot(name: string = "screenshot"): Promise<ScreenshotResult> {
  logger.info("simulator", `Taking screenshot: ${name}`);

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

  const screenshotPath = await artifactManager.getScreenshotPath(name);

  // Use 'booted' to target the currently booted simulator
  const result = await simctl(["io", "booted", "screenshot", screenshotPath], {
    timeoutMs: 30000,
  });

  if (result.exitCode !== 0) {
    throw createError("SIMCTL_FAILED", "Failed to take screenshot", {
      details: result.stderr,
      evidence: [logger.formatForEvidence("simulator", 50)],
    });
  }

  const timestamp = new Date().toISOString();

  artifactManager.registerArtifact({
    type: "screenshot",
    path: screenshotPath,
    metadata: { name, captureMethod: "simctl" },
  });

  logger.info("simulator", `Screenshot saved to ${screenshotPath}`);

  return {
    path: screenshotPath,
    timestamp,
  };
}

export async function takeScreenshotToBuffer(): Promise<Buffer> {
  const { path } = await takeScreenshot("temp");
  const { readFile, unlink } = await import("fs/promises");
  const buffer = await readFile(path);
  await unlink(path); // Clean up temp file
  return buffer;
}
