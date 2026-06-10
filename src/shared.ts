/**
 * Shared utilities, types, and infrastructure used across all Cloud Function modules.
 * This file contains authentication helpers, rate limiting, audit logging, and error handling.
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";
import { extractTraceContext, TracedLogger } from "./tracing";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const AUDIT_LOG_RETENTION_DAYS = 90;
const ERROR_LOG_RETENTION_DAYS = 60;

export function buildTtlTimestamp(retentionDays: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromMillis(Date.now() + (retentionDays * DAY_IN_MS));
}

// ==================== AUTH HELPERS ====================

export function requireAuth(context: CallableContext): string {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }
  return context.auth.uid;
}

export type OperatorRole = "admin" | "support" | "auditor";

export function requireAdmin(context: CallableContext): void {
  if (context.auth?.token.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required.");
  }
}

export function requireSupportOrAdmin(context: CallableContext): void {
  const role = context.auth?.token?.role;
  if (!context.auth || (role !== "admin" && role !== "support")) {
    throw new functions.https.HttpsError("permission-denied", "Support or admin privileges required.");
  }
}

export function requireAuditorOrAbove(context: CallableContext): void {
  const role = context.auth?.token?.role;
  if (!context.auth || (role !== "admin" && role !== "support" && role !== "auditor")) {
    throw new functions.https.HttpsError("permission-denied", "Operator privileges required.");
  }
}

export type SessionTier = "T1" | "T2" | "T3" | "T4";

const SESSION_TIER_MAX_MINUTES: Record<SessionTier, number> = {
  T1: 15,
  T2: 8 * 60,
  T3: 2 * 60,
  T4: 30,
};

export function getSessionAgeMinutes(context: CallableContext): number {
  const authTime = context.auth?.token?.auth_time;
  if (typeof authTime !== "number") return 0;
  return (Date.now() / 1000 - authTime) / 60;
}

/**
 * Enforces maximum session age for privileged operator actions (AP-N3 Phase 2).
 * T4 additionally requires a fresh admin_verified_at custom claim when present.
 */
