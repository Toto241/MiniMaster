import { readFileSync } from "fs";
import * as path from "path";

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

/**
 * Static contract for iOS child anti-tamper. iOS exposes no uninstall or
 * device-admin callbacks (unlike Android), so the realistic tamper vector is
 * revocation of the Family Controls (Screen Time) authorization — after which
 * enforcement silently stops. This pins the detector and the reporting wiring
 * that surfaces a revocation to the parent (the iOS analog of Android's
 * accessibility_service_disabled signal).
 */
describe("iOS anti-tamper contract", () => {
  it("detects Family Controls authorization revocation, reported once", () => {
    const mon = read("iosChildApp/Sources/MiniMasterChild/Services/TamperMonitor.swift");
    expect(mon).toContain("AuthorizationCenter.shared.authorizationStatus == .approved");
    expect(mon).toContain("func recordIfApproved");
    expect(mon).toContain("func isRevoked");
    expect(mon).toContain("func markRevocationReported");
    // Persisted so a fresh install (never authorized) is not a false positive and
    // a revocation survives a restart / is reported once.
    expect(mon).toContain("everAuthorizedKey");
  });

  it("reports tamper_detected with the revocation reason on app start + heartbeat", () => {
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    expect(sync).toContain("func reportTamperIfDetected");
    expect(sync).toContain("eventType: \"tamper_detected\"");
    expect(sync).toContain("family_controls_revoked");
    // Only acknowledge after a successful publish so a failed report retries.
    expect(sync).toContain("tamperMonitor.markRevocationReported()");
    // Wired into both the app-start path and the foreground heartbeat.
    expect(sync).toMatch(/func onAppStart\(\) async \{[\s\S]*reportTamperIfDetected/);
    expect(sync).toMatch(/sendForegroundHeartbeat\(\) async \{[\s\S]*reportTamperIfDetected/);
  });
});
