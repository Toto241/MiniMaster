/**
 * Global Error Handler & Monitoring Integration.
 * Provides consistent error handling across all Cloud Functions with:
 * - Structured error logging
 * - Performance metrics collection
 * - Automatic error classification
 * - Integration with audit logging
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import * as admin from "firebase-admin";
import { db } from "../firebase";


// ==================== ERROR CLASSIFICATION ====================

export type ErrorCategory =
  | "validation"      // input validation errors
  | "authentication"  // auth/unauthenticated errors
  | "authorization"   // permission denied
  | "not_found"       // resource not found
  | "rate_limit"      // too many requests
  | "external_api"    // third-party API failures
  | "database"        // Firestore/database errors
  | "internal"        // unexpected internal errors
  | "configuration";  // missing config/env vars

export interface ClassifiedError {
  category: ErrorCategory;
  severity: "low" | "medium" | "high" | "critical";
  userMessage: string;
  internalMessage: string;
  httpCode: functions.https.FunctionsErrorCode;
  retryable: boolean;
  metadata: Record<string, unknown>;
}

/**
 * Classifies an error into a structured format for consistent handling.
 */
export function classifyError(error: unknown, context?: { functionName?: string; userId?: string }): ClassifiedError {
  const defaults: ClassifiedError = {
    category: "internal",
    severity: "medium",
    userMessage: "An unexpected error occurred. Please try again later.",
    internalMessage: error instanceof Error ? error.message : String(error),
    httpCode: "internal",
    retryable: false,
    metadata: { functionName: context?.functionName, userId: context?.userId },
  };

  if (error instanceof functions.https.HttpsError) {
    switch (error.code) {
      case "invalid-argument":
        return { ...defaults, category: "validation", severity: "low", httpCode: error.code, userMessage: error.message };
      case "unauthenticated":
        return { ...defaults, category: "authentication", severity: "medium", httpCode: error.code, userMessage: "Please sign in to continue." };
      case "permission-denied":
        return { ...defaults, category: "authorization", severity: "medium", httpCode: error.code, userMessage: "You do not have permission to perform this action." };
      case "not-found":
        return { ...defaults, category: "not_found", severity: "low", httpCode: error.code, userMessage: "The requested resource was not found." };
      case "resource-exhausted":
        return { ...defaults, category: "rate_limit", severity: "medium", httpCode: error.code, userMessage: error.message, retryable: true };
      case "failed-precondition":
        return { ...defaults, category: "configuration", severity: "medium", httpCode: error.code, userMessage: error.message };
      case "unavailable":
        return { ...defaults, category: "external_api", severity: "high", httpCode: error.code, userMessage: "Service temporarily unavailable. Please try again later.", retryable: true };
      case "deadline-exceeded":
        return { ...defaults, category: "external_api", severity: "high", httpCode: error.code, userMessage: "The request timed out. Please try again.", retryable: true };
      default:
        return { ...defaults, httpCode: error.code, userMessage: error.message };
    }
  }

  // Check for specific error patterns
  const message = String(error instanceof Error ? error.message : error);

  if (message.includes("Firestore") || message.includes("transaction")) {
    return { ...defaults, category: "database", severity: "high", retryable: true };
  }

  if (message.includes(" Gemini ") || message.includes("googleapis") || message.includes("androidpublisher")) {
    return { ...defaults, category: "external_api", severity: "high", retryable: true };
  }

  if (message.includes("rate limit") || message.includes("quota")) {
    return { ...defaults, category: "rate_limit", severity: "medium", retryable: true };
  }

  if (message.includes("not found") || message.includes("does not exist")) {
    return { ...defaults, category: "not_found", severity: "low", httpCode: "not-found" };
  }

  if (message.includes("config") || message.includes("environment") || message.includes("not set")) {
    return { ...defaults, category: "configuration", severity: "critical" };
  }

  return defaults;
}

// ==================== PERFORMANCE METRICS ====================

interface FunctionMetrics {
  invocations: number;
  errors: number;
  latencyMs: number[];
  lastError?: string;
  lastErrorAt?: Date;
}

const metricsMap = new Map<string, FunctionMetrics>();

export function recordInvocation(functionName: string, latencyMs: number, error?: Error): void {
  const existing = metricsMap.get(functionName) || { invocations: 0, errors: 0, latencyMs: [] };
  existing.invocations++;
  existing.latencyMs.push(latencyMs);

  // Keep only last 100 latency samples
  if (existing.latencyMs.length > 100) {
    existing.latencyMs = existing.latencyMs.slice(-100);
  }

  if (error) {
    existing.errors++;
    existing.lastError = error.message;
    existing.lastErrorAt = new Date();
  }

  metricsMap.set(functionName, existing);
}

export function getFunctionMetrics(functionName: string): FunctionMetrics | undefined {
  return metricsMap.get(functionName);
}

export function getAllMetrics(): Record<string, FunctionMetrics> {
  return Object.fromEntries(metricsMap);
}

export function calculatePercentile(sortedArray: number[], percentile: number): number {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, index)]!;
}