export function requireTier(context: CallableContext, minTier: SessionTier, actionName: string): void {
  requireAuth(context);
  const sessionAgeMinutes = getSessionAgeMinutes(context);
  const maxMinutes = SESSION_TIER_MAX_MINUTES[minTier];
  if (sessionAgeMinutes > maxMinutes) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      `Session tier ${minTier} required for ${actionName}. Re-authenticate and retry.`
    );
  }

  if (minTier === "T4") {
    const verifiedAt = context.auth?.token?.admin_verified_at;
    if (typeof verifiedAt === "number") {
      const verifiedAgeMinutes = (Date.now() / 1000 - verifiedAt) / 60;
      if (verifiedAgeMinutes > SESSION_TIER_MAX_MINUTES.T4) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Admin verification expired for ${actionName}. Confirm admin PIN and retry.`
        );
      }
    }
  }
}

/** Re-export for T4 callables that also require configured admin PIN verification. */
export { requireAdminPinVerification } from "./admin-pin";

/**
 * Verifies that the authenticated user (master) owns the specified child document.
 * Prevents cross-tenant access for child-related operations.
 */
export async function requireMasterOwnership(context: CallableContext, childId: string): Promise<string> {
  const masterId = requireAuth(context);
  const childDoc = await db().collection("children").doc(childId).get();
  if (!childDoc.exists || childDoc.data()?.masterImei !== masterId) {
    throw new functions.https.HttpsError("permission-denied", "Not the owner of this child device.");
  }
  return masterId;
}

// ==================== RATE LIMITING ====================

// Cloud Functions instances are ephemeral and horizontally scaled.
// The shared rate limiter (src/rate-limiter.ts) provides strict cross-instance
// enforcement via Firestore. The in-memory fallback below is kept only for
// bootstrapping and local dev.

const rateLimitStore: Map<string, { count: number; windowStart: number }> = new Map();
let hasLoggedBestEffortRateLimit = false;

/**
 * Best-effort in-memory rate limiter.
 * DEPRECATED: Use requireRateLimit from rate-limiter.ts for production code.
 * Kept for backward compatibility and local dev / emulator.
 */
export function checkRateLimit(
  userId: string,
  action: string,
  maxRequests = 30,
  windowMs = 60000
): void {
  if (!hasLoggedBestEffortRateLimit && process.env.NODE_ENV === "production") {
    hasLoggedBestEffortRateLimit = true;
    functions.logger.warn(
      "Using best-effort in-memory rate limiting. Use requireRateLimit for strict cross-instance enforcement.",
      { action }
    );
  }

  const key = `${action}:${userId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return;
  }

  entry.count++;
  if (entry.count > maxRequests) {
    functions.logger.warn(`Rate limit exceeded for user ${userId} on action ${action}`);
    throw new functions.https.HttpsError(
      "resource-exhausted",
      "Too many requests. Please try again later."
    );
  }
}

/**
 * STRICT cross-instance rate limiter (wrapper around rate-limiter.ts).
 * Uses Firestore-backed distributed enforcement. This should be used
 * for all security-critical endpoints (auth, pairing, admin).
 */
export async function checkRateLimitShared(
  userId: string,
  action: string,
  maxRequests = 30,
  windowMs = 60000
): Promise<void> {
  const { requireRateLimit } = await import("./rate-limiter");
  await requireRateLimit(userId, action, "master", {
    maxRequests,
    windowMs,
  });
}

// ==================== APP CHECK ====================

export function validateAppCheck(context: CallableContext, enforce = false): void {
  if (!context.app && enforce) {
    if (process.env.NODE_ENV === "test") {
      functions.logger.info("App Check bypassed in test mode.", {
        uid: context.auth?.uid || "anonymous",
      });
      return;
    }
    functions.logger.warn("App Check token missing or invalid.", {
      uid: context.auth?.uid || "anonymous",
    });
    throw new functions.https.HttpsError(
      "permission-denied",
      "App Check verification failed. Please update your app."
    );
  }
  if (!context.app) {
    functions.logger.info("App Check token not present (log-only mode).", {
      uid: context.auth?.uid || "anonymous",
    });
  }
}

// ==================== AUDIT LOGGING ====================

export type AuditAction =
  | "device.register"
  | "device.lock"
  | "device.unlock"
  | "device.pair"
  | "device.unpair"
  | "device.delete"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "task.approve"
  | "task.reject"
  | "task.complete"
  | "rules.update_blacklist"
  | "rules.update_usage"
  | "rules.update_screen_time"
  | "auth.login"
  | "auth.logout"
  | "auth.token_generated"
  | "auth.token_revoked"
  | "admin.grant_support_access"
  | "admin.revoke_support_access"
  | "admin.set_admin_claim"
  | "admin.set_admin_pin"
  | "admin.verify_admin_pin"
  | "admin.reset_operator_accounts"
  | "admin.user_impersonation"
  | "admin.revoke_subscription"
  | "ai.explain_problem"
  | "ai.error_analysis"
  | "ai.auto_fix"
  | "subscription.verify_purchase"
  | "subscription.activated"
  | "subscription.trial_started"
  | "subscription.trial_expired"
  | "subscription.reverify"
  | "system.heartbeat"
  | "system.error"
  | "operator.setup_checklist_update"
  | "affiliate.register"
  | "admin.affiliate.review"
  | "admin.affiliate.payouts"
  | "admin.b2b.create"
  | "admin.b2b.activate"
  | "admin.b2b.add_device"
  | "admin.b2b.remove_device"
  | "admin.b2b.revoke"
  | "gdpr.dsar_export"
  | "acceptance.run_submitted";

export interface AuditLog {
  timestamp: admin.firestore.Timestamp;
  ttl?: admin.firestore.Timestamp;
  userId: string;
  userRole: "master" | "child" | "admin" | "support" | "unknown";
  action: AuditAction;
  resource: string;
  resourceType: "device" | "task" | "rule" | "subscription" | "user" | "system";
  status: "success" | "failure" | "denied";
  metadata: { [key: string]: any };
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
  duration?: number;
}

export class AuditLogger {
  private static collection = () => db().collection("audit_logs");

  static async log(
    action: AuditAction,
    userId: string,
    userRole: string,
    resource: string,
    resourceType: string,
    status: "success" | "failure" | "denied",
    metadata: Record<string, any> = {},
    error?: Error
  ): Promise<void> {
    try {
      const logEntry: AuditLog = {
        timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
        userId,
        userRole: userRole as any,
        action,
        resource,
        resourceType: resourceType as any,
        status,
        metadata,
        errorMessage: error?.message,
        ttl: buildTtlTimestamp(AUDIT_LOG_RETENTION_DAYS),
      };

      await this.collection().add(logEntry);

      const logPayload = { action, userId, status, traceId: metadata?.traceId };
      if (status === "failure" || status === "denied") {
        functions.logger.error("Audit Event", { ...logPayload, error: error?.message });
      } else {
        functions.logger.info("Audit Event", logPayload);
      }
    } catch (loggingError) {
      functions.logger.error("Failed to write audit log", { error: loggingError });
    }
  }

  static async logSuccess(
    action: AuditAction,
    context: CallableContext,
    resource: string,
    resourceType: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!context.auth) return;
    await this.log(
      action, context.auth.uid, (context.auth.token.role as string) || "unknown",
      resource, resourceType, "success", metadata
    );
  }

  static async logFailure(
    action: AuditAction,
    context: CallableContext | null,
    resource: string,
    resourceType: string,
    error: Error,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    await this.log(
      action, context?.auth?.uid || "anonymous", (context?.auth?.token?.role as string) || "unknown",
      resource, resourceType, "failure", metadata, error
    );
  }

  static async logDenied(
    action: AuditAction,
    context: CallableContext,
    resource: string,
    resourceType: string,
    reason: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    if (!context.auth) return;
    await this.log(
      action, context.auth.uid, (context.auth.token.role as string) || "unknown",
      resource, resourceType, "denied", { ...metadata, reason }
    );
  }
}

