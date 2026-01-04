/**
 * Visual regression comparison using pixelmatch
 */

import * as fs from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { getConfig, hasConfig } from "../config/load.js";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { getArtifactPath } from "../core/artifacts.js";
import { takeScreenshot } from "../simulator/screenshots.js";
import { loadBaseline, getBaselinePath, baselineExists } from "./baseline.js";

export interface CompareResult {
  pass: boolean;
  mismatchPercent: number;
  mismatchPixels: number;
  totalPixels: number;
  threshold: number;
  artifacts: {
    actual: string;
    baseline: string;
    diff: string;
  };
  dimensions: {
    actual: { width: number; height: number };
    baseline: { width: number; height: number };
  };
}

export interface CompareOptions {
  threshold?: number; // Pixel difference threshold (0-1), default from config
  antialiasing?: boolean; // Whether to detect and ignore anti-aliased pixels
  alpha?: number; // Blending factor of unchanged pixels in diff output
  includeAA?: boolean; // Whether to include anti-aliased pixels in diff
}

/**
 * Compare a current screenshot against a baseline
 */
export async function compareWithBaseline(
  baselineName: string,
  options?: CompareOptions
): Promise<CompareResult> {
  logger.info("visual", `Comparing against baseline: ${baselineName}`);

  if (!hasConfig()) {
    throw createError("CONFIG_NOT_FOUND", "Configuration required for visual comparison");
  }

  const config = getConfig();

  // Check baseline exists
  if (!baselineExists(baselineName)) {
    throw createError("VISUAL_BASELINE_NOT_FOUND", `Baseline '${baselineName}' not found`, {
      details: `Expected at: ${getBaselinePath(baselineName)}`,
    });
  }

  // Take current screenshot
  const screenshot = await takeScreenshot(`compare-${baselineName}`);
  const actualPath = screenshot.path;

  // Load images
  const baselineBuffer = loadBaseline(baselineName);
  const actualBuffer = fs.readFileSync(actualPath);

  // Parse PNGs
  const baselinePng = PNG.sync.read(baselineBuffer);
  const actualPng = PNG.sync.read(actualBuffer);

  // Check dimensions
  if (
    baselinePng.width !== actualPng.width ||
    baselinePng.height !== actualPng.height
  ) {
    throw createError("VISUAL_SIZE_MISMATCH", "Screenshot dimensions differ from baseline", {
      details: `Baseline: ${baselinePng.width}x${baselinePng.height}, Actual: ${actualPng.width}x${actualPng.height}`,
    });
  }

  const { width, height } = baselinePng;
  const totalPixels = width * height;

  // Create diff image
  const diffPng = new PNG({ width, height });

  // Get threshold from options or config
  const threshold = options?.threshold ?? config.visual.thresholdDefault ?? 0.02;

  // Run pixelmatch
  const mismatchPixels = pixelmatch(
    baselinePng.data,
    actualPng.data,
    diffPng.data,
    width,
    height,
    {
      threshold: 0.1, // Per-pixel color threshold (different from overall threshold)
      includeAA: options?.includeAA ?? true,
      alpha: options?.alpha ?? 0.1,
    }
  );

  const mismatchPercent = mismatchPixels / totalPixels;
  const pass = mismatchPercent <= threshold;

  // Save diff image
  const diffPath = getArtifactPath("screenshots", `diff-${baselineName}`, "png");
  fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

  const result: CompareResult = {
    pass,
    mismatchPercent,
    mismatchPixels,
    totalPixels,
    threshold,
    artifacts: {
      actual: actualPath,
      baseline: getBaselinePath(baselineName),
      diff: diffPath,
    },
    dimensions: {
      actual: { width: actualPng.width, height: actualPng.height },
      baseline: { width: baselinePng.width, height: baselinePng.height },
    },
  };

  if (pass) {
    logger.info("visual", `Visual comparison PASSED: ${(mismatchPercent * 100).toFixed(2)}% diff`);
  } else {
    logger.warn("visual", `Visual comparison FAILED: ${(mismatchPercent * 100).toFixed(2)}% diff exceeds ${(threshold * 100).toFixed(2)}% threshold`);
  }

  return result;
}

/**
 * Compare two image files directly
 */
export async function compareImages(
  imagePath1: string,
  imagePath2: string,
  options?: CompareOptions
): Promise<CompareResult> {
  logger.info("visual", `Comparing images: ${imagePath1} vs ${imagePath2}`);

  if (!fs.existsSync(imagePath1)) {
    throw createError("ARTIFACT_WRITE_FAILED", `Image not found: ${imagePath1}`);
  }
  if (!fs.existsSync(imagePath2)) {
    throw createError("ARTIFACT_WRITE_FAILED", `Image not found: ${imagePath2}`);
  }

  // Load images
  const buffer1 = fs.readFileSync(imagePath1);
  const buffer2 = fs.readFileSync(imagePath2);

  // Parse PNGs
  const png1 = PNG.sync.read(buffer1);
  const png2 = PNG.sync.read(buffer2);

  // Check dimensions
  if (png1.width !== png2.width || png1.height !== png2.height) {
    throw createError("VISUAL_SIZE_MISMATCH", "Image dimensions differ", {
      details: `Image 1: ${png1.width}x${png1.height}, Image 2: ${png2.width}x${png2.height}`,
    });
  }

  const { width, height } = png1;
  const totalPixels = width * height;

  // Create diff image
  const diffPng = new PNG({ width, height });

  // Get threshold
  const config = hasConfig() ? getConfig() : null;
  const threshold = options?.threshold ?? config?.visual.thresholdDefault ?? 0.02;

  // Run pixelmatch
  const mismatchPixels = pixelmatch(
    png1.data,
    png2.data,
    diffPng.data,
    width,
    height,
    {
      threshold: 0.1,
      includeAA: options?.includeAA ?? true,
      alpha: options?.alpha ?? 0.1,
    }
  );

  const mismatchPercent = mismatchPixels / totalPixels;
  const pass = mismatchPercent <= threshold;

  // Save diff image
  const diffPath = getArtifactPath("screenshots", `diff-compare`, "png");
  fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

  return {
    pass,
    mismatchPercent,
    mismatchPixels,
    totalPixels,
    threshold,
    artifacts: {
      actual: imagePath1,
      baseline: imagePath2,
      diff: diffPath,
    },
    dimensions: {
      actual: { width: png1.width, height: png1.height },
      baseline: { width: png2.width, height: png2.height },
    },
  };
}

/**
 * Generate a visual diff report in markdown format
 */
export function generateDiffReport(result: CompareResult): string {
  const status = result.pass ? "PASSED" : "FAILED";
  const emoji = result.pass ? ":" : ":";

  return `# Visual Regression Report

## Status: ${status} ${emoji}

### Metrics
- **Mismatch**: ${(result.mismatchPercent * 100).toFixed(4)}%
- **Threshold**: ${(result.threshold * 100).toFixed(2)}%
- **Mismatched Pixels**: ${result.mismatchPixels.toLocaleString()} / ${result.totalPixels.toLocaleString()}

### Dimensions
- **Baseline**: ${result.dimensions.baseline.width}x${result.dimensions.baseline.height}
- **Actual**: ${result.dimensions.actual.width}x${result.dimensions.actual.height}

### Artifacts
- Baseline: \`${result.artifacts.baseline}\`
- Actual: \`${result.artifacts.actual}\`
- Diff: \`${result.artifacts.diff}\`
`;
}
