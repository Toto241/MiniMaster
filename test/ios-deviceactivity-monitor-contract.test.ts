import { readFileSync } from "fs";
import * as path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

/**
 * Static source-contract test for the iOS DeviceActivityMonitor extension (A1).
 *
 * No Xcode/macOS in CI — SwiftPM cannot build app extensions. These assertions
 * guard the source wiring that turns a scheduled DeviceActivity event into a
 * real enforced daily usage limit. Threshold callbacks, shield application and
 * App-Group access must be validated on a Mac + real device (Screen Time).
 */
describe("iOS DeviceActivityMonitor extension contract", () => {
  const EXT = "iosChildApp/DeviceActivityMonitorExtension";

  it("defines a DeviceActivityMonitor subclass that shields on threshold", () => {
    const ext = read(`${EXT}/DeviceActivityMonitorExtension.swift`);
    expect(ext).toContain(": DeviceActivityMonitor");
    expect(ext).toContain("override func eventDidReachThreshold");
    expect(ext).toContain("store.shield.applicationCategories = .all(except: Set())");
    expect(ext).toContain("override func intervalDidEnd");
    expect(ext).toContain("SharedPolicyDefaults.markLimitReached(event: \"usage_limit_reached\")");
    // Dedicated named store avoids clobbering the host full-lock shield.
    expect(ext).toContain("ManagedSettingsStore(named: ManagedSettingsStore.Name(\"minimaster.dailyLimit\"))");
  });

  it("extension Info.plist declares the monitor extension point", () => {
    const plist = read(`${EXT}/Info.plist`);
    expect(plist).toContain("com.apple.deviceactivity.monitor-extension");
    expect(plist).toContain("DeviceActivityMonitorExtension");
  });

  it("host schedules a DeviceActivityEvent with a daily-limit threshold", () => {
    const mgr = read("iosChildApp/Sources/MiniMasterChild/Services/AppBlockingManager.swift");
    expect(mgr).toContain("DeviceActivityEvent");
    expect(mgr).toContain("threshold: DateComponents(hour: dailyLimit / 60, minute: dailyLimit % 60)");
    expect(mgr).toContain("events: [limitEventName: limitEvent]");
    expect(mgr).toContain("SharedPolicyDefaults.setDailyLimitMinutes(rules.dailyLimitMinutes)");
    // Daily-limit shield is cleared on policy update so raised/removed limits unblock.
    expect(mgr).toContain("ManagedSettingsStore(named: ManagedSettingsStore.Name(\"minimaster.dailyLimit\"))");
  });

  it("App Group is wired across host + extension entitlements and shared defaults", () => {
    const appEnt = read("iosChildApp/MiniMasterChild.entitlements");
    const extEnt = read(`${EXT}/DeviceActivityMonitorExtension.entitlements`);
    const shared = read("iosChildApp/Sources/MiniMasterChild/Models/SharedPolicyDefaults.swift");

    expect(appEnt).toContain("com.apple.security.application-groups");
    expect(appEnt).toContain("group.com.minimaster.childapp");
    expect(extEnt).toContain("com.apple.developer.family-controls");
    expect(extEnt).toContain("group.com.minimaster.childapp");
    expect(shared).toContain("static let suiteName = \"group.com.minimaster.childapp\"");
    expect(shared).toContain("UserDefaults(suiteName: suiteName)");
  });

  it("host reports limit-reached via the existing publishDeviceEvent path", () => {
    const sync = read("iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift");
    expect(sync).toContain("consumeLimitReachedFlag");
    expect(sync).toContain("reportLimitReachedIfNeeded");
    expect(sync).toContain("publishDeviceEvent");
  });
});
