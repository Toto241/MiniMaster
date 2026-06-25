import { readFileSync } from "fs";
import * as path from "path";

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

/**
 * Static contract for the iOS child offline safe-mode fallback (parity with the
 * Android `OfflinePolicyCache` `EXPIRED_SAFE_MODE` tier). Before this, the iOS
 * `OfflinePolicyCache` only did staleness detection + conflict resolution; a
 * device offline for days kept running its last-synced policy with no fail-safe.
 * This pins the 72 h threshold, the safe-mode policy and the wiring that locks a
 * long-offline device.
 */
describe("iOS offline safe-mode fallback contract", () => {
  it("defines a 72h safe-mode tier matching the Android hard-expire threshold", () => {
    const cache = read("iosChildApp/Sources/MiniMasterChild/Models/OfflinePolicyCache.swift");
    const android = read("childApp/src/main/java/com/google/pairing/child/OfflinePolicyCache.kt");

    expect(cache).toContain("safeModeThresholdSeconds = 72 * 60 * 60");
    expect(cache).toContain("enum Freshness");
    expect(cache).toContain("case expiredSafeMode");
    // Android reference uses 72h in milliseconds — keep the two in lock-step.
    expect(android).toContain("72L * 60 * 60 * 1000");
  });

  it("enforces a full-lock safe-mode policy when the cache has expired", () => {
    const cache = read("iosChildApp/Sources/MiniMasterChild/Models/OfflinePolicyCache.swift");
    expect(cache).toContain("func enforceOfflineFallbackIfExpired");
    expect(cache).toContain("func safeModePolicy");
    expect(cache).toContain("isLocked: true");
    // No contact timestamp at all is fail-safe (locked), matching Android.
    expect(cache).toContain("guard let cachedAt = lastSync ?? policyStore.cachedAt else { return .expiredSafeMode }");
  });

  it("times the 72h window off real server contact, not just policy changes", () => {
    const cache = read("iosChildApp/Sources/MiniMasterChild/Models/OfflinePolicyCache.swift");
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    // freshness prefers the persisted last-successful-sync over cachedAt, which
    // only moves on policy changes — otherwise an unchanged-but-online device
    // would falsely lock after 72h.
    expect(cache).toContain("func recordSuccessfulSync");
    expect(cache).toContain("defaults.object(forKey: lastSuccessfulSyncKey) as? Date");
    // Server contact is noted (which records the sync timestamp) on both sync
    // paths and the heartbeat — definition plus >= 3 references.
    const contacts = sync.match(/noteServerContact\(\)/g) ?? [];
    expect(contacts.length).toBeGreaterThanOrEqual(3);
    expect(sync).toContain("offlinePolicyCache.recordSuccessfulSync()");
  });

  it("wires the fallback into failed syncs and the foreground heartbeat", () => {
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    expect(sync).toContain("enforceOfflineFallbackIfExpired");
    // Helper plus calls from both sync-error paths and the heartbeat.
    const calls = sync.match(/enforceOfflineSafeModeIfNeeded/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(sync).toMatch(/sendForegroundHeartbeat\(\) async \{[\s\S]*enforceOfflineSafeModeIfNeeded/);
  });

  it("exits safe mode and refreshes the timer on any successful server contact", () => {
    const cache = read("iosChildApp/Sources/MiniMasterChild/Models/OfflinePolicyCache.swift");
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    // Safe mode is flagged on entry and lifted on the next contact, so an
    // upToDate reconnect (which skips applyPolicy) still restores the real policy.
    expect(cache).toContain("inSafeModeKey");
    expect(cache).toContain("func restoreFromSafeModeIfNeeded");
    expect(cache).toContain("defaults.set(true, forKey: inSafeModeKey)");
    // A successful heartbeat counts as contact (refreshes the 72h timer), so a
    // foreground-only app doesn't falsely expire.
    expect(sync).toContain("func noteServerContact");
    expect(sync).toContain("restoreFromSafeModeIfNeeded");
    expect(sync).toMatch(/func reportHeartbeat[\s\S]*noteServerContact\(\)/);
  });
});
