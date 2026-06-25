import DeviceActivity
import ManagedSettings
import FamilyControls

/// DeviceActivityMonitor extension principal class.
///
/// iOS runs this in a **separate background process** whenever a monitored
/// `DeviceActivitySchedule`/event transitions. It is the only place where a
/// daily usage limit can actually be *enforced* (the host app schedules the
/// event but cannot react to threshold crossings while suspended).
///
/// On threshold:
/// - apply a full ManagedSettings shield (limit reached → block usage), and
/// - write a flag into the shared App Group so the host can report the
///   `usage_limit_reached` device event on next foreground (background
///   extensions cannot reliably call Cloud Functions).
///
/// On interval end (new day): clear the shield so the device is usable again.
///
/// Requires the `com.apple.security.application-groups` entitlement with
/// `group.com.minimaster.childapp` on **both** this extension and the app, plus
/// `com.apple.developer.family-controls`.
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {

    /// Dedicated, named store so the daily-limit shield does not clobber — and
    /// is not clobbered by — the host app's full-lock/blacklist shields (which
    /// use the default `ManagedSettingsStore`).
    private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("minimaster.dailyLimit"))

    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, activity: activity)

        // Daily limit reached → shield all app categories.
        store.shield.applicationCategories = .all(except: Set())

        // Let the host publish the event on next foreground (idempotent per day).
        SharedPolicyDefaults.markLimitReached(event: "usage_limit_reached")
    }

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        // New monitoring interval (new day) → start unshielded; the threshold
        // event re-applies the shield once the limit is hit again.
        store.shield.applicationCategories = nil
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        // End of day → lift the usage-limit shield.
        store.shield.applicationCategories = nil
    }
}
