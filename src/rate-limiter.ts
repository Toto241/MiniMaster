/**
 * Distributed Rate Limiter with Firestore-backed cross-instance enforcement.
 * Falls back to in-memory limiting when Firestore is unavailable.
 *
 * Design:
 * - Uses Firestore documents as rate-limit counters for strict cross-instance enforcement
 * - In-memory cache reduces Firestore reads (TTL-based)
 * - Role-based limits (master, admin, support, child)
 * - Sliding window algorithm for accurate rate limiting
 */
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { db } from "../firebase";

// ==================== CONFIGURATION ====================

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  blockDurationMs?: number;  // how long to block after exceeding
}

// Role-based rate limits
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // Master (parent) users
  master_default: { maxRequests: 60, windowMs: 60000 },
  master_pairing: { maxRequests: 10, windowMs: 60000 },
  master_task_create: { maxRequests: 20, windowMs: 60000 },
  master_lock: { maxRequests: 30, windowMs: 60000 },
  master_purchase: { maxRequests: 10, windowMs: 3600000 },  // 10 per hour

  // Child devices
  child_default: { maxRequests: 120, windowMs: 60000 },
  child_heartbeat: { maxRequests: 60, windowMs: 60000 },
  child_task_complete: { maxRequests: 30, windowMs: 60000 },
  child_event_publish: { maxRequests: 60, windowMs: 60000 },

  // Admin users
  admin_default: { maxRequests: 300, windowMs: 60000 },
  admin_export: { maxRequests: 5, windowMs: 3600000 },  // 5 per hour
  admin_ai_analysis: { maxRequests: 10, windowMs: 3600000 },
  admin_reset: { maxRequests: 3, windowMs: 86400000 },  // 3 per day

  // Support users
  support_default: { maxRequests: 200, windowMs: 60000 },
  support_debug_grant: { maxRequests: 20, windowMs: 60000 },

  // Public/anonymous
  public_default: { maxRequests: 10, windowMs: 60000 },
};

// ==================== IN-MEMORY CACHE ====================

interface CacheEntry {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Periodic cleanup of stale cache entries (skipped in test mode to avoid Jest open-handle timeouts)
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of memoryCache.entries()) {
      if (entry.windowStart + 2 * 60000 < now) {
        memoryCache.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      functions.logger.debug(`Rate limiter cache cleanup: removed ${cleaned} stale entries`);
    }
  }, CACHE_CLEANUP_INTERVAL_MS);
}

// ==================== FIRESTORE BACKEND ====================

/**
 * Firestore hands back rate-limit documents as untyped `DocumentData` (`any`-valued).
 * This narrow shape declares only the fields this module reads. Timestamp fields are
 * stored as `admin.firestore.Timestamp`; the `?.toMillis?.()` reads tolerate legacy
 * raw-number values, hence the numeric fallbacks at the call sites.
 */
interface RateLimitDoc {
  windowStart?: admin.firestore.Timestamp;
  count?: number;
  blockedUntil?: admin.firestore.Timestamp;
}

const RATE_LIMIT_COLLECTION = "_rate_limits";
async function checkFirestoreRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const docRef = db().collection(RATE_LIMIT_COLLECTION).doc(key);

    const result = await db().runTransaction(async (tx) => {
      const doc = await tx.get(docRef);
      const data = (doc.exists ? doc.data() : null) as RateLimitDoc | null;

      const windowStart = data?.windowStart?.toMillis?.() || (data?.windowStart as number | undefined) || 0;
      const currentCount = data?.count || 0;
      const blockedUntil = data?.blockedUntil?.toMillis?.() || (data?.blockedUntil as number | undefined) || 0;

      // Check if currently blocked
      if (blockedUntil > now) {
        return { allowed: false, remaining: 0, resetAt: blockedUntil };
      }

      // New window
      if (now - windowStart > config.windowMs) {
        tx.set(docRef, {
          count: 1,
          windowStart: admin.firestore.Timestamp.fromMillis(now),
          blockedUntil: null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt: now + config.windowMs,
        };
      }

      // Existing window
      if (currentCount >= config.maxRequests) {
        const blockUntil = now + (config.blockDurationMs || config.windowMs);
        tx.set(docRef, {
          blockedUntil: admin.firestore.Timestamp.fromMillis(blockUntil),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return { allowed: false, remaining: 0, resetAt: blockUntil };
      }

      tx.set(docRef, {
        count: currentCount + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        allowed: true,
        remaining: config.maxRequests - currentCount - 1,
        resetAt: windowStart + config.windowMs,
      };
    });

    return result;
  } catch (error) {
    functions.logger.warn(`Firestore rate limit check failed for ${key}, falling back to memory:`, error);
    return checkMemoryRateLimit(key, config, now);
  }
}

// ==================== MEMORY BACKEND ====================

function checkMemoryRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const entry = memoryCache.get(key);

  if (!entry || now - entry.windowStart > config.windowMs) {
    memoryCache.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  // Check block
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, remaining: 0, resetAt: entry.blockedUntil };
  }

  if (entry.count >= config.maxRequests) {
    const blockUntil = now + (config.blockDurationMs || config.windowMs);
    entry.blockedUntil = blockUntil;
    return { allowed: false, remaining: 0, resetAt: blockUntil };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.windowStart + config.windowMs,
  };
}