// ==================== STRUCTURED ERROR LOGGING ====================

export async function logStructuredError(
  error: unknown,
  context: {
    functionName: string;
    callableContext?: CallableContext | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const classified = classifyError(error, {
    functionName: context.functionName,
    userId: context.callableContext?.auth?.uid,
  });

  const logEntry = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    functionName: context.functionName,
    userId: context.callableContext?.auth?.uid || "anonymous",
    userRole: context.callableContext?.auth?.token?.role || "unknown",
    category: classified.category,
    severity: classified.severity,
    message: classified.internalMessage,
    httpCode: classified.httpCode,
    retryable: classified.retryable,
    ...context.metadata,
  };

  // Log to Firestore for persistence
  try {
    await db().collection("error_logs").add(logEntry);
  } catch (dbError) {
    functions.logger.error("Failed to persist error log:", dbError);
  }

  // Log to Cloud Functions logger
  const logMethod = classified.severity === "critical" || classified.severity === "high"
    ? functions.logger.error
    : classified.severity === "medium"
      ? functions.logger.warn
      : functions.logger.info;

  logMethod(`[${classified.category}] ${context.functionName}: ${classified.internalMessage}`, {
    ...logEntry,
    timestamp: new Date().toISOString(),
  });
}

// ==================== WRAPPER FOR CONSISTENT ERROR HANDLING ====================

/**
 * Wraps a callable function handler with consistent error handling,
 * metrics collection, and structured logging.
 *
 * Usage:
 *   export const myFunction = functions.https.onCall(
 *     withErrorHandling("myFunction", async (data, context) => { ... })
 *   );
 */
export function withErrorHandling<T, R>(
  functionName: string,
  handler: (data: T, context: CallableContext) => Promise<R>
): (data: T, context: CallableContext) => Promise<R> {
  return async (data: T, context: CallableContext): Promise<R> => {
    const startTime = Date.now();

    try {
      const result = await handler(data, context);
      const latency = Date.now() - startTime;
      recordInvocation(functionName, latency);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      recordInvocation(functionName, latency, error instanceof Error ? error : new Error(String(error)));

      await logStructuredError(error, {
        functionName,
        callableContext: context,
        metadata: { dataKeys: data != null ? Object.keys(data as object) : [] },
      });

      // Re-throw HttpsErrors as-is, wrap others
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      const classified = classifyError(error, { functionName });
      throw new functions.https.HttpsError(
        classified.httpCode,
        classified.userMessage,
        { originalError: classified.internalMessage, category: classified.category }
      );
    }
  };
}

/**
 * Creates a user-friendly error response for the client.
 * Includes retry hints for retryable errors.
 */
export function buildErrorResponse(error: ClassifiedError): {
  success: false;
  error: {
    message: string;
    code: string;
    category: ErrorCategory;
    retryable: boolean;
    retryAfter?: number;
  };
} {
  return {
    success: false,
    error: {
      message: error.userMessage,
      code: error.httpCode,
      category: error.category,
      retryable: error.retryable,
      ...(error.retryable ? { retryAfter: 30 } : {}),
    },
  };
}

// ==================== HEALTH CHECK METRICS ====================

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: Array<{
    name: string;
    status: "ok" | "warning" | "error";
    message?: string;
    latencyMs?: number;
  }>;
  metrics: {
    totalInvocations: number;
    totalErrors: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
  };
}

export function getHealthStatus(): HealthStatus {
  let totalInvocations = 0;
  let totalErrors = 0;
  let totalLatency = 0;
  let latencyCount = 0;
  const allLatencies: number[] = [];

  for (const [, metrics] of metricsMap) {
    totalInvocations += metrics.invocations;
    totalErrors += metrics.errors;
    for (const lat of metrics.latencyMs) {
      totalLatency += lat;
      latencyCount++;
      allLatencies.push(lat);
    }
  }

  allLatencies.sort((a, b) => a - b);

  const errorRate = totalInvocations > 0 ? (totalErrors / totalInvocations) * 100 : 0;
  const avgLatencyMs = latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0;
  const p95LatencyMs = calculatePercentile(allLatencies, 95);

  let status: "healthy" | "degraded" | "unhealthy" = "healthy";
  if (errorRate > 10 || p95LatencyMs > 5000) {
    status = "unhealthy";
  } else if (errorRate > 5 || p95LatencyMs > 2000) {
    status = "degraded";
  }

  return {
    status,
    checks: [
      {
        name: "error_rate",
        status: errorRate > 10 ? "error" : errorRate > 5 ? "warning" : "ok",
        message: `${errorRate.toFixed(1)}% error rate`,
      },
      {
        name: "latency_p95",
        status: p95LatencyMs > 5000 ? "error" : p95LatencyMs > 2000 ? "warning" : "ok",
        message: `P95: ${p95LatencyMs}ms`,
      },
    ],
    metrics: {
      totalInvocations,
      totalErrors,
      errorRate: Math.round(errorRate * 100) / 100,
      avgLatencyMs,
      p95LatencyMs,
    },
  };
}
