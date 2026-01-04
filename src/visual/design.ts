/**
 * Design comparison - compare simulator screenshots against Figma/design mockups
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PNG, PNGWithMetadata } from "pngjs";
import pixelmatch from "pixelmatch";
import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { artifactManager, getArtifactPath } from "../core/artifacts.js";
import { takeScreenshot } from "../simulator/screenshots.js";

export interface DesignCompareResult {
  match: boolean;
  matchPercent: number;
  mismatchPercent: number;
  mismatchPixels: number;
  totalPixels: number;
  threshold: number;
  resized: boolean;
  artifacts: {
    design: string;
    actual: string;
    diff: string;
    overlay: string;
  };
  dimensions: {
    design: { width: number; height: number };
    actual: { width: number; height: number };
    compared: { width: number; height: number };
  };
  feedback: string[];
}

export interface DesignCompareOptions {
  /** Name for organizing artifacts */
  name?: string;
  /** Mismatch threshold (0-1). Design comparison uses higher default (0.05) */
  threshold?: number;
  /** Compare only a specific region */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Resize strategy when dimensions differ */
  resizeStrategy?: "design" | "actual" | "none";
}

/**
 * Decode base64 image data to Buffer
 */
function decodeBase64Image(base64Data: string): Buffer {
  // Remove data URL prefix if present
  const matches = base64Data.match(/^data:image\/\w+;base64,(.+)$/);
  const imageData = matches ? matches[1] : base64Data;
  return Buffer.from(imageData, "base64");
}

/**
 * Resize a PNG to target dimensions using nearest-neighbor (simple resize)
 */
function resizePng(png: PNG, targetWidth: number, targetHeight: number): PNG {
  const resized = new PNG({ width: targetWidth, height: targetHeight });

  const xRatio = png.width / targetWidth;
  const yRatio = png.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (png.width * srcY + srcX) * 4;
      const dstIdx = (targetWidth * y + x) * 4;

      resized.data[dstIdx] = png.data[srcIdx];
      resized.data[dstIdx + 1] = png.data[srcIdx + 1];
      resized.data[dstIdx + 2] = png.data[srcIdx + 2];
      resized.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }

  return resized;
}

/**
 * Create a side-by-side overlay image
 */
function createOverlay(design: PNG, actual: PNG, diff: PNG): PNG {
  const gap = 10;
  const totalWidth = design.width + actual.width + diff.width + gap * 2;
  const maxHeight = Math.max(design.height, actual.height, diff.height);

  const overlay = new PNG({ width: totalWidth, height: maxHeight });

  // Fill with gray background
  for (let i = 0; i < overlay.data.length; i += 4) {
    overlay.data[i] = 40;
    overlay.data[i + 1] = 40;
    overlay.data[i + 2] = 40;
    overlay.data[i + 3] = 255;
  }

  // Copy design image
  copyPngRegion(design, overlay, 0, 0);

  // Copy actual image
  copyPngRegion(actual, overlay, design.width + gap, 0);

  // Copy diff image
  copyPngRegion(diff, overlay, design.width + actual.width + gap * 2, 0);

  return overlay;
}

/**
 * Copy one PNG into another at specified position
 */
function copyPngRegion(src: PNG, dst: PNG, offsetX: number, offsetY: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const srcIdx = (src.width * y + x) * 4;
      const dstX = x + offsetX;
      const dstY = y + offsetY;

      if (dstX >= 0 && dstX < dst.width && dstY >= 0 && dstY < dst.height) {
        const dstIdx = (dst.width * dstY + dstX) * 4;
        dst.data[dstIdx] = src.data[srcIdx];
        dst.data[dstIdx + 1] = src.data[srcIdx + 1];
        dst.data[dstIdx + 2] = src.data[srcIdx + 2];
        dst.data[dstIdx + 3] = src.data[srcIdx + 3];
      }
    }
  }
}

/**
 * Extract a region from a PNG
 */
function extractRegion(png: PNG, x: number, y: number, width: number, height: number): PNG {
  const region = new PNG({ width, height });

  for (let ry = 0; ry < height; ry++) {
    for (let rx = 0; rx < width; rx++) {
      const srcX = x + rx;
      const srcY = y + ry;

      if (srcX >= 0 && srcX < png.width && srcY >= 0 && srcY < png.height) {
        const srcIdx = (png.width * srcY + srcX) * 4;
        const dstIdx = (width * ry + rx) * 4;

        region.data[dstIdx] = png.data[srcIdx];
        region.data[dstIdx + 1] = png.data[srcIdx + 1];
        region.data[dstIdx + 2] = png.data[srcIdx + 2];
        region.data[dstIdx + 3] = png.data[srcIdx + 3];
      }
    }
  }

  return region;
}

