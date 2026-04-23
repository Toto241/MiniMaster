/**
 * Coverage gap fillers for modules that are under-tested.
 * Targets: rate-limiter, pricing-config, decisioning validators/services,
 *          device-sync helpers, subscription helpers.
 */

import {
  checkRateLimitLegacy,
  resetRateLimit,
} from "../src/rate-limiter";
import {
  calculatePrice,
  getTierBySku,
  isB2BSku,
  isB2CSku,
  getChildLimit,
  getParentAppLimit,
  getSubscriptionDurationMs,
  formatPriceCents,
  applyPromoCode,
} from "../src/pricing-config";
import {
  validateDeviceEventInput,
  validateDecisionTraceInput,
  validateGetRulesInput,
} from "../src/validators/decisioning";
import {
  buildCanonicalRulesFromUsageRules,
  toDeviceEventRecord,
  buildSuggestionFromEvents,
} from "../src/services/decisioning-service";

describe("rate-limiter helpers", () => {
  it("checkRateLimitLegacy allows requests under limit", () => {
    expect(() => checkRateLimitLegacy("u1", "action1", 5, 60000)).not.toThrow();
  });

  it("checkRateLimitLegacy throws when limit exceeded", () => {
    expect(() => {
      for (let i = 0; i < 7; i++) {
        checkRateLimitLegacy("u1", "action1", 5, 60000);
      }
    }).toThrow(/Too many requests/);
  });

  it("resetRateLimit does not throw", async () => {
    await expect(resetRateLimit("u1", "action1", "master")).resolves.not.toThrow();
  });
});

