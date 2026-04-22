/**
 * Tests for the Error Handler module.
 * Covers error classification, metrics, and health status.
 */
import {
  classifyError,
  getHealthStatus,
  getFunctionMetrics,
  getAllMetrics,
  recordInvocation,
  buildErrorResponse,
} from "../src/error-handler";
import * as functions from "firebase-functions/v1";

describe("classifyError", () => {
  it("classifies validation errors", () => {
    const error = new functions.https.HttpsError("invalid-argument", "Bad input");
    const classified = classifyError(error, { functionName: "testFunc" });
    expect(classified.category).toBe("validation");
    expect(classified.severity).toBe("low");
    expect(classified.httpCode).toBe("invalid-argument");
    expect(classified.retryable).toBe(false);
  });

  it("classifies authentication errors", () => {
    const error = new functions.https.HttpsError("unauthenticated", "Sign in required");
    const classified = classifyError(error);
    expect(classified.category).toBe("authentication");
    expect(classified.userMessage).toBe("Please sign in to continue.");
  });

  it("classifies permission errors", () => {
    const error = new functions.https.HttpsError("permission-denied", "No access");
    const classified = classifyError(error);
    expect(classified.category).toBe("authorization");
    expect(classified.severity).toBe("medium");
  });

  it("classifies rate limit errors", () => {
    const error = new functions.https.HttpsError("resource-exhausted", "Too many requests");
    const classified = classifyError(error);
    expect(classified.category).toBe("rate_limit");
    expect(classified.retryable).toBe(true);
  });

  it("classifies unavailable errors", () => {
    const error = new functions.https.HttpsError("unavailable", "Service down");
    const classified = classifyError(error);
    expect(classified.category).toBe("external_api");
    expect(classified.severity).toBe("high");
    expect(classified.retryable).toBe(true);
  });

  it("classifies deadline exceeded", () => {
    const error = new functions.https.HttpsError("deadline-exceeded", "Timeout");
    const classified = classifyError(error);
    expect(classified.category).toBe("external_api");
    expect(classified.retryable).toBe(true);
  });

  it("classifies generic errors as internal", () => {
    const error = new Error("Something went wrong");
    const classified = classifyError(error);
    expect(classified.category).toBe("internal");
    expect(classified.severity).toBe("medium");
  });

  it("classifies Firestore errors", () => {
    const error = new Error("Firestore transaction failed");
    const classified = classifyError(error);
    expect(classified.category).toBe("database");
    expect(classified.retryable).toBe(true);
  });

  it("classifies Gemini API errors", () => {
    const error = new Error("Gemini API returned 500");
    const classified = classifyError(error);
    expect(classified.category).toBe("external_api");
  });

  it("classifies configuration errors as critical", () => {
    const error = new Error("GEMINI_API_KEY not set in environment");
    const classified = classifyError(error);
    expect(classified.category).toBe("configuration");
    expect(classified.severity).toBe("critical");
  });

  it("handles non-Error objects", () => {
    const classified = classifyError("string error");
    expect(classified.category).toBe("internal");
    expect(classified.internalMessage).toBe("string error");
  });

  it("includes function context metadata", () => {
    const error = new Error("test");
    const classified = classifyError(error, { functionName: "myFunc", userId: "user123" });
    expect(classified.metadata.functionName).toBe("myFunc");
    expect(classified.metadata.userId).toBe("user123");
  });
});