/**
 * Generate actionable feedback based on comparison results
 */
function generateFeedback(
  mismatchPercent: number,
  threshold: number,
  resized: boolean,
  designDims: { width: number; height: number },
  actualDims: { width: number; height: number }
): string[] {
  const feedback: string[] = [];

  if (mismatchPercent <= threshold) {
    feedback.push(`Design match: ${((1 - mismatchPercent) * 100).toFixed(1)}% similarity - within threshold`);
  } else {
    feedback.push(`Design mismatch: ${(mismatchPercent * 100).toFixed(1)}% difference - exceeds ${(threshold * 100).toFixed(1)}% threshold`);
  }

  if (resized) {
    feedback.push(`Note: Images were resized for comparison. Design: ${designDims.width}x${designDims.height}, Actual: ${actualDims.width}x${actualDims.height}`);
  }

  if (mismatchPercent > 0.3) {
    feedback.push("High mismatch detected. Consider checking: layout structure, component positioning, colors, and typography");
  } else if (mismatchPercent > 0.1) {
    feedback.push("Moderate differences found. Review: spacing, font sizes, colors, and border styles");
  } else if (mismatchPercent > threshold) {
    feedback.push("Minor differences detected. Check: subtle color variations, shadows, or anti-aliasing differences");
  }

  return feedback;
}

/**
 * Compare a design mockup (base64 image) against the current simulator screenshot
 */
