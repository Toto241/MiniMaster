import Foundation
import FamilyControls

/// Detects the tamper vector that actually exists on iOS: revocation of the
/// Family Controls (Screen Time) authorization the child app needs to enforce
/// policy.
///
/// iOS — unlike Android — gives an app no callback for its own uninstall and has
/// no Device Admin to disable, so those Android tamper paths don't apply. The
/// realistic equivalent is a parent/child turning the Screen Time permission off:
/// enforcement then silently stops. This monitor notices the
/// approved → not-approved transition so the app can report it to the parent
/// (mirroring the Android `accessibility_service_disabled` signal).
///
/// State is persisted so a revocation is reported once (not on every pass) and
/// survives an app restart, and so a fresh install that was never authorized is
/// not mistaken for a revocation.
@MainActor
final class TamperMonitor {

    private let defaults: UserDefaults
    private let everAuthorizedKey = "minimaster.tamper.everAuthorized"
    private let tamperUUIDKey = "minimaster.tamper.uuid"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Whether Family Controls authorization is currently approved.
    var isAuthorizationApproved: Bool {
        AuthorizationCenter.shared.authorizationStatus == .approved
    }

    /// Stable per-revocation idempotency id. Created on first access for the
    /// current revocation and persisted, so a report retried across an hour
    /// boundary (or after offline/flaky connectivity) reuses the same key and the
    /// backend de-duplicates. Cleared by `markRevocationReported`.
    var tamperUUID: String {
        if let uuid = defaults.string(forKey: tamperUUIDKey) {
            return uuid
        }
        let uuid = UUID().uuidString
        defaults.set(uuid, forKey: tamperUUIDKey)
        return uuid
    }

    /// Records that authorization is (still) approved. Must be called whenever the
    /// app observes an approved state so a later revocation can be detected. Pass
    /// `approved` explicitly in tests; defaults to the live authorization status.
    func recordIfApproved(approved: Bool? = nil) {
        if approved ?? isAuthorizationApproved {
            defaults.set(true, forKey: everAuthorizedKey)
        }
    }

    /// True iff authorization is not currently approved but had been approved
    /// before — i.e. it was revoked. Non-mutating; call `markRevocationReported`
    /// after the event has been delivered so it isn't reported repeatedly.
    func isRevoked(approved: Bool? = nil) -> Bool {
        let currentlyApproved = approved ?? isAuthorizationApproved
        return !currentlyApproved && defaults.bool(forKey: everAuthorizedKey)
    }

    /// Acknowledges that the current revocation has been reported. Clears the
    /// "was authorized" flag so the same revocation is not reported again until
    /// the child re-authorizes (which calls `recordIfApproved`).
    func markRevocationReported() {
        defaults.set(false, forKey: everAuthorizedKey)
        defaults.removeObject(forKey: tamperUUIDKey)
    }
}
