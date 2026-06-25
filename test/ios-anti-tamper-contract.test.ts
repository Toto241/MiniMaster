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

  it("reports the revocation to the parent-alerting endpoint on app start + heartbeat", () => {
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    const client = read("iosChildApp/Sources/MiniMasterChild/Services/ChildCloudFunctionsClient.swift");
    expect(sync).toContain("func reportTamperIfDetected");
    // Routed through reportTamperEvent (FCM alert + tamperEvents), not the
    // device-event log, so the parent actually sees enforcement loss.
    expect(sync).toContain("client.reportTamperEvent(");
    expect(sync).toContain("eventType: \"family_controls_revoked\"");
    expect(client).toContain("func reportTamperEvent");
    expect(client).toContain("httpsCallable(\"reportTamperEvent\")");
    // Only acknowledge after a successful report so a failed one retries.
    expect(sync).toContain("tamperMonitor.markRevocationReported()");
    // Wired into both the app-start path and the foreground heartbeat.
    expect(sync).toMatch(/func onAppStart\(\) async \{[\s\S]*reportTamperIfDetected/);
    expect(sync).toMatch(/sendForegroundHeartbeat\(\) async \{[\s\S]*reportTamperIfDetected/);
  });

  it("records the approved state when the child grants authorization", () => {
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    const view = read("iosChildApp/Sources/MiniMasterChild/Views/MainChildView.swift");
    expect(sync).toContain("func recordAuthorizationIfApproved");
    // The grant flow must record approval, otherwise a first revocation before any
    // tamper check would never be flagged.
    expect(view).toContain("syncService.recordAuthorizationIfApproved()");
  });
});