// ==================== ERROR HANDLING ====================

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public severity: "low" | "medium" | "high" | "critical",
    public metadata: Record<string, any> = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handleError(
  error: Error,
  context: CallableContext | null,
  functionName: string
): Promise<void> {
  const errorDetails = {
    functionName,
    message: error.message,
    stack: error.stack,
    userId: context?.auth?.uid,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ttl: buildTtlTimestamp(ERROR_LOG_RETENTION_DAYS),
  };

  try {
    await db().collection("error_logs").add(errorDetails);
    functions.logger.error("Function Error", { ...errorDetails, timestamp: new Date().toISOString() });

    if (error instanceof AppError && error.severity === "critical") {
      functions.logger.error("CRITICAL ERROR", { ...errorDetails, timestamp: new Date().toISOString() });
    }
  } catch (loggingError) {
    functions.logger.error("Failed to log error", { error: loggingError });
  }
}

// ==================== SUBSCRIPTION / TRIAL ACCESS ====================

/**
 * Result of getTracedLogger containing both the logger and the raw trace context.
 */
export interface TracedLoggerResult {
  logger: TracedLogger;
  traceId: string;
  spanId: string;
}

/**
 * Creates a TracedLogger for a callable function invocation.
 * Extracts trace context from the callable context (including GCP Cloud Trace header
 * when available) and returns a logger that injects traceId/spanId into every log entry.
 */
export function getTracedLogger(context: CallableContext, functionName: string): TracedLoggerResult {
  const trace = extractTraceContext(context, functionName);
  return { logger: new TracedLogger(trace), traceId: trace.traceId, spanId: trace.spanId };
}

export function hasActiveAccess(masterData: admin.firestore.DocumentData | undefined): boolean {
  if (!masterData) return false;
  const subscription = masterData.subscription;
  if (!subscription) return false;

  if (subscription.status === "active") return true;

  if (subscription.status === "trial" && subscription.trialEndsAt) {
    const trialEnd = subscription.trialEndsAt instanceof admin.firestore.Timestamp
      ? subscription.trialEndsAt.toMillis()
      : subscription.trialEndsAt;
    return Date.now() < trialEnd;
  }

  return false;
}
