/**
 * Error taxonomy for LLM-friendly error reporting
 */

export type ErrorCode =
  | "SIM_NOT_BOOTED"
  | "SIM_NOT_FOUND"
  | "SIMCTL_FAILED"
  | "SIMCTL_TIMEOUT"
  | "EXPO_NOT_RUNNING"
  | "EXPO_START_FAILED"
  | "EXPO_CRASHED"
  | "EXPO_RELOAD_FAILED"
  | "EXPO_DEV_MENU_FAILED"
  | "DETOX_NOT_READY"
  | "DETOX_SESSION_FAILED"
  | "DETOX_TEST_FAILED"
  | "ELEMENT_NOT_FOUND"
  | "ELEMENT_NOT_VISIBLE"
  | "TIMEOUT"
  | "VISUAL_DIFF_TOO_HIGH"
  | "VISUAL_BASELINE_NOT_FOUND"
  | "VISUAL_SIZE_MISMATCH"
  | "CONFIG_INVALID"
  | "CONFIG_NOT_FOUND"
  | "ARTIFACT_WRITE_FAILED"
  | "INTERNAL_ERROR";

export interface McpError {
  code: ErrorCode;
  message: string;
  details?: string;
  remediation?: string;
  evidence?: string[];
}

export class McpOperationError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: string;
  public readonly remediation?: string;
  public readonly evidence?: string[];

  constructor(error: McpError) {
    super(error.message);
    this.name = "McpOperationError";
    this.code = error.code;
    this.details = error.details;
    this.remediation = error.remediation;
    this.evidence = error.evidence;
  }

  toMcpError(): McpError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      remediation: this.remediation,
      evidence: this.evidence,
    };
  }
}

export const ErrorRemediation: Record<ErrorCode, string> = {
  SIM_NOT_BOOTED:
    "Boot the simulator first using simulator.boot or wait for it to finish booting.",
  SIM_NOT_FOUND:
    "Check available simulators with simulator.list_devices and use a valid device name or UDID.",
  SIMCTL_FAILED:
    "Check Xcode installation and that Command Line Tools are properly configured.",
  SIMCTL_TIMEOUT:
    "The simulator operation timed out. Try again or check if the simulator is responsive.",
  EXPO_NOT_RUNNING:
    "Start Expo/Metro first using expo.start before running UI commands.",
  EXPO_START_FAILED:
    "Check that the Expo project path is correct and dependencies are installed.",
  EXPO_CRASHED:
    "Expo/Metro crashed. Check expo logs and restart with expo.start.",
  EXPO_RELOAD_FAILED:
    "Failed to reload the app. Check that Expo is running and responsive.",
  EXPO_DEV_MENU_FAILED:
    "Failed to open dev menu. Check that Expo is running and the simulator is active.",
  DETOX_NOT_READY:
    "Initialize Detox session first using detox.session.start.",
  DETOX_SESSION_FAILED:
    "Detox session initialization failed. Check Detox configuration and that the app is installed.",
  DETOX_TEST_FAILED:
    "The Detox action failed. Check the element selector and app state.",
  ELEMENT_NOT_FOUND:
    "Element not found. Verify the testID/selector exists in the current screen.",
  ELEMENT_NOT_VISIBLE:
    "Element exists but is not visible. It may be off-screen or hidden.",
  TIMEOUT:
    "Operation timed out. The app may be busy or the element may not appear.",
  VISUAL_DIFF_TOO_HIGH:
    "Visual difference exceeds threshold. Review the diff image to understand changes.",
  VISUAL_BASELINE_NOT_FOUND:
    "No baseline image found. Save a baseline first using visual.baseline.save.",
  VISUAL_SIZE_MISMATCH:
    "Screenshot dimensions differ from baseline. Device or orientation may have changed.",
  CONFIG_INVALID:
    "Configuration file is invalid. Check mcp.config.json format and required fields.",
  CONFIG_NOT_FOUND:
    "Configuration file not found. Create mcp.config.json or set MCP_CONFIG environment variable.",
  ARTIFACT_WRITE_FAILED:
    "Failed to write artifact. Check disk space and directory permissions.",
  INTERNAL_ERROR:
    "An unexpected internal error occurred. Check server logs for details.",
};

export function createError(
  code: ErrorCode,
  message: string,
  options?: {
    details?: string;
    evidence?: string[];
    customRemediation?: string;
  }
): McpOperationError {
  return new McpOperationError({
    code,
    message,
    details: options?.details,
    remediation: options?.customRemediation ?? ErrorRemediation[code],
    evidence: options?.evidence,
  });
}
