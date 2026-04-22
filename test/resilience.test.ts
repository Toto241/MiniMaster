/**
 * Tests for the Resilience module (Circuit Breaker, Retry, Timeout).
 */
import {
  getCircuitBreaker,
  resetCircuitBreaker,
  withRetry,
  withTimeout,
  getAllCircuitMetrics,
} from "../src/resilience";
import * as functions from "firebase-functions/v1";

describe("CircuitBreaker", () => {
  beforeEach(() => {
    resetCircuitBreaker("test-circuit");
  });

  afterEach(() => {
    resetCircuitBreaker("test-circuit");
  });

  it("starts in closed state", async () => {
    const cb = getCircuitBreaker("test-circuit");
    const result = await cb.execute(async () => "success");
    expect(result).toBe("success");
    expect(cb.getState()).toBe("closed");
  });

  it("opens after threshold failures", async () => {
    const cb = getCircuitBreaker("test-circuit", { failureThreshold: 2, resetTimeoutMs: 60000 });
    
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    
    expect(cb.getState()).toBe("open");
    
    await expect(cb.execute(async () => "success")).rejects.toThrow(functions.https.HttpsError);
  });

  it("transitions to half-open after timeout", async () => {
    const cb = getCircuitBreaker("test-circuit", { failureThreshold: 1, resetTimeoutMs: 50 });
    
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    expect(cb.getState()).toBe("open");
    
    await new Promise((r) => setTimeout(r, 100));
    
    const result = await cb.execute(async () => "success");
    expect(result).toBe("success");
  });

  it("closes after successful probes in half-open", async () => {
    const cb = getCircuitBreaker("test-circuit", {
      failureThreshold: 1,
      resetTimeoutMs: 50,
      halfOpenMaxCalls: 2,
      successThreshold: 2,
    });
    
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    
    await cb.execute(async () => "success1");
    await cb.execute(async () => "success2");
    
    expect(cb.getState()).toBe("closed");
  });

  it("reopens on failure in half-open", async () => {
    const cb = getCircuitBreaker("test-circuit", { failureThreshold: 1, resetTimeoutMs: 50 });
    
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 100));
    
    await expect(cb.execute(async () => { throw new Error("fail again"); })).rejects.toThrow();
    expect(cb.getState()).toBe("open");
  });

  it("returns metrics", async () => {
    const cb = getCircuitBreaker("test-circuit");
    await cb.execute(async () => "ok");
    const metrics = cb.getMetrics();
    expect(metrics.state).toBe("closed");
    expect(metrics.failures).toBe(0);
    expect(metrics.successes).toBe(0);
  });

  it("tracks failures count", async () => {
    const cb = getCircuitBreaker("test-circuit", { failureThreshold: 5 });
    try { await cb.execute(async () => { throw new Error("fail"); }); } catch { /* ignore */ }
    const metrics = cb.getMetrics();
    expect(metrics.failures).toBe(1);
  });
});

describe("getCircuitBreaker", () => {
  it("returns same instance for same name", () => {
    const cb1 = getCircuitBreaker("shared");
    const cb2 = getCircuitBreaker("shared");
    expect(cb1).toBe(cb2);
  });

  it("returns different instances for different names", () => {
    const cb1 = getCircuitBreaker("circuit-a");
    const cb2 = getCircuitBreaker("circuit-b");
    expect(cb1).not.toBe(cb2);
  });

  it("accepts custom options", () => {
    const cb = getCircuitBreaker("custom", { failureThreshold: 10 });
    expect(cb.getMetrics().state).toBe("closed");
  });
});

describe("resetCircuitBreaker", () => {
  it("removes circuit from registry", () => {
    getCircuitBreaker("reset-me");
    resetCircuitBreaker("reset-me");
    const cb = getCircuitBreaker("reset-me");
    expect(cb.getMetrics().failures).toBe(0);
  });
});

describe("withRetry", () => {
  it("succeeds on first attempt", async () => {
    const result = await withRetry(async () => "success", { maxAttempts: 3 });
    expect(result).toBe("success");
  });

  it("retries on transient error and succeeds", async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error("unavailable: service down");
      return "success";
    }, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("does not retry on non-retryable error", async () => {
    let attempts = 0;
    await expect(withRetry(async () => {
      attempts++;
      throw new Error("invalid argument: bad request");
    }, { maxAttempts: 3 })).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("throws after max attempts", async () => {
    await expect(withRetry(async () => {
      throw new Error("unavailable");
    }, { maxAttempts: 2, baseDelayMs: 10 })).rejects.toThrow("unavailable");
  });
});

describe("withTimeout", () => {
  it("returns result before timeout", async () => {
    const result = await withTimeout(async () => "success", 1000, "test");
    expect(result).toBe("success");
  });

  it("throws on timeout", async () => {
    await expect(withTimeout(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return "too late";
    }, 50, "slow-op")).rejects.toThrow(functions.https.HttpsError);
  });

  it("passes abort signal to function", async () => {
    let signalReceived = false;
    await withTimeout(async (signal) => {
      signalReceived = true;
      expect(signal).toBeInstanceOf(AbortSignal);
      return "ok";
    }, 1000, "test");
    expect(signalReceived).toBe(true);
  });
});

describe("getAllCircuitMetrics", () => {
  it("returns empty initially", () => {
    const metrics = getAllCircuitMetrics();
    expect(metrics.circuits).toEqual([]);
  });

  it("returns metrics for all circuits", async () => {
    const cb = getCircuitBreaker("metric-test");
    await cb.execute(async () => "ok");
    const metrics = getAllCircuitMetrics();
    expect(metrics.circuits.length).toBeGreaterThan(0);
    expect(metrics.circuits.find((c) => c.name === "metric-test")).toBeDefined();
  });
});
