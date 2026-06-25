import Foundation

/// Cross-process bridge between the main child app and the
/// `DeviceActivityMonitor` extension.
///
/// The extension runs in a **separate process** and therefore cannot read the
/// app's `PolicyStore` or `UserDefaults.standard`. A shared App Group
/// (`group.com.minimaster.childapp`) is the supported channel for the small
/// amount of state both sides need:
///
/// - The host writes the current `dailyLimitMinutes` so the extension/host stay
///   in agreement about the configured limit.
/// - When usage crosses the threshold, the extension sets a "limit reached"
///   flag (it cannot reliably call Cloud Functions from a background
///   extension). On next foreground the host consumes the flag and reports the
///   event via the existing `publishDeviceEvent` path.
///
/// Both the app target and the extension target must declare the App Group
/// entitlement `com.apple.security.application-groups` containing
/// `group.com.minimaster.childapp`.
enum SharedPolicyDefaults {

    /// App Group suite shared by the app and the DeviceActivityMonitor extension.
    static let suiteName = "group.com.minimaster.childapp"

    private enum Key {
        static let dailyLimitMinutes = "minimaster.dailyLimitMinutes"
        static let limitReachedDayBucket = "minimaster.limitReachedDayBucket"
        static let limitReachedEvent = "minimaster.limitReachedEvent"
    }

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    // MARK: - Daily limit (host → extension)

    static func setDailyLimitMinutes(_ minutes: Int?) {
        guard let defaults else { return }
        if let minutes, minutes > 0 {
            defaults.set(minutes, forKey: Key.dailyLimitMinutes)
        } else {
            defaults.removeObject(forKey: Key.dailyLimitMinutes)
        }
    }

    static func dailyLimitMinutes() -> Int? {
        guard let defaults, defaults.object(forKey: Key.dailyLimitMinutes) != nil else {
            return nil
        }
        let value = defaults.integer(forKey: Key.dailyLimitMinutes)
        return value > 0 ? value : nil
    }

    // MARK: - Limit-reached flag (extension → host)

    /// UTC day bucket used to make the limit-reached event idempotent per day.
    static func currentDayBucket(now: Date = Date()) -> Int {
        Int(now.timeIntervalSince1970 / 86_400)
    }

    /// Called by the extension when the daily threshold is reached.
    static func markLimitReached(event: String, now: Date = Date()) {
        guard let defaults else { return }
        defaults.set(currentDayBucket(now: now), forKey: Key.limitReachedDayBucket)
        defaults.set(event, forKey: Key.limitReachedEvent)
    }

    /// Consumed by the host on next foreground. Returns the day bucket and event
    /// name if a fresh limit-reached flag exists, then clears it. Returns `nil`
    /// when nothing is pending.
    static func consumeLimitReachedFlag() -> (dayBucket: Int, event: String)? {
        guard let defaults,
              defaults.object(forKey: Key.limitReachedDayBucket) != nil else {
            return nil
        }
        let bucket = defaults.integer(forKey: Key.limitReachedDayBucket)
        let event = defaults.string(forKey: Key.limitReachedEvent) ?? "usage_limit_reached"
        defaults.removeObject(forKey: Key.limitReachedDayBucket)
        defaults.removeObject(forKey: Key.limitReachedEvent)
        return (bucket, event)
    }
}