describe("recordInvocation", () => {
  it("records successful invocation", () => {
    recordInvocation("testFunc", 100);
    const metrics = getFunctionMetrics("testFunc");
    expect(metrics).toBeDefined();
    expect(metrics!.invocations).toBe(1);
    expect(metrics!.errors).toBe(0);
    expect(metrics!.latencyMs).toContain(100);
  });

  it("records failed invocation", () => {
    recordInvocation("testFunc", 200, new Error("fail"));
    const metrics = getFunctionMetrics("testFunc");
    expect(metrics!.errors).toBe(1);
    expect(metrics!.lastError).toBe("fail");
    expect(metrics!.lastErrorAt).toBeInstanceOf(Date);
  });

  it("accumulates multiple invocations", () => {
    recordInvocation("accumFunc", 50);
    recordInvocation("accumFunc", 100);
    recordInvocation("accumFunc", 150);
    const metrics = getFunctionMetrics("accumFunc");
    expect(metrics!.invocations).toBe(3);
    expect(metrics!.latencyMs.length).toBe(3);
  });

  it("limits latency samples to 100", () => {
    for (let i = 0; i < 110; i++) {
      recordInvocation("limitFunc", i);
    }
    const metrics = getFunctionMetrics("limitFunc");
    expect(metrics!.latencyMs.length).toBe(100);
  });
});

describe("getHealthStatus", () => {
  it("returns healthy for no data", () => {
    const health = getHealthStatus();
    expect(health.status).toBe("healthy");
  });

  it("returns healthy with low error rate", () => {
    recordInvocation("func1", 100);
    recordInvocation("func1", 150);
    const health = getHealthStatus();
    expect(health.status).toBe("healthy");
    expect(health.metrics.errorRate).toBe(0);
  });

  it("returns degraded with moderate error rate", () => {
    for (let i = 0; i < 10; i++) {
      recordInvocation("degradedFunc", 100, new Error("fail"));
    }
    recordInvocation("degradedFunc", 100);
    const health = getHealthStatus();
    expect(health.status).toBe("degraded");
  });

  it("returns degraded with high latency", () => {
    for (let i = 0; i < 10; i++) {
      recordInvocation("slowFunc", 3000);
    }
    const health = getHealthStatus();
    expect(["degraded", "unhealthy"]).toContain(health.status);
  });

  it("returns unhealthy with high error rate", () => {
    for (let i = 0; i < 10; i++) {
      recordInvocation("unhealthyFunc", 100, new Error("fail"));
    }
    const health = getHealthStatus();
    expect(health.status).toBe("unhealthy");
    expect(health.metrics.errorRate).toBeGreaterThan(10);
  });

  it("includes checks array", () => {
    const health = getHealthStatus();
    expect(health.checks.length).toBeGreaterThan(0);
    expect(health.checks[0].name).toBeDefined();
    expect(health.checks[0].status).toMatch(/ok|warning|error/);
  });

  it("includes metrics", () => {
    recordInvocation("metricsFunc", 100);
    const health = getHealthStatus();
    expect(health.metrics.totalInvocations).toBeGreaterThan(0);
    expect(health.metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
    expect(health.metrics.p95LatencyMs).toBeGreaterThanOrEqual(0);
  });
});

describe("getAllMetrics", () => {
  it("returns all recorded metrics", () => {
    recordInvocation("allMetricsFunc", 50);
    const metrics = getAllMetrics();
    expect(metrics["allMetricsFunc"]).toBeDefined();
  });
});

describe("buildErrorResponse", () => {
  it("builds correct error response", () => {
    const classified = {
      category: "validation" as const,
      severity: "low" as const,
      userMessage: "Invalid input",
      internalMessage: "field missing",
      httpCode: "invalid-argument" as functions.https.FunctionsErrorCode,
      retryable: false,
      metadata: {},
    };
    const response = buildErrorResponse(classified);
    expect(response.success).toBe(false);
    expect(response.error.message).toBe("Invalid input");
    expect(response.error.code).toBe("invalid-argument");
    expect(response.error.category).toBe("validation");
    expect(response.error.retryable).toBe(false);
    expect(response.error.retryAfter).toBeUndefined();
  });

  it("includes retryAfter for retryable errors", () => {
    const classified = {
      category: "rate_limit" as const,
      severity: "medium" as const,
      userMessage: "Too many requests",
      internalMessage: "rate limit exceeded",
      httpCode: "resource-exhausted" as functions.https.FunctionsErrorCode,
      retryable: true,
      metadata: {},
    };
    const response = buildErrorResponse(classified);
    expect(response.error.retryable).toBe(true);
    expect(response.error.retryAfter).toBe(30);
  });
});