// ==================== PUBLIC API ====================

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
  windowMs: number;
}

/**
 * Checks rate limit for a user+action combination.
 * Uses Firestore for distributed enforcement with in-memory fallback.
 */
export async function checkDistributedRateLimit(
  userId: string,
  action: string,
  userRole = "master",
  options?: {
    maxRequests?: number;
    windowMs?: number;
    blockDurationMs?: number;
  }
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = `${userRole}:${action}:${userId}`;

  // Build config
  const configKey = `${userRole}_${action}`;
  const defaultConfig = DEFAULT_LIMITS[configKey] ||
    DEFAULT_LIMITS[`${userRole}_default`] || DEFAULT_LIMITS.master_default;
  const config: RateLimitConfig = {
    ...(defaultConfig || { maxRequests: 100, windowMs: 60000 }),
    ...options,
  } as RateLimitConfig;

  const result = await checkFirestoreRateLimit(key, config, now);

  return {
    ...result,
    limit: config.maxRequests,
    windowMs: config.windowMs,
  };
}

/**
 * Express-style middleware for Cloud Functions.
 * Throws HttpsError if rate limit exceeded.
 */
export async function requireRateLimit(
  userId: string,
  action: string,
  userRole = "master",
  options?: {
    maxRequests?: number;
    windowMs?: number;
  }
): Promise<RateLimitResult> {
  const result = await checkDistributedRateLimit(userId, action, userRole, options);

  if (!result.allowed) {
    functions.logger.warn(`Rate limit exceeded: user=${userId}, action=${action}, role=${userRole}`);
    throw new functions.https.HttpsError(
      "resource-exhausted",
      `Rate limit exceeded for action '${action}'. Try again in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s.`,
      { retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000) }
    );
  }

  return result;
}

/**
 * Legacy compatibility wrapper (in-memory only).
 * Use requireRateLimit for new code.
 */
export function checkRateLimitLegacy(
  userId: string,
  action: string,
  maxRequests = 30,
  windowMs = 60000
): void {
  const key = `${action}:${userId}`;
  const now = Date.now();
  const entry = memoryCache.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    memoryCache.set(key, { count: 1, windowStart: now });
    return;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many requests. Please try again later."
    );
  }
}

// ==================== ADMIN FUNCTIONS ====================

export async function getRateLimitMetrics(): Promise<{
  activeLimits: number;
  blockedUsers: number;
  topActions: Array<{ action: string; count: number }>;
}> {
  try {
    const snapshot = await db().collection(RATE_LIMIT_COLLECTION)
      .where("blockedUntil", ">", admin.firestore.Timestamp.now())
      .limit(500)
      .get();

    const blockedUsers = snapshot.size;

    // Count by action type (from document IDs)
    const actionCounts: Record<string, number> = {};
    for (const doc of snapshot.docs) {
      const parts = doc.id.split(":");
      if (parts.length >= 2) {
        const action = parts[1]!;
        actionCounts[action] = (actionCounts[action] || 0) + 1;
      }
    }

    const topActions = Object.entries(actionCounts)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      activeLimits: memoryCache.size,
      blockedUsers,
      topActions,
    };
  } catch (error) {
    functions.logger.error("Failed to get rate limit metrics:", error);
    return { activeLimits: memoryCache.size, blockedUsers: 0, topActions: [] };
  }
}

export async function resetRateLimit(userId: string, action: string, userRole = "master"): Promise<void> {
  const key = `${userRole}:${action}:${userId}`;
  memoryCache.delete(key);

  try {
    await db().collection(RATE_LIMIT_COLLECTION).doc(key).delete();
  } catch (error) {
    functions.logger.warn(`Failed to reset Firestore rate limit for ${key}:`, error);
  }
}
