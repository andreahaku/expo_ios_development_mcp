/**
 * Wrapper for xcrun simctl commands
 */

import { execa, type ExecaError } from "execa";
import { createError, type ErrorCode } from "../core/errors.js";
import { logger } from "../core/logger.js";

export interface SimctlResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function simctl(
  args: string[],
  options: { timeoutMs?: number; cwd?: string } = {}
): Promise<SimctlResult> {
  const { timeoutMs = 60000, cwd } = options;
  const cmd = "xcrun";
  const fullArgs = ["simctl", ...args];

  logger.debug("simulator", `Executing: ${cmd} ${fullArgs.join(" ")}`, {
    timeout: timeoutMs,
    cwd,
  });

  try {
    const result = await execa(cmd, fullArgs, {
      timeout: timeoutMs,
      reject: false,
      cwd,
    });

    logger.debug("simulator", `Command completed with exit code ${result.exitCode}`, {
      stdout: result.stdout?.slice(0, 500),
      stderr: result.stderr?.slice(0, 500),
    });

    return {
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } catch (error) {
    const execaError = error as ExecaError;

    if (execaError.timedOut) {
      throw createError("SIMCTL_TIMEOUT", `simctl command timed out after ${timeoutMs}ms`, {
        details: `Command: xcrun ${fullArgs.join(" ")}`,
      });
    }

    throw createError("SIMCTL_FAILED", `simctl command failed: ${execaError.message}`, {
      details: `Command: xcrun ${fullArgs.join(" ")}\nError: ${execaError.message}`,
    });
  }
}

export function parseSimctlError(stderr: string): { code: ErrorCode; message: string } {
  if (stderr.includes("Invalid device")) {
    return { code: "SIM_NOT_FOUND", message: "Device not found" };
  }
  if (stderr.includes("Unable to boot device in current state: Booted")) {
    return { code: "SIM_NOT_BOOTED", message: "Device is already booted" };
  }
  if (stderr.includes("Unable to boot device in current state: Shutdown")) {
    return { code: "SIM_NOT_BOOTED", message: "Device is shut down" };
  }
  return { code: "SIMCTL_FAILED", message: stderr || "Unknown simctl error" };
}
