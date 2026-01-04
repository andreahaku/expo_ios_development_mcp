/**
 * Retry utility for transient failures
 */

import { logger } from "./logger.js";
import { McpOperationError, type ErrorCode } from "./errors.js";

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay between retries in ms (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to delay (default: true) */
  jitter?: boolean;
  /** Error codes that should be retried */
  retryableCodes?: ErrorCode[];
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Called when a retry occurs */
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;
}

const DEFAULT_RETRYABLE_CODES: ErrorCode[] = [
  "SIMCTL_TIMEOUT",
  "TIMEOUT",
  "DETOX_TEST_FAILED",
];

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    jitter = true,
    retryableCodes = DEFAULT_RETRYABLE_CODES,
    isRetryable,
    onRetry,
  } = options ?? {};

  let lastError: unknown;
  let delayMs = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      let shouldRetry = false;

      if (isRetryable) {
        shouldRetry = isRetryable(error);
      } else if (error instanceof McpOperationError) {
        shouldRetry = retryableCodes.includes(error.code);
      } else if (error instanceof Error) {
        // Retry on common transient errors
        const message = error.message.toLowerCase();
        shouldRetry =
          message.includes("timeout") ||
          message.includes("connection refused") ||
          message.includes("econnreset") ||
          message.includes("temporarily unavailable");
      }

      // Don't retry if not retryable or if this was the last attempt
      if (!shouldRetry || attempt >= maxAttempts) {
        logger.warn("retry", `${operation} failed after ${attempt} attempts`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }

      // Calculate delay with jitter
      let currentDelay = Math.min(delayMs, maxDelayMs);
      if (jitter) {
        currentDelay = currentDelay * (0.5 + Math.random());
      }

      logger.info("retry", `${operation} failed, retrying in ${Math.round(currentDelay)}ms`, {
        attempt,
        maxAttempts,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      if (onRetry) {
        onRetry(attempt, error, currentDelay);
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, currentDelay));

      // Increase delay for next attempt
      delayMs *= backoffMultiplier;
    }
  }

  // Should never reach here, but just in case
  throw lastError;
}

/**
 * Create a retryable version of a function
 */
export function retryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  operation: string,
  options?: RetryOptions
): T {
  return (async (...args: Parameters<T>) => {
    return withRetry(operation, () => fn(...args), options);
  }) as T;
}
