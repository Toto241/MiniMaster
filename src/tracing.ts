/**
 * Distributed Tracing Module for MiniMaster Cloud Functions.
 *
 * Provides per-invocation trace context (traceId + spanId) that is injected into
 * every log statement, audit entry, and sub-operation. Integrates with Google Cloud
 * Trace by extracting X-Cloud-Trace-Context headers so logs are automatically grouped
 * in Google Cloud Logging and visible in the Cloud Trace UI.
 *
 * Usage (callable functions):
 *   const trace = extractTraceContext(context, "myFunction");
 *   const logger = new TracedLogger(trace);
 *   logger.info("Something happened", { key: "value" });
 *   await AuditLogger.logSuccess(action, context, resource, type, { ...meta, traceId: trace.traceId });
 *
 * Usage (triggers / scheduled functions):
 *   const trace = createTraceContext("myTrigger");
 *   const logger = new TracedLogger(trace);
 */
import * as functions from "firebase-functions/v1";
import type { CallableContext } from "firebase-functions/v1/https";
import { v4 as uuidv4 } from "uuid";

// ==================== TRACE CONTEXT ====================

export interface TraceContext {
  /** Unique ID for this function invocation.  Reuses the GCP Cloud Trace ID when available. */
  traceId: string;
  /** 16-hex-char span ID identifying this top-level function call. */
  spanId: string;
  /** Logical name of the function being traced. */
  functionName: string;
  /** Unix timestamp (ms) when the invocation started. */
  startTime: number;
}

/**
 * Builds a TraceContext for a Firebase callable function.
 *
 * When an `X-Cloud-Trace-Context` header is present (GCP automatically injects one),
 * its trace ID is reused so the structured log entries are linked to the Cloud Trace span.
 * Otherwise a fresh UUID is generated.
 */
export function extractTraceContext(context: CallableContext, functionName: string): TraceContext {
  // Firebase callable functions expose raw HTTP headers via context.rawRequest.
  // Header format: <TRACE_ID>/<SPAN_ID>;o=<TRACE_OPTIONS>
  const cloudTraceHeader =
    (context.rawRequest?.headers?.["x-cloud-trace-context"] as string | undefined) ?? "";

  const traceId = cloudTraceHeader
    ? (cloudTraceHeader.split("/")[0] || uuidv4())
    : uuidv4();

  return {
    traceId,
    spanId: uuidv4().replace(/-/g, "").substring(0, 16),
    functionName,
    startTime: Date.now(),
  };
}

/**
 * Builds a TraceContext for background triggers and scheduled functions
 * that do not have a CallableContext.
 */
export function createTraceContext(functionName: string): TraceContext {
  return {
    traceId: uuidv4(),
    spanId: uuidv4().replace(/-/g, "").substring(0, 16),
    functionName,
    startTime: Date.now(),
  };
}

// ==================== TRACED LOGGER ====================

/**
 * Wraps `functions.logger` and automatically injects `traceId`, `spanId`, and
 * `functionName` into every structured log entry.  All log lines for a single
 * function invocation share the same `traceId`, enabling end-to-end correlation
 * in Google Cloud Logging.
 */
export class TracedLogger {
  constructor(private readonly ctx: TraceContext) {}

  private enrich(extra?: Record<string, unknown>): Record<string, unknown> {
    return {
      traceId: this.ctx.traceId,
      spanId: this.ctx.spanId,
      functionName: this.ctx.functionName,
      ...extra,
    };
  }

  info(message: string, extra?: Record<string, unknown>): void {
    functions.logger.info(message, this.enrich(extra));
  }

  warn(message: string, extra?: Record<string, unknown>): void {
    functions.logger.warn(message, this.enrich(extra));
  }

  /** Accepts either an Error object or a plain extra-fields map as the second argument. */
  error(message: string, errorOrExtra?: unknown, extra?: Record<string, unknown>): void {
    if (errorOrExtra instanceof Error) {
      const enriched = this.enrich({ ...extra, error: errorOrExtra.message, stack: errorOrExtra.stack });
      functions.logger.error(message, enriched);
    } else {
      functions.logger.error(message, this.enrich({ ...extra, ...(errorOrExtra as Record<string, unknown> ?? {}) }));
    }
  }

  /** Returns elapsed milliseconds since the function invocation started. */
  elapsed(): number {
    return Date.now() - this.ctx.startTime;
  }

  /**
   * Begins tracking a named sub-operation (Firestore read, FCM send, …).
   * Call the returned function when the operation completes to emit a span-completion log.
   *
   * @example
   *   const endSpan = logger.startSpan("firestore.read");
   *   const doc = await ref.get();
   *   endSpan();
   */
  startSpan(name: string): () => void {
    const spanStart = Date.now();
    this.info(`Span started: ${name}`, { span: name });
    return () => {
      this.info(`Span completed: ${name}`, { span: name, spanDurationMs: Date.now() - spanStart });
    };
  }
}