export async function compareToDesign(
  designBase64: string,
  options?: DesignCompareOptions
): Promise<DesignCompareResult> {
  const name = options?.name ?? `design-compare-${Date.now()}`;
  // Use a more lenient default threshold for design comparison
  const threshold = options?.threshold ?? 0.05;
  const resizeStrategy = options?.resizeStrategy ?? "actual";

  logger.info("visual", `Comparing simulator to design: ${name}`);

  // Decode the design image
  let designBuffer: Buffer;
  try {
    designBuffer = decodeBase64Image(designBase64);
  } catch (error) {
    throw createError("VISUAL_DESIGN_INVALID", "Failed to decode design image", {
      details: error instanceof Error ? error.message : "Invalid base64 data",
    });
  }

  // Save design image to artifacts
  const designPath = getArtifactPath("designs", name, "png");
  const designDir = path.dirname(designPath);
  if (!fs.existsSync(designDir)) {
    fs.mkdirSync(designDir, { recursive: true });
  }
  fs.writeFileSync(designPath, designBuffer);

  artifactManager.registerArtifact({
    type: "design",
    path: designPath,
    metadata: { name, source: "figma" },
  });

  // Take current screenshot
  const screenshot = await takeScreenshot(`actual-${name}`);
  const actualPath = screenshot.path;

  // Load images
  let designPng: PNGWithMetadata;
  try {
    designPng = PNG.sync.read(designBuffer);
  } catch (error) {
    throw createError("VISUAL_DESIGN_INVALID", "Failed to parse design image as PNG", {
      details: "Ensure the image is a valid PNG format",
    });
  }

  const actualBuffer = fs.readFileSync(actualPath);
  let actualPng: PNGWithMetadata | PNG = PNG.sync.read(actualBuffer);

  const originalDesignDims = { width: designPng.width, height: designPng.height };
  const originalActualDims = { width: actualPng.width, height: actualPng.height };

  // Handle region extraction if specified
  if (options?.region) {
    const { x, y, width, height } = options.region;
    actualPng = extractRegion(actualPng, x, y, width, height);
    logger.info("visual", `Extracted region: ${x},${y} ${width}x${height}`);
  }

  // Handle size differences
  let resized = false;
  let comparisonDesign: PNGWithMetadata | PNG = designPng;
  let comparisonActual: PNGWithMetadata | PNG = actualPng;

  if (designPng.width !== actualPng.width || designPng.height !== actualPng.height) {
    resized = true;

    if (resizeStrategy === "actual") {
      // Resize actual to match design dimensions
      comparisonActual = resizePng(actualPng, designPng.width, designPng.height);
      logger.info("visual", `Resized actual from ${actualPng.width}x${actualPng.height} to ${designPng.width}x${designPng.height}`);
    } else if (resizeStrategy === "design") {
      // Resize design to match actual dimensions
      comparisonDesign = resizePng(designPng, actualPng.width, actualPng.height);
      logger.info("visual", `Resized design from ${designPng.width}x${designPng.height} to ${actualPng.width}x${actualPng.height}`);
    } else {
      // No resize - will fail comparison due to size mismatch
      throw createError("VISUAL_SIZE_MISMATCH", "Design and screenshot dimensions differ", {
        details: `Design: ${designPng.width}x${designPng.height}, Screenshot: ${actualPng.width}x${actualPng.height}. Use resizeStrategy option to auto-resize.`,
      });
    }
  }

  const { width, height } = comparisonDesign;
  const totalPixels = width * height;

  // Create diff image
  const diffPng = new PNG({ width, height });

  // Run pixelmatch with design-appropriate settings
  const mismatchPixels = pixelmatch(
    comparisonDesign.data,
    comparisonActual.data,
    diffPng.data,
    width,
    height,
    {
      threshold: 0.15, // More lenient per-pixel threshold for design comparison
      includeAA: false, // Ignore anti-aliasing differences
      alpha: 0.3, // Make unchanged areas more visible in diff
    }
  );

  const mismatchPercent = mismatchPixels / totalPixels;
  const matchPercent = 1 - mismatchPercent;
  const match = mismatchPercent <= threshold;

  // Save diff image
  const diffPath = getArtifactPath("screenshots", `diff-${name}`, "png");
  fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

  // Create and save overlay (side-by-side comparison)
  const overlayPng = createOverlay(comparisonDesign, comparisonActual, diffPng);
  const overlayPath = getArtifactPath("screenshots", `overlay-${name}`, "png");
  fs.writeFileSync(overlayPath, PNG.sync.write(overlayPng));

  artifactManager.registerArtifact({
    type: "diff",
    path: diffPath,
    metadata: { name, type: "design-diff" },
  });

  artifactManager.registerArtifact({
    type: "overlay",
    path: overlayPath,
    metadata: { name, type: "design-overlay" },
  });

  const feedback = generateFeedback(
    mismatchPercent,
    threshold,
    resized,
    originalDesignDims,
    originalActualDims
  );

  if (match) {
    logger.info("visual", `Design comparison PASSED: ${(matchPercent * 100).toFixed(1)}% match`);
  } else {
    logger.warn("visual", `Design comparison FAILED: ${(mismatchPercent * 100).toFixed(1)}% mismatch exceeds threshold`);
  }

  return {
    match,
    matchPercent,
    mismatchPercent,
    mismatchPixels,
    totalPixels,
    threshold,
    resized,
    artifacts: {
      design: designPath,
      actual: actualPath,
      diff: diffPath,
      overlay: overlayPath,
    },
    dimensions: {
      design: originalDesignDims,
      actual: originalActualDims,
      compared: { width, height },
    },
    feedback,
  };
}

/**
 * Generate a design comparison report in markdown format
 */
export function generateDesignReport(result: DesignCompareResult): string {
  const status = result.match ? "MATCH" : "MISMATCH";

  return `# Design Comparison Report

## Status: ${status}

### Similarity
- **Match**: ${(result.matchPercent * 100).toFixed(2)}%
- **Threshold**: ${(result.threshold * 100).toFixed(1)}%
- **Mismatched Pixels**: ${result.mismatchPixels.toLocaleString()} / ${result.totalPixels.toLocaleString()}

### Dimensions
- **Design**: ${result.dimensions.design.width}x${result.dimensions.design.height}
- **Screenshot**: ${result.dimensions.actual.width}x${result.dimensions.actual.height}
- **Compared at**: ${result.dimensions.compared.width}x${result.dimensions.compared.height}
${result.resized ? "- *Note: Images were resized for comparison*" : ""}

### Feedback
${result.feedback.map(f => `- ${f}`).join("\n")}

### Artifacts
- Design: \`${result.artifacts.design}\`
- Screenshot: \`${result.artifacts.actual}\`
- Diff: \`${result.artifacts.diff}\`
- Overlay: \`${result.artifacts.overlay}\`
`;
}
