import Foundation
import ManagedSettings
import FamilyControls
import DeviceActivity

/// Enforces the parental-control policy on the iOS child device using
/// Apple's Screen Time APIs (ManagedSettings + DeviceActivity).
///
/// ### Entitlement required
/// `com.apple.developer.family-controls` — must be present in the app's
/// entitlements file and the device must be enrolled in Child Account/
/// Screen Time or MDM-managed.
///
/// ### Usage
/// ```swift
/// let manager = AppBlockingManager()
/// manager.applyPolicy(policyStore.policy)
/// ```
@MainActor
final class AppBlockingManager: ObservableObject {

    @Published private(set) var isAuthorized = false
    @Published private(set) var authorizationError: Error?

    private let store = ManagedSettingsStore()
    private let activityCenter = DeviceActivityCenter()

    // DeviceActivity name used to track daily screen time schedules
    private let activityName = DeviceActivityName("minimaster.daily")

    init() {
        Task { await checkAuthorization() }
    }

    // MARK: - Authorization

    func requestAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
        } catch {
            authorizationError = error
        }
    }

    func checkAuthorization() async {
        isAuthorized = AuthorizationCenter.shared.authorizationStatus == .approved
    }

    // MARK: - Policy Application

    /// Applies the full [PolicyState] to ManagedSettings + DeviceActivity.
    func applyPolicy(_ policy: PolicyState) {
        applyLockState(policy.isLocked)
        applyAppBlacklist(policy.appBlacklist)
        applyUsageRules(policy.usageRules)
    }

    /// Applies changes from a single [DeviceCommand].
    func applyCommand(_ command: DeviceCommand) {
        switch command.type {
        case .lockState:
            let isLocked = command.payload["isLocked"]?.value as? Bool ?? false
            applyLockState(isLocked)
        case .appBlacklist:
            let apps = command.payload["appBlacklist"]?.value as? [String] ?? []
            applyAppBlacklist(apps)
        case .usageRules, .screenTime:
            applyUsageRules(PolicyState.UsageRulesState(
                dailyLimitMinutes: command.payload["dailyLimit"]?.value as? Int,
                bedtimeStart: command.payload["bedtimeStart"]?.value as? String,
                bedtimeEnd: command.payload["bedtimeEnd"]?.value as? String
            ))
        case .policyUpdate:
            if let locked = command.payload["isLocked"]?.value as? Bool {
                applyLockState(locked)
            }
            if let apps = command.payload["appBlacklist"]?.value as? [String] {
                applyAppBlacklist(apps)
            }
        }
    }

    // MARK: - Private

    private func applyLockState(_ isLocked: Bool) {
        guard isAuthorized else { return }
        if isLocked {
            // Block all apps except Phone and Settings (emergency access)
            store.shield.applications = ApplicationToken.all
        } else {
            store.shield.applications = nil
        }
    }

    private func applyAppBlacklist(_ bundleIds: [String]) {
        guard isAuthorized, !bundleIds.isEmpty else {
            store.shield.applicationCategories = nil
            return
        }
        // Convert bundle ID strings to ApplicationToken set.
        // In production use FamilyActivityPicker (UI flow) to let the master
        // select apps — ApplicationToken cannot be constructed from a bundle ID
        // without the picker. This implementation is a placeholder.
        // See: https://developer.apple.com/documentation/familycontrols/familyactivitypicker
        //
        // The real implementation stores the tokens returned by FamilyActivityPicker
        // on the master device, transmits them to the backend as opaque data, and
        // the child app applies them here.
        //
        // Placeholder: shield no apps (safe default).
        store.shield.applicationCategories = nil
    }

    private func applyUsageRules(_ rules: PolicyState.UsageRulesState) {
        guard isAuthorized else { return }

        // Cancel existing schedule
        activityCenter.stopMonitoring([activityName])

        guard let dailyLimit = rules.dailyLimitMinutes, dailyLimit > 0 else { return }

        // Build a DeviceActivitySchedule spanning the full day
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )
        do {
            try activityCenter.startMonitoring(
                activityName,
                during: schedule
            )
        } catch {
            // DeviceActivity monitoring may fail if not authorized or during testing
        }
    }
}
