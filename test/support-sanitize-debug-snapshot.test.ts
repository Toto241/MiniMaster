/**
 * Branch coverage for support.ts sanitizeDebugSnapshot — the defense-in-depth
 * whitelist/normalisation filter applied before AI prompts and Firestore writes.
 * Pure function; covers the empty-input defaults and every field-normalisation branch.
 */
import { __supportTestables } from "../src/support";

const { sanitizeDebugSnapshot } = __supportTestables as {
  sanitizeDebugSnapshot: (input: Record<string, unknown>) => any;
};

describe("support: sanitizeDebugSnapshot", () => {
  it("returns safe defaults for an empty input", () => {
    const out = sanitizeDebugSnapshot({});
    expect(out.appStatus).toEqual({ isLocked: false, appBlacklistCount: 0, usageRulesCount: 0 });
    expect(out.activityData).toEqual({ lastSeen: null, updatedAt: null });
    expect(out.networkDiagnostics).toEqual({ fcmTokenPresent: false, networkType: "unknown" });
    expect(out.deviceTelemetry).toEqual({
      batteryLevelPct: null, isCharging: false, storageFreeBytes: null, osVersion: null, appVersion: null,
    });
    expect(out.recentTamperEvents).toBe(0);
    expect(out.recentUsageReports).toBe(0);
    expect(typeof out.fetchedAt).toBe("string"); // generated ISO timestamp
  });

  it("passes through and coerces fully-populated valid values", () => {
    const out = sanitizeDebugSnapshot({
      appStatus: { isLocked: true, appBlacklistCount: 3, usageRulesCount: 2 },
      activityData: { lastSeen: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" },
      networkDiagnostics: { fcmTokenPresent: true, networkType: "WIFI" }, // upper-case -> lowercased + accepted
      deviceTelemetry: { batteryLevelPct: 55, isCharging: true, storageFreeBytes: 1024, osVersion: "Android 14", appVersion: "2.2.0" },
      recentTamperEvents: 4,
      recentUsageReports: 9,
      fetchedAt: "2026-01-03T00:00:00Z",
    });
    expect(out.appStatus).toEqual({ isLocked: true, appBlacklistCount: 3, usageRulesCount: 2 });
    expect(out.activityData).toEqual({ lastSeen: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" });
    expect(out.networkDiagnostics).toEqual({ fcmTokenPresent: true, networkType: "wifi" });
    expect(out.deviceTelemetry.batteryLevelPct).toBe(55);
    expect(out.deviceTelemetry.storageFreeBytes).toBe(1024);
    expect(out.recentTamperEvents).toBe(4);
    expect(out.fetchedAt).toBe("2026-01-03T00:00:00Z");
  });

  it("normalises an unknown/invalid networkType to 'unknown'", () => {
    expect(sanitizeDebugSnapshot({ networkDiagnostics: { networkType: "satellite" } }).networkDiagnostics.networkType).toBe("unknown");
    expect(sanitizeDebugSnapshot({ networkDiagnostics: { networkType: 123 as any } }).networkDiagnostics.networkType).toBe("unknown");
  });

  it("clamps batteryLevelPct into 0..100 and rejects non-finite", () => {
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { batteryLevelPct: 150 } }).deviceTelemetry.batteryLevelPct).toBe(100);
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { batteryLevelPct: -5 } }).deviceTelemetry.batteryLevelPct).toBe(0);
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { batteryLevelPct: 42.7 } }).deviceTelemetry.batteryLevelPct).toBe(43);
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { batteryLevelPct: NaN } }).deviceTelemetry.batteryLevelPct).toBeNull();
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { batteryLevelPct: "80" as any } }).deviceTelemetry.batteryLevelPct).toBeNull();
  });

  it("floors valid storageFreeBytes and rejects negative/non-number", () => {
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { storageFreeBytes: 2048.9 } }).deviceTelemetry.storageFreeBytes).toBe(2048);
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { storageFreeBytes: -1 } }).deviceTelemetry.storageFreeBytes).toBeNull();
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { storageFreeBytes: "x" as any } }).deviceTelemetry.storageFreeBytes).toBeNull();
  });

  it("truncates over-long strings and rejects empty/non-string", () => {
    const longOs = "x".repeat(40);
    const out = sanitizeDebugSnapshot({ deviceTelemetry: { osVersion: longOs, appVersion: "" } });
    expect(out.deviceTelemetry.osVersion).toHaveLength(32);
    expect(out.deviceTelemetry.appVersion).toBeNull(); // empty -> null
    expect(sanitizeDebugSnapshot({ deviceTelemetry: { osVersion: 5 as any } }).deviceTelemetry.osVersion).toBeNull();
  });

  it("falls back to defaults for non-finite counters and non-string timestamps", () => {
    const out = sanitizeDebugSnapshot({
      appStatus: { appBlacklistCount: NaN, usageRulesCount: "2" as any },
      activityData: { lastSeen: 99 as any },
      recentTamperEvents: "bad" as any,
      fetchedAt: 12345 as any,
    });
    expect(out.appStatus.appBlacklistCount).toBe(0);
    expect(out.appStatus.usageRulesCount).toBe(0);
    expect(out.activityData.lastSeen).toBeNull();
    expect(out.recentTamperEvents).toBe(0);
    expect(typeof out.fetchedAt).toBe("string"); // non-string -> generated ISO
  });
});
