/**
 * Expo/Metro log capture and parsing
 */

import { logger, type LogEntry } from "../core/logger.js";

export interface ExpoLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source: "metro" | "expo" | "app";
}

// Patterns to categorize log lines
const LOG_PATTERNS = {
  error: [/error:/i, /❌/, /failed/i, /exception/i, /crash/i],
  warn: [/warning:/i, /⚠️/, /deprecated/i, /caution/i],
  debug: [/debug:/i, /verbose:/i],
};

export function parseLogLine(line: string): ExpoLogEntry {
  const timestamp = new Date().toISOString();
  let level: ExpoLogEntry["level"] = "info";
  let source: ExpoLogEntry["source"] = "expo";

  // Determine log level
  for (const pattern of LOG_PATTERNS.error) {
    if (pattern.test(line)) {
      level = "error";
      break;
    }
  }
  if (level === "info") {
    for (const pattern of LOG_PATTERNS.warn) {
      if (pattern.test(line)) {
        level = "warn";
        break;
      }
    }
  }
  if (level === "info") {
    for (const pattern of LOG_PATTERNS.debug) {
      if (pattern.test(line)) {
        level = "debug";
        break;
      }
    }
  }

  // Determine source
  if (line.includes("Metro") || line.includes("bundle")) {
    source = "metro";
  } else if (line.includes("LOG") || line.includes("console.")) {
    source = "app";
  }

  return {
    timestamp,
    level,
    message: line,
    source,
  };
}

export function processExpoOutput(
  output: string,
  type: "stdout" | "stderr"
): void {
  const lines = output.split("\n").filter((line) => line.trim());

  for (const line of lines) {
    const entry = parseLogLine(line);

    // Log to the expo ring buffer
    switch (entry.level) {
      case "error":
        logger.error("expo", entry.message, { source: entry.source });
        break;
      case "warn":
        logger.warn("expo", entry.message, { source: entry.source });
        break;
      case "debug":
        logger.debug("expo", entry.message, { source: entry.source });
        break;
      default:
        logger.info("expo", entry.message, { source: entry.source });
    }
  }
}

export function getExpoLogs(lines: number = 100): LogEntry[] {
  return logger.tail("expo", lines);
}

export function formatExpoLogsForEvidence(lines: number = 150): string {
  return logger.formatForEvidence("expo", lines);
}
