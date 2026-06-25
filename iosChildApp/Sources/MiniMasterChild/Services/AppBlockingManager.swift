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
    @Published private(set) var appBlacklistNotice: String?

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
        let monitored = Set(ScreenTimeAppBlacklistCodec.decodeTokens(from: policy.appBlacklist))
        applyUsageRules(policy.usageRules, monitoredApplications: monitored)
        applyShields(isLocked: policy.isLocked, appBlacklist: policy.appBlacklist)
    }

    /// Applies changes from a single [DeviceCommand].
    func applyCommand(_ command: DeviceCommand) {
        switch command.type {
        case .lockState:
            let isLocked = command.payload["isLocked"]?.value as? Bool ?? false
            applyShields(isLocked: isLocked, appBlacklist: [])
        case .appBlacklist:
            let apps = command.payload["appBlacklist"]?.value as? [String] ?? []
            applyShields(isLocked: false, appBlacklist: apps)
        case .usageRules, .screenTime:
            applyUsageRules(PolicyState.UsageRulesState(
                dailyLimitMinutes: command.payload["dailyLimit"]?.value as? Int,
                bedtimeStart: command.payload["bedtimeStart"]?.value as? String,
                bedtimeEnd: command.payload["bedtimeEnd"]?.value as? String
            ))
        case .policyUpdate:
            let locked = command.payload["isLocked"]?.value as? Bool ?? false
            let apps = command.payload["appBlacklist"]?.value as? [String] ?? []
            applyShields(isLocked: locked, appBlacklist: apps)
        }
    }

    /// Removes local Screen Time shields and DeviceActivity schedules.
    func clearPolicy() {
        activityCenter.stopMonitoring([activityName])
        store.shield.applicationCategories = nil
        store.shield.applications = nil
        appBlacklistNotice = nil
    }

    // MARK: - Private

    private func applyShields(isLocked: Bool, appBlacklist: [String]) {
        guard isAuthorized else { return }
        if isLocked {
            store.shield.applicationCategories = .all(except: Set())
            store.shield.applications = nil
            appBlacklistNotice = nil
        } else {
            store.shield.applicationCategories = nil
            applyAppBlacklist(appBlacklist)
        }
    }

    private func applyAppBlacklist(_ bundleIds: [String]) {
        guard isAuthorized, !bundleIds.isEmpty else {
            appBlacklistNotice = nil
            store.shield.applications = nil
            store.shield.applicationCategories = nil
            return
        }

        let legacyBundleIds = ScreenTimeAppBlacklistCodec.legacyBundleIDs(from: bundleIds)

#if canImport(FamilyControls)
        let applicationTokens = ScreenTimeAppBlacklistCodec.decodeTokens(from: bundleIds)
        if !applicationTokens.isEmpty {
            store.shield.applications = Set(applicationTokens)
            store.shield.applicationCategories = nil
            appBlacklistNotice = AppBlacklistEnforcement.partialNotice(forResidualBundleIDs: legacyBundleIds)
            return
        }
#endif

        // Convert bundle ID strings to ApplicationToken set.
        // In production use FamilyActivityPicker (UI flow) to let the master
        // select apps — ApplicationToken cannot be constructed from a bundle ID
        // without the picker. This implementation is a placeholder.
        // See: https://developer.apple.com/documentation/familycontrols/familyactivitypicker
        //
        // The real implementation stores the tokens returned by FamilyActivityPicker
        // on the master device, transmits them to the backend as opaque data, and
        // the child app applies them here.
        store.shield.applications = nil
        appBlacklistNotice = AppBlacklistEnforcement.notice(for: legacyBundleIds)
        store.shield.applicationCategories = nil
    }

    private func applyUsageRules(
        _ rules: PolicyState.UsageRulesState,
        monitoredApplications: Set<ApplicationToken> = []
    ) {
        guard isAuthorized else { return }

        // Cancel existing schedule
        activityCenter.stopMonitoring([activityName])

        // Persist the configured limit so the DeviceActivityMonitor extension
        // (separate process) agrees with the host on the active limit.
        SharedPolicyDefaults.setDailyLimitMinutes(rules.dailyLimitMinutes)

        guard let dailyLimit = rules.dailyLimitMinutes, dailyLimit > 0 else { return }

        // Build a DeviceActivitySchedule spanning the full day
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )

        // Register a usage-threshold event. Without it the schedule starts but
        // nothing fires, so the limit is never enforced. When usage crosses the
        // threshold iOS launches the DeviceActivityMonitor extension's
        // `eventDidReachThreshold`, which applies the shield.
        //
        // The monitored set comes from the parent's FamilyActivityPicker
        // selection (same token model as the app blacklist). A device-wide
        // screen-time limit therefore requires that selection to include the
        // relevant apps/categories — mirroring the blacklist limitation.
        let limitEventName = DeviceActivityEvent.Name("minimaster.daily.limit")
        let limitEvent = DeviceActivityEvent(
            applications: monitoredApplications,
            categories: [],
            webDomains: [],
            threshold: DateComponents(minute: dailyLimit)
        )

        do {
            try activityCenter.startMonitoring(
                activityName,
                during: schedule,
                events: [limitEventName: limitEvent]
            )
        } catch {
            // DeviceActivity monitoring may fail if not authorized or during testing
        }
    }
}
