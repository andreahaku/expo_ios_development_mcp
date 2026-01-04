/**
 * Simulator video recording
 */

import { execa, type ResultPromise } from "execa";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { artifactManager } from "../core/artifacts.js";
import { stateManager } from "../core/state.js";
import { getBootedDevice } from "./devices.js";

let recordingProcess: ResultPromise | null = null;
let currentVideoPath: string | null = null;

export interface VideoRecordingInfo {
  isRecording: boolean;
  path?: string;
  startedAt?: string;
}

export async function startVideoRecording(name: string = "recording"): Promise<VideoRecordingInfo> {
  logger.info("simulator", `Starting video recording: ${name}`);

  if (recordingProcess) {
    throw createError("SIMCTL_FAILED", "Video recording is already in progress", {
      details: `Current recording: ${currentVideoPath}`,
    });
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

  currentVideoPath = await artifactManager.getVideoPath(name);

  // Start recording in the background
  recordingProcess = execa("xcrun", ["simctl", "io", "booted", "recordVideo", currentVideoPath], {
    reject: false,
  });

  const startedAt = new Date().toISOString();

  logger.info("simulator", `Video recording started: ${currentVideoPath}`);

  return {
    isRecording: true,
    path: currentVideoPath,
    startedAt,
  };
}

export async function stopVideoRecording(): Promise<VideoRecordingInfo> {
  logger.info("simulator", "Stopping video recording");

  if (!recordingProcess || !currentVideoPath) {
    throw createError("SIMCTL_FAILED", "No video recording is in progress");
  }

  // Send SIGINT to stop recording gracefully
  recordingProcess.kill("SIGINT");

  try {
    await recordingProcess;
  } catch {
    // Process may exit with non-zero on SIGINT, which is expected
  }

  const savedPath = currentVideoPath;

  artifactManager.registerArtifact({
    type: "video",
    path: savedPath,
    metadata: { captureMethod: "simctl" },
  });

  recordingProcess = null;
  currentVideoPath = null;

  logger.info("simulator", `Video recording saved: ${savedPath}`);

  return {
    isRecording: false,
    path: savedPath,
  };
}

export function getVideoRecordingStatus(): VideoRecordingInfo {
  return {
    isRecording: recordingProcess !== null,
    path: currentVideoPath ?? undefined,
  };
}
