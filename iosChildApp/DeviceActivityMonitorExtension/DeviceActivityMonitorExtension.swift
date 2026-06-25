import DeviceActivity
import ManagedSettings
import Foundation

/// DeviceActivityMonitor extension that actually **enforces** the daily usage
/// limit on the child device.
///
/// This is the missing half of usage-limit enforcement: the main app
/// (`AppBlockingManager.applyUsageRules`) registers a `DeviceActivityEvent` with
/// a minute `threshold`, but only a `DeviceActivityMonitor` extension receives
/// the `eventDidReachThreshold` callback when that threshold is hit. Without this
/// extension the limit is merely scheduled and never applied.
///
/// On threshold:
///   - applies a full ManagedSettings shield (blocks all app categories), and
///   - records a flag in the shared App Group suite so the app can publish a
///     `usage_limit_reached` device event to the backend on next foreground.
///
/// On interval end (midnight): lifts the usage-cap shield so the next day starts
/// fresh. Explicit lock/blacklist shields are owned by the app and re-applied on
/// its next policy sync.
///
/// NOTE: This extension runs in its own process and cannot import
/// `SharedPolicyDefaults` unless that file is also added to this extension's
/// target in Xcode. The App Group id and key strings below are therefore inlined
/// and MUST match `SharedPolicyDefaults` exactly
/// (verified by `test/ios-deviceactivity-monitor-contract.test.ts`).
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    private let store = ManagedSettingsStore()

    // Must match SharedPolicyDefaults.appGroupId / SharedPolicyDefaults.Keys.*
    private let appGroupId = "group.com.minimaster.childapp"
    private let limitReachedEventKey = "minimaster.shared.limitReachedEvent"
    private let limitReachedAtMsKey = "minimaster.shared.limitReachedAtMs"

    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, activity: activity)

        // Enforce: shield all app categories once the daily cap is reached.
        store.shield.applicationCategories = .all(except: Set())

        // Signal the host app (separate process) so it can report the event.
        if let suite = UserDefaults(suiteName: appGroupId) {
            suite.set(event.rawValue, forKey: limitReachedEventKey)
            suite.set(Date().timeIntervalSince1970 * 1000, forKey: limitReachedAtMsKey)
        }
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)

        // New day: lift the usage-cap shield. The app re-applies lock/blacklist
        // shields on its next policy sync.
        store.shield.applicationCategories = nil
    }
}
