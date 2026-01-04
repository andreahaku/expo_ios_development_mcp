/**
 * Concurrency lock to prevent simultaneous operations on the same resource
 */

import { createError } from "./errors.js";
import { logger } from "./logger.js";

export interface LockInfo {
  resource: string;
  operation: string;
  acquiredAt: string;
  timeoutMs?: number;
}

class LockManager {
  private locks: Map<string, LockInfo> = new Map();

  /**
   * Acquire a lock on a resource
   */
  acquire(resource: string, operation: string, options?: { timeoutMs?: number }): boolean {
    const existing = this.locks.get(resource);

    if (existing) {
      // Check if lock has expired
      if (existing.timeoutMs) {
        const acquiredTime = new Date(existing.acquiredAt).getTime();
        const elapsed = Date.now() - acquiredTime;
        if (elapsed > existing.timeoutMs) {
          logger.warn("lock", `Lock on ${resource} expired, releasing`, {
            operation: existing.operation,
            elapsed,
          });
          this.locks.delete(resource);
        } else {
          logger.warn("lock", `Cannot acquire lock on ${resource}, already locked`, {
            currentOperation: existing.operation,
            requestedOperation: operation,
          });
          return false;
        }
      } else {
        logger.warn("lock", `Cannot acquire lock on ${resource}, already locked`, {
          currentOperation: existing.operation,
          requestedOperation: operation,
        });
        return false;
      }
    }

    const lockInfo: LockInfo = {
      resource,
      operation,
      acquiredAt: new Date().toISOString(),
      timeoutMs: options?.timeoutMs,
    };

    this.locks.set(resource, lockInfo);
    logger.debug("lock", `Lock acquired on ${resource}`, { operation });
    return true;
  }

  /**
   * Release a lock on a resource
   */
  release(resource: string): void {
    if (this.locks.has(resource)) {
      const lockInfo = this.locks.get(resource);
      this.locks.delete(resource);
      logger.debug("lock", `Lock released on ${resource}`, { operation: lockInfo?.operation });
    }
  }

  /**
   * Check if a resource is locked
   */
  isLocked(resource: string): boolean {
    const lock = this.locks.get(resource);
    if (!lock) return false;

    // Check expiry
    if (lock.timeoutMs) {
      const acquiredTime = new Date(lock.acquiredAt).getTime();
      const elapsed = Date.now() - acquiredTime;
      if (elapsed > lock.timeoutMs) {
        this.locks.delete(resource);
        return false;
      }
    }

    return true;
  }

  /**
   * Get current lock info for a resource
   */
  getLockInfo(resource: string): LockInfo | undefined {
    return this.locks.get(resource);
  }

  /**
   * Get all active locks
   */
  getAllLocks(): LockInfo[] {
    return Array.from(this.locks.values());
  }

  /**
   * Clear all locks (use with caution)
   */
  clearAll(): void {
    this.locks.clear();
    logger.info("lock", "All locks cleared");
  }
}

export const lockManager = new LockManager();

/**
 * Execute an operation with a lock
 * Automatically releases lock when operation completes or fails
 */
export async function withLock<T>(
  resource: string,
  operation: string,
  fn: () => Promise<T>,
  options?: { timeoutMs?: number; waitForLock?: boolean; waitTimeoutMs?: number }
): Promise<T> {
  const { waitForLock = false, waitTimeoutMs = 30000 } = options ?? {};

  // Try to acquire lock
  let acquired = lockManager.acquire(resource, operation, { timeoutMs: options?.timeoutMs });

  // Optionally wait for lock
  if (!acquired && waitForLock) {
    const startTime = Date.now();
    while (!acquired && Date.now() - startTime < waitTimeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      acquired = lockManager.acquire(resource, operation, { timeoutMs: options?.timeoutMs });
    }
  }

  if (!acquired) {
    const lockInfo = lockManager.getLockInfo(resource);
    throw createError("INTERNAL_ERROR", `Resource '${resource}' is locked`, {
      details: lockInfo
        ? `Currently running: ${lockInfo.operation} (since ${lockInfo.acquiredAt})`
        : "Unknown operation",
      customRemediation: "Wait for the current operation to complete or cancel it.",
    });
  }

  try {
    return await fn();
  } finally {
    lockManager.release(resource);
  }
}
