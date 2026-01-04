/**
 * Detox Action Runner
 * Generates and executes micro-tests for UI automation
 */

import { execa } from "execa";
import { writeFile, mkdir, unlink, readFile } from "fs/promises";
import { join, dirname } from "path";
import { existsSync } from "fs";
import ejs from "ejs";
import { v4 as uuidv4 } from "uuid";

import { createError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import { stateManager } from "../core/state.js";
import { artifactManager } from "../core/artifacts.js";
import { getConfig, hasConfig } from "../config/load.js";
import { parseDetoxOutput, detectTestFailure, type DetoxActionResult } from "./output.js";
import { takeScreenshot } from "../simulator/screenshots.js";

// Load template at module level
let templateContent: string | null = null;

async function loadTemplate(): Promise<string> {
  if (templateContent) return templateContent;

  const templatePath = join(
    dirname(new URL(import.meta.url).pathname),
    "../../scripts/detox-action-template.ejs"
  );

  templateContent = await readFile(templatePath, "utf-8");
  return templateContent;
}

export interface RunnerOptions {
  actionName: string;
  actionSnippet: string;
  launchApp?: boolean;
  captureData?: boolean;
  timeoutMs?: number;
}

export interface RunnerResult {
  success: boolean;
  elapsedMs?: number;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  evidence?: string[];
}

export async function runDetoxAction(options: RunnerOptions): Promise<RunnerResult> {
  const { actionName, actionSnippet, launchApp = true, captureData = false, timeoutMs } = options;

  logger.info("detox", `Running action: ${actionName}`);

  // Validate state
  if (!stateManager.isDetoxReady()) {
    throw createError("DETOX_NOT_READY", "Detox session not ready", {
      details: "Call detox.session.start first",
    });
  }

  if (!hasConfig()) {
    throw createError("CONFIG_NOT_FOUND", "Configuration required for Detox actions");
  }

  const config = getConfig();
  const timeout = timeoutMs ?? config.detox.testTimeoutMs;

  // Generate unique test file
  const testId = uuidv4().slice(0, 8);
  const testDir = join(config.projectPath, ".mcp-detox-tmp");
  const testFile = join(testDir, `mcp-action-${testId}.test.js`);

  try {
    // Ensure test directory exists
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }

    // Generate test file from template
    const template = await loadTemplate();
    const testCode = ejs.render(template, {
      timestamp: new Date().toISOString(),
      actionName,
      actionSnippet,
      launchApp,
      captureData,
    });

    await writeFile(testFile, testCode, "utf-8");
    logger.debug("detox", `Generated test file: ${testFile}`);

    // Run Detox test
    const detoxBinary = join(config.projectPath, config.detox.detoxBinary);
    const args = [
      "test",
      "--configuration",
      config.detox.configuration,
      "--testNamePattern",
      "^mcp_action run$",
      testFile,
    ];

    if (config.detox.reuseSession) {
      args.push("--reuse");
    }

    logger.debug("detox", `Executing: ${detoxBinary} ${args.join(" ")}`);

    const result = await execa(detoxBinary, args, {
      cwd: config.projectPath,
      timeout,
      reject: false,
      env: {
        ...process.env,
        DETOX_LOGLEVEL: "verbose",
      },
    });

    // Log output
    if (result.stdout) {
      logger.debug("detox", `stdout: ${result.stdout.slice(-2000)}`);
    }
    if (result.stderr) {
      logger.debug("detox", `stderr: ${result.stderr.slice(-1000)}`);
    }

    // Parse result
    const actionResult = parseDetoxOutput(result.stdout);

    if (actionResult.ok) {
      logger.info("detox", `Action ${actionName} completed successfully`, {
        elapsedMs: actionResult.elapsedMs,
      });

      return {
        success: true,
        elapsedMs: actionResult.elapsedMs,
        data: actionResult.data,
      };
    }

    // Action failed - collect evidence
    const evidence: string[] = [];

    try {
      const screenshot = await takeScreenshot(`error-${actionName}`);
      evidence.push(screenshot.path);
    } catch {
      logger.warn("detox", "Failed to capture error screenshot");
    }

    const logEvidence = logger.formatForEvidence("detox", 150);
    const logPath = await artifactManager.getLogPath(`error-${actionName}`);
    await writeFile(logPath, logEvidence, "utf-8");
    evidence.push(logPath);

    const failure = detectTestFailure(result.stdout, result.stderr);

    return {
      success: false,
      elapsedMs: actionResult.elapsedMs,
      error: {
        code: "DETOX_TEST_FAILED",
        message: actionResult.error?.message ?? failure ?? "Action failed",
        details: actionResult.error?.stack,
      },
      evidence,
    };
  } finally {
    // Cleanup test file
    try {
      if (existsSync(testFile)) {
        await unlink(testFile);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

export async function startDetoxSession(configuration?: string): Promise<{
  sessionId: string;
  configuration: string;
}> {
  logger.info("detox", "Starting Detox session");

  if (!hasConfig()) {
    throw createError("CONFIG_NOT_FOUND", "Configuration required for Detox session");
  }

  const config = getConfig();
  const detoxConfig = configuration ?? config.detox.configuration;
  const sessionId = uuidv4();

  stateManager.updateDetox({
    state: "starting",
    configuration: detoxConfig,
  });

  // Run a warmup/healthcheck action
  try {
    // Generate a simple noop test to warm up Detox
    const template = await loadTemplate();
    const warmupCode = ejs.render(template, {
      timestamp: new Date().toISOString(),
      actionName: "warmup",
      actionSnippet: "// Warmup - no action",
      launchApp: true,
      captureData: false,
    });

    const testDir = join(config.projectPath, ".mcp-detox-tmp");
    const testFile = join(testDir, "mcp-warmup.test.js");

    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }

    await writeFile(testFile, warmupCode, "utf-8");

    const detoxBinary = join(config.projectPath, config.detox.detoxBinary);
    const args = [
      "test",
      "--configuration",
      detoxConfig,
      "--testNamePattern",
      "^mcp_action run$",
      testFile,
    ];

    const result = await execa(detoxBinary, args, {
      cwd: config.projectPath,
      timeout: config.detox.testTimeoutMs,
      reject: false,
    });

    // Cleanup
    try {
      await unlink(testFile);
    } catch {
      // Ignore
    }

    if (result.exitCode !== 0) {
      stateManager.updateDetox({ state: "failed" });
      throw createError("DETOX_SESSION_FAILED", "Failed to start Detox session", {
        details: result.stderr || result.stdout,
      });
    }

    stateManager.updateDetox({
      state: "ready",
      sessionId,
    });

    logger.info("detox", `Detox session started: ${sessionId}`);

    return {
      sessionId,
      configuration: detoxConfig,
    };
  } catch (error) {
    stateManager.updateDetox({ state: "failed" });
    throw error;
  }
}

export async function stopDetoxSession(): Promise<void> {
  logger.info("detox", "Stopping Detox session");

  const detoxState = stateManager.getDetox();

  if (detoxState.state === "idle") {
    logger.info("detox", "No active session to stop");
    return;
  }

  // Cleanup temp directory
  if (hasConfig()) {
    const config = getConfig();
    const testDir = join(config.projectPath, ".mcp-detox-tmp");

    try {
      const { rm } = await import("fs/promises");
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  stateManager.updateDetox({
    state: "idle",
    sessionId: undefined,
    configuration: undefined,
  });

  logger.info("detox", "Detox session stopped");
}

export async function healthCheck(): Promise<{
  ready: boolean;
  state: string;
  sessionId?: string;
}> {
  const detoxState = stateManager.getDetox();

  return {
    ready: detoxState.state === "ready",
    state: detoxState.state,
    sessionId: detoxState.sessionId,
  };
}
