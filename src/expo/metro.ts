/**
 * Metro bundler readiness detection
 */

export interface MetroStatus {
  ready: boolean;
  url?: string;
  port?: number;
}

// Patterns to detect Metro readiness from output
const METRO_READY_PATTERNS = [
  /Metro waiting on (exp:\/\/[\w\d.:-]+)/,
  /Metro waiting on (http:\/\/[\w\d.:-]+)/,
  /Bundler URL: (https?:\/\/[\w\d.:-]+)/,
  /Running on (https?:\/\/[\w\d.:-]+)/,
  /Dev server listening on (https?:\/\/[\w\d.:-]+)/,
  /›.*Press.*to open/i, // Expo CLI ready indicator
];

const METRO_ERROR_PATTERNS = [
  /error:/i,
  /failed to start/i,
  /EADDRINUSE/,
  /Unable to start server/i,
];

export function detectMetroReady(output: string): MetroStatus {
  // Check for errors first
  for (const pattern of METRO_ERROR_PATTERNS) {
    if (pattern.test(output)) {
      return { ready: false };
    }
  }

  // Look for ready patterns
  for (const pattern of METRO_READY_PATTERNS) {
    const match = output.match(pattern);
    if (match) {
      const url = match[1];
      const portMatch = url?.match(/:(\d+)/);
      return {
        ready: true,
        url,
        port: portMatch ? parseInt(portMatch[1], 10) : undefined,
      };
    }
  }

  // Also check for the simple ready indicator
  if (output.includes("Welcome to Expo") || output.includes("Starting Metro")) {
    // Metro is starting but not yet ready
    return { ready: false };
  }

  // Check if logs show bundling complete
  if (output.includes("Bundle complete") || output.includes("Ready")) {
    return { ready: true };
  }

  return { ready: false };
}

export function extractMetroUrl(output: string): string | null {
  const status = detectMetroReady(output);
  return status.url ?? null;
}

export function isMetroError(output: string): boolean {
  for (const pattern of METRO_ERROR_PATTERNS) {
    if (pattern.test(output)) {
      return true;
    }
  }
  return false;
}

export function extractBundleProgress(output: string): number | null {
  // Look for bundling progress indicators
  const progressMatch = output.match(/(\d+)%/);
  if (progressMatch) {
    return parseInt(progressMatch[1], 10);
  }
  return null;
}
