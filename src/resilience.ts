/**
 * Resilience Patterns Module — Circuit Breaker, Retry with Exponential Backoff,
 * and Timeout Wrappers for external API calls (Gemini, Play Store, FCM).
 *
 * Design decisions:
 * - In-memory circuit state (acceptable for Cloud Functions as each instance
 *   handles a subset of traffic; for strict cross-instance CB use Firestore)
 * - Half-open state allows a single probe request before closing
 * - All timings in milliseconds
 */
import * as functions from "firebase-functions/v1";

// ==================== TYPES ====================

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;    // failures before opening
  resetTimeoutMs: number;      // time before half-open
  halfOpenMaxCalls: number;    // probe calls in half-open
  successThreshold: number;    // successes needed to close from half-open
}

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrors: string[];   // error codes/patterns that trigger retry
}

export interface TimeoutOptions {
  timeoutMs: number;
}

// ==================== DEFAULTS ====================

const DEFAULT_CB_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 1,
  successThreshold: 2,
};

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryableErrors: ["unavailable", "internal", "deadline-exceeded", "timeout", "ETIMEDOUT", "ECONNRESET", "messaging/server-unavailable"],
};

// ==================== CIRCUIT BREAKER ====================

class CircuitBreaker {
  private state: CircuitState = "closed";
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;

  constructor(
    private name: string,
    private options: CircuitBreakerOptions = DEFAULT_CB_OPTIONS
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs) {
        this.state = "half-open";
        this.halfOpenCalls = 0;
        this.successes = 0;
        functions.logger.info(`Circuit breaker '${this.name}' entering half-open state`);
      } else {
        throw new functions.https.HttpsError(
          "unavailable",
          `Service '${this.name}' is temporarily unavailable. Please try again later.`
        );
      }
    }

    if (this.state === "half-open" && this.halfOpenCalls >= this.options.halfOpenMaxCalls) {
      throw new functions.https.HttpsError(
        "unavailable",
        `Service '${this.name}' is probing. Please try again later.`
      );
    }

    if (this.state === "half-open") {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.state = "closed";
        this.failures = 0;
        this.successes = 0;
        this.halfOpenCalls = 0;
        functions.logger.info(`Circuit breaker '${this.name}' closed after successful probes`);
      }
    } else {
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      this.state = "open";
      functions.logger.warn(`Circuit breaker '${this.name}' reopened after half-open failure`);
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = "open";
      functions.logger.error(`Circuit breaker '${this.name}' opened after ${this.failures} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getMetrics(): { state: CircuitState; failures: number; successes: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    };
  }
}

// ==================== CIRCUIT BREAKER REGISTRY ====================

const circuitBreakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(
  name: string,
  options?: Partial<CircuitBreakerOptions>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    const merged: CircuitBreakerOptions = {
      ...DEFAULT_CB_OPTIONS,
      ...options,
    };
    circuitBreakers.set(name, new CircuitBreaker(name, merged));
  }
  return circuitBreakers.get(name)!;
}

export function resetCircuitBreaker(name: string): void {
  circuitBreakers.delete(name);
}

// ==================== RETRY WITH EXPONENTIAL BACKOFF ====================

/**
 * Executes a function with retry logic and exponential backoff.
 * Only retries on transient errors (configurable).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as { code?: string }).code || "";
      const isRetryable = opts.retryableErrors.some(
        (pattern) => errorMessage.includes(pattern) || errorCode.includes(pattern)
      );

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw error;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        opts.maxDelayMs
      );

      functions.logger.warn(
        `Retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms: ${errorMessage}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Retry logic exhausted");
}

// ==================== TIMEOUT WRAPPER ====================

/**
 * Wraps a promise with a timeout.
 * Uses AbortController for cancellable operations.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operationName = "operation"
): Promise<T> {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timerId);
    return result;
  } catch (error) {
    clearTimeout(timerId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        `${operationName} timed out after ${timeoutMs}ms`
      );
    }
    throw error;
  }
}

/**
 * Convenience wrapper for fetch with timeout.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 30000, ...fetchInit } = init;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchInit,
      signal: controller.signal,
    });
    clearTimeout(timerId);
    return response;
  } catch (error) {
    clearTimeout(timerId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new functions.https.HttpsError(
        "deadline-exceeded",
        `Request to ${url} timed out after ${timeoutMs}ms`
      );
    }
    throw error;
  }
}

// ==================== COMBINED RESILIENCE WRAPPER ====================

/**
 * Combines Circuit Breaker + Retry + Timeout for maximum resilience.
 * Use this for all external API calls.
 */
export async function withResilience<T>(
  operationName: string,
  fn: (signal: AbortSignal) => Promise<T>,
  options: {
    circuitBreaker?: Partial<CircuitBreakerOptions>;
    retry?: Partial<RetryOptions>;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const cb = getCircuitBreaker(operationName, options.circuitBreaker);
  const timeoutMs = options.timeoutMs || 30000;

  return cb.execute(() =>
    withRetry(
      () => withTimeout(fn, timeoutMs, operationName),
      options.retry
    )
  );
}

// ==================== METRICS & HEALTH ====================

export interface ResilienceMetrics {
  circuits: Array<{
    name: string;
    state: CircuitState;
    failures: number;
    successes: number;
  }>;
}

export function getAllCircuitMetrics(): ResilienceMetrics {
  return {
    circuits: Array.from(circuitBreakers.entries()).map(([name, cb]) => ({
      name,
      ...cb.getMetrics(),
    })),
  };
}
