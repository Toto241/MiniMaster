import Foundation

/// Cross-process bridge between the main child app and the
/// `DeviceActivityMonitorExtension`, backed by an App Group `UserDefaults` suite.
///
/// The DeviceActivity monitor runs in a **separate process** and cannot share
/// in-memory state with the app. Two pieces of state are exchanged here:
///
/// 1. The active **daily usage limit** (minutes), written by
///    `AppBlockingManager.applyUsageRules` so the monitor knows the threshold.
/// 2. A **"limit reached" flag**, written by the extension's
///    `eventDidReachThreshold` so the app can publish a `usage_limit_reached`
///    device event to the backend on its next foreground pass.
///
/// The App Group identifier and the raw key strings below MUST stay byte-for-byte
/// identical to the literals used in
/// `DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.swift`
/// (the extension cannot import this type unless it is also added to the
/// extension target in Xcode) and to the
/// `com.apple.security.application-groups` entitlement in both
/// `MiniMasterChild.entitlements` and the extension's entitlements.
enum SharedPolicyDefaults {

    static let appGroupId = "group.com.minimaster.childapp"

    /// Raw UserDefaults keys — kept in sync with the extension by
    /// `test/ios-deviceactivity-monitor-contract.test.ts`.
    enum Keys {
        static let dailyLimitMinutes = "minimaster.shared.dailyLimitMinutes"
        static let limitReachedEvent = "minimaster.shared.limitReachedEvent"
        static let limitReachedAtMs  = "minimaster.shared.limitReachedAtMs"
    }

    static var suite: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // MARK: - Daily limit (app → extension)

    /// Persists the active daily limit so the monitor extension can build its
    /// threshold. A `nil` or non-positive value clears the limit.
    static func setDailyLimitMinutes(_ minutes: Int?) {
        guard let suite else { return }
        if let minutes, minutes > 0 {
            suite.set(minutes, forKey: Keys.dailyLimitMinutes)
        } else {
            suite.removeObject(forKey: Keys.dailyLimitMinutes)
        }
    }

    static func dailyLimitMinutes() -> Int? {
        guard let suite, suite.object(forKey: Keys.dailyLimitMinutes) != nil else { return nil }
        let value = suite.integer(forKey: Keys.dailyLimitMinutes)
        return value > 0 ? value : nil
    }

    // MARK: - Limit reached flag (extension → app)

    /// Called by the monitor extension when a usage threshold is reached.
    static func markLimitReached(event: String, atMs: Double) {
        guard let suite else { return }
        suite.set(event, forKey: Keys.limitReachedEvent)
        suite.set(atMs, forKey: Keys.limitReachedAtMs)
    }

    /// Consumed by the app on next foreground to report the event to the backend.
    /// Returns the event name together with the epoch-millis timestamp at which the
    /// limit was reached (and clears the flag), or `nil` if nothing pending. The
    /// timestamp lets the caller bucket the report by the day the limit was hit,
    /// not the day it happens to be reported.
    static func consumeLimitReachedFlag() -> (event: String, atMs: Double)? {
        guard let suite, let event = suite.string(forKey: Keys.limitReachedEvent) else { return nil }
        let atMs = suite.double(forKey: Keys.limitReachedAtMs)
        suite.removeObject(forKey: Keys.limitReachedEvent)
        suite.removeObject(forKey: Keys.limitReachedAtMs)
        return (event, atMs)
    }
}
