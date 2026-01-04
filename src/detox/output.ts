/**
 * Detox test output parsing
 * Extracts MCP result markers from test stdout
 */

import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";

export interface DetoxActionResult {
  ok: boolean;
  elapsedMs?: number;
  data?: Record<string, unknown>;
  error?: {
    message: string;
    name: string;
    stack?: string;
  };
}

const MCP_RESULT_PATTERN = /\[MCP_RESULT\](.*?)\[\/MCP_RESULT\]/s;

export function parseDetoxOutput(stdout: string): DetoxActionResult {
  const match = stdout.match(MCP_RESULT_PATTERN);

  if (!match) {
    logger.warn("detox", "No MCP_RESULT marker found in output", {
      stdout: stdout.slice(-1000),
    });

    // Try to detect common Detox errors
    if (stdout.includes("Element not found")) {
      return {
        ok: false,
        error: {
          name: "DetoxError",
          message: "Element not found - check selector or wait for element",
        },
      };
    }

    if (stdout.includes("Timeout")) {
      return {
        ok: false,
        error: {
          name: "TimeoutError",
          message: "Action timed out",
        },
      };
    }

    return {
      ok: false,
      error: {
        name: "ParseError",
        message: "Could not parse Detox output - no result marker found",
      },
    };
  }

  try {
    const result = JSON.parse(match[1]) as DetoxActionResult;
    return result;
  } catch (error) {
    logger.error("detox", "Failed to parse MCP_RESULT JSON", {
      raw: match[1],
      error: error instanceof Error ? error.message : "Unknown",
    });

    return {
      ok: false,
      error: {
        name: "ParseError",
        message: `Failed to parse result JSON: ${error instanceof Error ? error.message : "Unknown"}`,
      },
    };
  }
}

export function detectTestFailure(stdout: string, stderr: string): string | null {
  // Check for Jest test failures
  if (stdout.includes("FAIL") || stderr.includes("FAIL")) {
    const failMatch = stdout.match(/●\s+(.+)/);
    if (failMatch) {
      return failMatch[1];
    }
    return "Test failed";
  }

  // Check for Detox errors
  if (stderr.includes("DetoxError")) {
    const errorMatch = stderr.match(/DetoxError:\s+(.+)/);
    if (errorMatch) {
      return errorMatch[1];
    }
  }

  // Check for element not found
  if (stdout.includes("Cannot find") || stderr.includes("Cannot find")) {
    return "Element not found";
  }

  return null;
}

export function extractScreenshotPath(result: DetoxActionResult): string | null {
  if (result.data && typeof result.data.screenshotPath === "string") {
    return result.data.screenshotPath;
  }
  return null;
}