describe("pricing-config helpers", () => {
  it("calculatePrice returns gross for DE consumer", () => {
    const result = calculatePrice(499, "DE");
    expect(result.netCents).toBe(499);
    expect(result.vatRate).toBe(0.19);
    expect(result.reverseCharge).toBe(false);
    expect(result.grossCents).toBe(499 + Math.round(499 * 0.19));
  });

  it("calculatePrice applies reverse charge for EU VAT ID", () => {
    const result = calculatePrice(999, "DE", "DE123456789");
    expect(result.reverseCharge).toBe(true);
    expect(result.vatCents).toBe(0);
  });

  it("calculatePrice defaults to German VAT for unknown country", () => {
    const result = calculatePrice(100, "XX");
    expect(result.vatRate).toBe(0.19);
  });

  it("getTierBySku returns B2C tier", () => {
    expect(getTierBySku("single_child_monthly")?.sku).toBe("single_child_monthly");
  });

  it("getTierBySku returns B2B tier", () => {
    expect(getTierBySku("b2b_school_50")?.sku).toBe("b2b_school_50");
  });

  it("getTierBySku returns undefined for unknown sku", () => {
    expect(getTierBySku("nonexistent")).toBeUndefined();
  });

  it("isB2BSku and isB2CSku work correctly", () => {
    expect(isB2BSku("b2b_school_50")).toBe(true);
    expect(isB2BSku("single_child_monthly")).toBe(false);
    expect(isB2CSku("single_child_monthly")).toBe(true);
    expect(isB2CSku("b2b_school_50")).toBe(false);
  });

  it("getChildLimit returns tier limit or defaults", () => {
    expect(getChildLimit("single_child_monthly")).toBe(1);
    expect(getChildLimit("b2b_school_50")).toBe(50);
    expect(getChildLimit("unknown")).toBe(4);
  });

  it("getParentAppLimit returns tier limit or defaults", () => {
    expect(getParentAppLimit("single_child_monthly")).toBe(2);
    expect(getParentAppLimit("b2b_school_50")).toBe(2);
    expect(getParentAppLimit("unknown")).toBe(2);
  });

  it("getSubscriptionDurationMs returns yearly or monthly", () => {
    expect(getSubscriptionDurationMs("single_child_yearly")).toBe(365 * 24 * 60 * 60 * 1000);
    expect(getSubscriptionDurationMs("single_child_monthly")).toBe(30 * 24 * 60 * 60 * 1000);
    expect(getSubscriptionDurationMs("unknown")).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("formatPriceCents formats currency", () => {
    const formatted = formatPriceCents(499, "EUR", "de-DE");
    expect(formatted).toContain("4,99");
  });

  it("applyPromoCode with null returns original", () => {
    const result = applyPromoCode(1000, null);
    expect(result.discountPercent).toBe(0);
    expect(result.discountedCents).toBe(1000);
  });

  it("applyPromoCode applies discount", () => {
    const promo = { code: "TEST", discountPercent: 0.2, maxRedemptions: 10, currentRedemptions: 0, validFrom: new Date("2000-01-01"), validUntil: new Date("2099-12-31"), applicableSkus: [], createdBy: "admin" };
    const result = applyPromoCode(1000, promo);
    expect(result.discountPercent).toBe(0.2);
    expect(result.discountedCents).toBe(800);
  });
});

describe("decisioning validators", () => {
  it("validateDeviceEventInput accepts valid payload", () => {
    const result = validateDeviceEventInput({
      deviceId: "d1",
      type: "APP_OPENED",
      payload: { key: "value" },
      timestamp: 1234567890,
    });
    expect(result.deviceId).toBe("d1");
    expect(result.type).toBe("APP_OPENED");
  });

  it("validateDeviceEventInput throws for missing payload", () => {
    expect(() => validateDeviceEventInput(null)).toThrow(/Event-Payload fehlt/);
  });

  it("validateDeviceEventInput throws for empty deviceId", () => {
    expect(() => validateDeviceEventInput({ deviceId: "", type: "APP_OPENED" })).toThrow(/deviceId/);
  });

  it("validateDeviceEventInput throws for invalid type", () => {
    expect(() => validateDeviceEventInput({ deviceId: "d1", type: "INVALID" })).toThrow(/Nicht unterstützter Event-Typ/);
  });

  it("validateDeviceEventInput throws for invalid timestamp", () => {
    expect(() => validateDeviceEventInput({ deviceId: "d1", type: "APP_OPENED", timestamp: -1 })).toThrow(/timestamp/);
  });

  it("validateDecisionTraceInput accepts valid payload", () => {
    const result = validateDecisionTraceInput({
      deviceId: "d1",
      ruleId: "r1",
      reason: "test",
      action: "BLOCK",
      eventType: "APP_OPENED",
      timestamp: 1234567890,
    });
    expect(result.action).toBe("BLOCK");
  });

  it("validateDecisionTraceInput throws for invalid action", () => {
    expect(() => validateDecisionTraceInput({
      deviceId: "d1", ruleId: "r1", reason: "test", action: "INVALID", eventType: "APP_OPENED", timestamp: 1,
    })).toThrow(/Nicht unterstützte Aktion/);
  });

  it("validateGetRulesInput returns empty for null", () => {
    expect(validateGetRulesInput(null)).toEqual({});
  });

  it("validateGetRulesInput returns empty for undefined deviceId", () => {
    expect(validateGetRulesInput({})).toEqual({});
  });

  it("validateGetRulesInput returns deviceId when provided", () => {
    expect(validateGetRulesInput({ deviceId: "d1" })).toEqual({ deviceId: "d1" });
  });

  it("validateGetRulesInput throws for non-object", () => {
    expect(() => validateGetRulesInput("string")).toThrow(/Request muss ein Objekt sein/);
  });
});

describe("decisioning service", () => {
  it("buildCanonicalRulesFromUsageRules with dailyLimitSeconds", () => {
    const rules = buildCanonicalRulesFromUsageRules("u1", "d1", { dailyLimitSeconds: 3600 });
    expect(rules.length).toBeGreaterThanOrEqual(1);
    expect(rules[0].ruleId).toBe("daily-limit");
  });

  it("buildCanonicalRulesFromUsageRules with allowedHours", () => {
    const rules = buildCanonicalRulesFromUsageRules("u1", "d1", { allowedHours: { start: "08:00", end: "20:00" } });
    const windowRule = rules.find((r) => r.ruleId === "allowed-window");
    expect(windowRule).toBeDefined();
  });

  it("buildCanonicalRulesFromUsageRules with appLimits", () => {
    const rules = buildCanonicalRulesFromUsageRules("u1", "d1", { appLimits: { "com.app1": 300, "com.app2": 600 } });
    expect(rules.some((r) => r.ruleId.startsWith("per-app-limit"))).toBe(true);
  });

  it("toDeviceEventRecord creates correct structure", () => {
    const record = toDeviceEventRecord("u1", "d1", "APP_OPENED", { key: "value" }, 1234567890);
    expect(record.userId).toBe("u1");
    expect(record.type).toBe("APP_OPENED");
  });

  it("buildSuggestionFromEvents returns suggestion for limit violation", () => {
    const events = [
      { eventId: "e1", userId: "u1", deviceId: "d1", type: "TIME_LIMIT_REACHED" as const, payload: { packageName: "com.game" }, timestamp: { toMillis: () => 1000, toDate: () => new Date() } as any, createdAt: { toMillis: () => 1000 } as any },
    ];
    const suggestion = buildSuggestionFromEvents("u1", "d1", events);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedAction).toBe("BLOCK");
  });

  it("buildSuggestionFromEvents returns NOTIFY for frequent app opens", () => {
    const events = Array.from({ length: 3 }, (_, i) => ({
      eventId: `e${i}`,
      userId: "u1",
      deviceId: "d1",
      type: "APP_OPENED" as const,
      payload: { packageName: "com.social" },
      timestamp: { toMillis: () => 1000 + i, toDate: () => new Date() } as any,
      createdAt: { toMillis: () => 1000 } as any,
    }));
    const suggestion = buildSuggestionFromEvents("u1", "d1", events);
    expect(suggestion).not.toBeNull();
    expect(suggestion?.suggestedAction).toBe("NOTIFY");
  });

  it("buildSuggestionFromEvents returns null for no pattern", () => {
    const events = [
      { eventId: "e1", userId: "u1", deviceId: "d1", type: "APP_OPENED" as const, payload: {}, timestamp: { toMillis: () => 1000 } as any, createdAt: { toMillis: () => 1000 } as any },
    ];
    expect(buildSuggestionFromEvents("u1", "d1", events)).toBeNull();
  });
});


describe("device-sync exports", () => {
  it("incrementPolicyVersion and writeCommand are importable", async () => {
    const deviceSync = await import("../src/device-sync");
    expect(typeof deviceSync.writeCommand).toBe("function");
    expect(typeof deviceSync.registerDeviceEndpoint).toBe("function");
  });
});

describe("subscription helpers", () => {
  it("re-exports are defined", async () => {
    const sub = await import("../src/subscription");
    expect(sub.VALID_PRODUCT_IDS).toBeDefined();
    expect(typeof sub.getChildLimit).toBe("function");
    expect(typeof sub.getParentAppLimit).toBe("function");
    expect(typeof sub.getSubscriptionDurationMs).toBe("function");
  });
});


describe("resilience circuit breaker", () => {
  beforeEach(async () => {
    const { clearAllCircuitBreakers } = await import("../src/resilience");
    clearAllCircuitBreakers();
  });

  it("getCircuitBreaker executes successfully when closed", async () => {
    const { getCircuitBreaker } = await import("../src/resilience");
    const cb = getCircuitBreaker("test-closed", { failureThreshold: 2, resetTimeoutMs: 1000, halfOpenMaxCalls: 1, successThreshold: 1 });
    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
  });

  it("circuit breaker opens after threshold failures", async () => {
    const { getCircuitBreaker } = await import("../src/resilience");
    const cb = getCircuitBreaker("test-open", { failureThreshold: 1, resetTimeoutMs: 100000, halfOpenMaxCalls: 1, successThreshold: 1 });
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    await expect(cb.execute(async () => "ok")).rejects.toThrow(/unavailable/);
  });

  it("circuit breaker half-open probe succeeds and closes", async () => {
    const { getCircuitBreaker } = await import("../src/resilience");
    const cb = getCircuitBreaker("test-half", { failureThreshold: 1, resetTimeoutMs: 10, halfOpenMaxCalls: 1, successThreshold: 1 });
    await expect(cb.execute(async () => { throw new Error("fail"); })).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 50));
    const result = await cb.execute(async () => "ok");
    expect(result).toBe("ok");
  });
});

describe("operator-setup constants", () => {
  it("MANUAL_CHECKLIST_ITEMS are defined", async () => {
    const ops = await import("../src/operator-setup");
    expect(ops.MANUAL_CHECKLIST_ITEMS.length).toBeGreaterThan(0);
    expect(ops.MANUAL_CHECKLIST_ITEMS.some((i: any) => i.required)).toBe(true);
  });
});
