/**
 * Unit tests for src/tracing.ts (previously uncovered).
 * Covers trace-context extraction (header reuse / fallback), context creation,
 * and the TracedLogger enrichment + span helpers.
 */
jest.mock("firebase-functions/v1", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import * as functions from "firebase-functions/v1";
import {
  extractTraceContext,
  createTraceContext,
  TracedLogger,
  type TraceContext,
} from "../src/tracing";

const loggerMock = functions.logger as unknown as {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("tracing: extractTraceContext", () => {
  it("reuses the Cloud Trace id from the request header", () => {
    const context = {
      rawRequest: { headers: { "x-cloud-trace-context": "abc123def456/9999;o=1" } },
    } as never;
    const trace = extractTraceContext(context, "myFn");
    expect(trace.traceId).toBe("abc123def456");
    expect(trace.functionName).toBe("myFn");
    expect(trace.spanId).toHaveLength(16);
    expect(typeof trace.startTime).toBe("number");
  });

  it("generates a uuid when no trace header is present", () => {
    const context = { rawRequest: { headers: {} } } as never;
    const trace = extractTraceContext(context, "noHeaderFn");
    expect(trace.traceId).toMatch(UUID_RE);
  });

  it("falls back to a uuid when the header has an empty trace segment", () => {
    const context = {
      rawRequest: { headers: { "x-cloud-trace-context": "/9999;o=1" } },
    } as never;
    const trace = extractTraceContext(context, "emptySegFn");
    expect(trace.traceId).toMatch(UUID_RE);
  });

  it("falls back to a uuid when rawRequest is absent", () => {
    const trace = extractTraceContext({} as never, "noReqFn");
    expect(trace.traceId).toMatch(UUID_RE);
  });
});

describe("tracing: createTraceContext", () => {
  it("creates a fresh context with a uuid trace id and 16-char span", () => {
    const trace = createTraceContext("trigger");
    expect(trace.traceId).toMatch(UUID_RE);
    expect(trace.spanId).toHaveLength(16);
    expect(trace.functionName).toBe("trigger");
  });
});

describe("tracing: TracedLogger", () => {
  const ctx: TraceContext = {
    traceId: "trace-1",
    spanId: "span-1",
    functionName: "fn-1",
    startTime: Date.now() - 50,
  };
  beforeEach(() => {
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
  });

  it("enriches info logs with trace fields and extra data", () => {
    const logger = new TracedLogger(ctx);
    logger.info("hello", { key: "value" });
    expect(loggerMock.info).toHaveBeenCalledWith("hello", {
      traceId: "trace-1",
      spanId: "span-1",
      functionName: "fn-1",
      key: "value",
    });
  });

  it("enriches warn logs", () => {
    const logger = new TracedLogger(ctx);
    logger.warn("careful");
    expect(loggerMock.warn).toHaveBeenCalledWith("careful", expect.objectContaining({ traceId: "trace-1" }));
  });

  it("serializes an Error argument into message + stack", () => {
    const logger = new TracedLogger(ctx);
    const err = new Error("boom");
    logger.error("failed", err, { op: "x" });
    expect(loggerMock.error).toHaveBeenCalledWith(
      "failed",
      expect.objectContaining({ error: "boom", op: "x", traceId: "trace-1", stack: expect.any(String) })
    );
  });

  it("merges a plain extra-fields object when not an Error", () => {
    const logger = new TracedLogger(ctx);
    logger.error("failed", { code: 42 });
    expect(loggerMock.error).toHaveBeenCalledWith("failed", expect.objectContaining({ code: 42, traceId: "trace-1" }));
  });

  it("tolerates an undefined error argument", () => {
    const logger = new TracedLogger(ctx);
    logger.error("failed");
    expect(loggerMock.error).toHaveBeenCalledWith("failed", expect.objectContaining({ traceId: "trace-1" }));
  });

  it("reports elapsed time since start", () => {
    const logger = new TracedLogger(ctx);
    expect(logger.elapsed()).toBeGreaterThanOrEqual(40);
  });

  it("startSpan logs start and completion", () => {
    const logger = new TracedLogger(ctx);
    const end = logger.startSpan("firestore.read");
    expect(loggerMock.info).toHaveBeenCalledWith("Span started: firestore.read", expect.objectContaining({ span: "firestore.read" }));
    end();
    expect(loggerMock.info).toHaveBeenCalledWith(
      "Span completed: firestore.read",
      expect.objectContaining({ span: "firestore.read", spanDurationMs: expect.any(Number) })
    );
  });
});
