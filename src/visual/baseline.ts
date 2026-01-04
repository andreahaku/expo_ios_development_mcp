/**
 * Visual regression baseline management
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getConfig, hasConfig } from "../config/load.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import { stateManager } from "../core/state.js";

export interface BaselineInfo {
  name: string;
  path: string;
  configuration: string;
  deviceName: string;
  createdAt: string;
  size: { width: number; height: number };
}

/**
 * Get the baseline directory path for current configuration
 */
export function getBaselineDir(): string {
  if (!hasConfig()) {
    throw createError("CONFIG_NOT_FOUND", "Configuration required for visual regression");
  }

  const config = getConfig();
  const simState = stateManager.getSimulator();
  const deviceName = simState.deviceName ?? config.defaultDeviceName ?? "unknown";
  const configuration = config.detox?.configuration ?? "default";

  // Sanitize device name for filesystem
  const sanitizedDevice = deviceName.replace(/[^a-zA-Z0-9_-]/g, "_");

  const baselineDir = config.visual?.baselineDir ?? "./artifacts/baselines";

  return path.join(baselineDir, configuration, sanitizedDevice);
}

/**
 * Get the full path for a baseline image
 */
export function getBaselinePath(name: string): string {
  const baselineDir = getBaselineDir();
  const sanitizedName = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(baselineDir, `${sanitizedName}.png`);
}

/**
 * Check if a baseline exists
 */
export function baselineExists(name: string): boolean {
  const baselinePath = getBaselinePath(name);
  return fs.existsSync(baselinePath);
}

/**
 * Save a new baseline screenshot
 */
export async function saveBaseline(
  name: string,
  options?: { overwrite?: boolean }
): Promise<BaselineInfo> {
  const { overwrite = false } = options ?? {};

  logger.info("visual", `Saving baseline: ${name}`);

  // Check if baseline already exists
  if (baselineExists(name) && !overwrite) {
    throw createError("VISUAL_BASELINE_EXISTS", `Baseline '${name}' already exists`, {
      customRemediation: "Use overwrite: true to replace the existing baseline.",
    });
  }

  // Take a screenshot
  const screenshot = await takeScreenshot(`baseline-${name}`);

  // Ensure baseline directory exists
  const baselineDir = getBaselineDir();
  fs.mkdirSync(baselineDir, { recursive: true });

  // Copy screenshot to baseline location
  const baselinePath = getBaselinePath(name);
  fs.copyFileSync(screenshot.path, baselinePath);

  // Get image dimensions
  const dimensions = await getImageDimensions(baselinePath);

  const config = getConfig();
  const simState = stateManager.getSimulator();

  const info: BaselineInfo = {
    name,
    path: baselinePath,
    configuration: config.detox?.configuration ?? "default",
    deviceName: simState.deviceName ?? config.defaultDeviceName ?? "unknown",
    createdAt: new Date().toISOString(),
    size: dimensions,
  };

  logger.info("visual", `Baseline saved: ${baselinePath}`, {
    name: info.name,
    path: info.path,
    configuration: info.configuration,
    deviceName: info.deviceName,
  });

  return info;
}

/**
 * Load a baseline image as a buffer
 */
export function loadBaseline(name: string): Buffer {
  const baselinePath = getBaselinePath(name);

  if (!fs.existsSync(baselinePath)) {
    throw createError("VISUAL_BASELINE_NOT_FOUND", `Baseline '${name}' not found`, {
      details: `Expected at: ${baselinePath}`,
    });
  }

  return fs.readFileSync(baselinePath);
}

/**
 * List all baselines for current configuration
 */
export function listBaselines(): BaselineInfo[] {
  const baselineDir = getBaselineDir();

  if (!fs.existsSync(baselineDir)) {
    return [];
  }

  const files = fs.readdirSync(baselineDir).filter((f) => f.endsWith(".png"));

  const config = getConfig();
  const simState = stateManager.getSimulator();

  return files.map((file) => {
    const name = path.basename(file, ".png");
    const filePath = path.join(baselineDir, file);
    const stats = fs.statSync(filePath);

    return {
      name,
      path: filePath,
      configuration: config.detox?.configuration ?? "default",
      deviceName: simState.deviceName ?? config.defaultDeviceName ?? "unknown",
      createdAt: stats.mtime.toISOString(),
      size: { width: 0, height: 0 }, // Would need to read PNG to get actual size
    };
  });
}

/**
 * Delete a baseline
 */
export function deleteBaseline(name: string): void {
  const baselinePath = getBaselinePath(name);

  if (!fs.existsSync(baselinePath)) {
    throw createError("VISUAL_BASELINE_NOT_FOUND", `Baseline '${name}' not found`);
  }

  fs.unlinkSync(baselinePath);
  logger.info("visual", `Baseline deleted: ${name}`);
}

/**
 * Get image dimensions from a PNG file
 */
async function getImageDimensions(
  imagePath: string
): Promise<{ width: number; height: number }> {
  // Read PNG header to get dimensions
  const buffer = fs.readFileSync(imagePath);

  // PNG signature is 8 bytes, then IHDR chunk
  // IHDR chunk: 4 bytes length, 4 bytes "IHDR", 4 bytes width, 4 bytes height
  if (buffer.length < 24) {
    return { width: 0, height: 0 };
  }

  // Check PNG signature
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== pngSignature[i]) {
      return { width: 0, height: 0 };
    }
  }

  // Read width and height from IHDR chunk (big-endian)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}
