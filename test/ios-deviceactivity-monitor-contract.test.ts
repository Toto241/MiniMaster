import { readFileSync } from "fs";
import * as path from "path";

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

const APP_GROUP = "group.com.minimaster.childapp";
const REACHED_KEY = "minimaster.shared.limitReachedEvent";

/**
 * Static contract for iOS daily-usage-limit enforcement (A1 of the iOS↔Android
 * parity plan). Before this, `AppBlockingManager.applyUsageRules` only started a
 * DeviceActivity schedule without threshold events and there was no
 * DeviceActivityMonitor extension, so the limit was never enforced. This pins
 * the extension, the threshold registration and the App-Group bridge that ties
 * them together across processes.
 */
describe("iOS DeviceActivityMonitor enforcement contract", () => {
  it("ships a DeviceActivityMonitor extension that shields on threshold and resets at interval end", () => {
    const ext = read(
      "iosChildApp/DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.swift"
    );
    expect(ext).toContain(": DeviceActivityMonitor");
    expect(ext).toContain("eventDidReachThreshold");
    expect(ext).toContain("store.shield.applicationCategories = .all(except: Set())");
    expect(ext).toContain("intervalDidEnd");
  });

  it("isolates the daily-limit shield in a dedicated named store shared by app + extension", () => {
    const ext = read(
      "iosChildApp/DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.swift"
    );
    const mgr = read(
      "iosChildApp/Sources/MiniMasterChild/Services/AppBlockingManager.swift"
    );
    const named = "ManagedSettingsStore(named: ManagedSettingsStore.Name(\"minimaster.dailyLimit\"))";
    // Both processes target the same named store so lock/blacklist (default store)
    // and the usage-cap shield never clobber each other.
    expect(ext).toContain(named);
    expect(mgr).toContain(named);
    // The app only lifts the cap shield when the limit actually changes.
    expect(mgr).toContain("if previousLimit != dailyLimit");
  });

  it("declares the monitor extension point and principal class in Info.plist", () => {
    const plist = read("iosChildApp/DeviceActivityMonitorExtension/Info.plist");
    expect(plist).toContain("com.apple.deviceactivity.monitor-extension");
    expect(plist).toContain("DeviceActivityMonitorExtension");
  });

  it("registers a usage threshold event so the extension actually fires", () => {
    const mgr = read(
      "iosChildApp/Sources/MiniMasterChild/Services/AppBlockingManager.swift"
    );
    expect(mgr).toContain("DeviceActivityEvent");
    expect(mgr).toContain("threshold:");
    expect(mgr).toContain("events:");
    expect(mgr).toContain("SharedPolicyDefaults.setDailyLimitMinutes");
  });

  it("shares limit + reached-flag through one App Group across app and extension", () => {
    const shared = read(
      "iosChildApp/Sources/MiniMasterChild/Models/SharedPolicyDefaults.swift"
    );
    const appEnt = read("iosChildApp/MiniMasterChild.entitlements");
    const extEnt = read(
      "iosChildApp/DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.entitlements"
    );
    const ext = read(
      "iosChildApp/DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.swift"
    );

    // Same App Group in all three places, or the cross-process bridge is broken.
    expect(shared).toContain(APP_GROUP);
    expect(appEnt).toContain(APP_GROUP);
    expect(extEnt).toContain(APP_GROUP);

    // App and extension must agree on the identical UserDefaults key.
    expect(shared).toContain(REACHED_KEY);
    expect(ext).toContain(REACHED_KEY);
  });

  it("reports the limit-reached event to the backend on next foreground", () => {
    const sync = read(
      "iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift"
    );
    expect(sync).toContain("reportUsageLimitReachedIfNeeded");
    expect(sync).toContain("consumeLimitReachedFlag");
    expect(sync).toContain("eventType: \"usage_limit_reached\"");
    // Idempotency bucket derives from when the limit was reached (atMs), not now.
    expect(sync).toContain("flag.atMs");
    // Wired into both entry points.
    expect(sync).toMatch(/func onAppStart\(\) async \{[\s\S]*reportUsageLimitReachedIfNeeded/);
    expect(sync).toMatch(/func onFcmWakeUp\(\) async \{[\s\S]*reportUsageLimitReachedIfNeeded/);
  });
});
