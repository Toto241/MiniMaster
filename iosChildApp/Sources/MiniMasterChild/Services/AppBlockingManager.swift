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

    // DeviceActivityEvent name the monitor extension listens for to detect the
    // daily usage cap (see DeviceActivityMonitorExtension.eventDidReachThreshold).
    private let dailyLimitEventName = DeviceActivityEvent.Name("minimaster.dailyLimitReached")

    // Dedicated, *named* store for the daily-usage-limit shield — the same store
    // the monitor extension writes to. Kept separate from `store` (lock/blacklist)
    // so the two shields never clobber each other (iOS unions shields across
    // stores). The app only clears it here when the limit actually changes.
    private let dailyLimitStore = ManagedSettingsStore(named: ManagedSettingsStore.Name("minimaster.dailyLimit"))

    // Application tokens (parent's FamilyActivityPicker selection, decoded from the
    // policy app-blacklist) that the daily-usage-limit DeviceActivityEvent counts.
    // Tracked here so both the full-policy sync and incremental commands keep the
    // monitored set in sync for `applyUsageRules`.
    private var monitoredApplications: Set<ApplicationToken> = []

    // Last usage-rules state applied, so an incremental command that only changes
    // the monitored app set can re-register the DeviceActivityEvent without waiting
    // for a usage-rules command or a full policy sync.
    private var lastUsageRules = PolicyState.UsageRulesState(
        dailyLimitMinutes: nil, bedtimeStart: nil, bedtimeEnd: nil
    )

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
        monitoredApplications = Set(ScreenTimeAppBlacklistCodec.decodeTokens(from: policy.appBlacklist))
        applyUsageRules(policy.usageRules)
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
            monitoredApplications = Set(ScreenTimeAppBlacklistCodec.decodeTokens(from: apps))
            // Re-register the usage-limit event so it monitors the new app set.
            applyUsageRules(lastUsageRules)
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
            monitoredApplications = Set(ScreenTimeAppBlacklistCodec.decodeTokens(from: apps))
            // Re-register the usage-limit event so it monitors the new app set.
            applyUsageRules(lastUsageRules)
            applyShields(isLocked: locked, appBlacklist: apps)
        }
    }

    /// Removes local Screen Time shields and DeviceActivity schedules.
    func clearPolicy() {
        activityCenter.stopMonitoring([activityName])
        store.shield.applicationCategories = nil
        store.shield.applications = nil
        dailyLimitStore.shield.applicationCategories = nil
        monitoredApplications = []
        lastUsageRules = PolicyState.UsageRulesState(
            dailyLimitMinutes: nil, bedtimeStart: nil, bedtimeEnd: nil
        )
        appBlacklistNotice = nil
        SharedPolicyDefaults.setDailyLimitMinutes(nil)
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

    private func applyUsageRules(_ rules: PolicyState.UsageRulesState) {
        // Remember the latest rules so a later app-set change can re-register
        // the event with the same limit (see applyCommand).
        lastUsageRules = rules

        guard isAuthorized else { return }

        // Cancel existing schedule
        activityCenter.stopMonitoring([activityName])

        // Previously-active limit (from the shared suite) so we can detect a change
        // and avoid lifting a shield that was legitimately applied earlier today.
        let previousLimit = SharedPolicyDefaults.dailyLimitMinutes()

        guard let dailyLimit = rules.dailyLimitMinutes, dailyLimit > 0 else {
            // No active limit — clear the value shared with the monitor extension
            // and unconditionally lift any usage-cap shield. Without a limit there
            // must be no cap shield, and nil-ing is idempotent, so this also
            // recovers from any inconsistent state where the shield outlived its
            // limit (which would otherwise leave the device locked).
            dailyLimitStore.shield.applicationCategories = nil
            SharedPolicyDefaults.setDailyLimitMinutes(nil)
            return
        }

        // Share the active limit with the DeviceActivityMonitor extension, which
        // runs in a separate process and reads it from the App Group suite.
        SharedPolicyDefaults.setDailyLimitMinutes(dailyLimit)

        // Only when the limit value actually changes do we lift any standing
        // usage-cap shield, so a raised/lowered limit unblocks now and is
        // re-enforced when the new threshold is hit. We deliberately do NOT clear
        // it on an unchanged limit — that would unblock the device for the rest of
        // the day after the cap was legitimately reached.
        if previousLimit != dailyLimit {
            dailyLimitStore.shield.applicationCategories = nil
        }

        // Build a DeviceActivitySchedule spanning the full day
        let schedule = DeviceActivitySchedule(
            intervalStart: DateComponents(hour: 0, minute: 0),
            intervalEnd: DateComponents(hour: 23, minute: 59),
            repeats: true
        )

        // Register a usage threshold so the DeviceActivityMonitor extension
        // receives `eventDidReachThreshold` once the daily allowance is used up —
        // that callback is where the shield is actually applied. Without an
        // `events:` entry the schedule alone never enforces anything.
        //
        // The monitored set is the parent's FamilyActivityPicker selection,
        // decoded from the policy app-blacklist via `ScreenTimeAppBlacklistCodec`
        // (the same tokens used for the blacklist shield). The daily cap therefore
        // counts time spent in those parent-selected apps. ApplicationToken values
        // cannot be constructed off-device, so if the parent selected nothing the
        // set is empty and the event cannot fire — a documented no-op until a
        // selection exists. See docs/IOS_ANDROID_PARITY_PLAN_2026-06-19.md.
        //
        // Normalize into hours+minutes rather than passing a raw minute count that
        // can exceed 59, which DateComponents/DeviceActivity may handle unevenly.
        let limitEvent = DeviceActivityEvent(
            applications: monitoredApplications,
            categories: [],
            webDomains: [],
            threshold: DateComponents(hour: dailyLimit / 60, minute: dailyLimit % 60)
        )

        do {
            try activityCenter.startMonitoring(
                activityName,
                during: schedule,
                events: [dailyLimitEventName: limitEvent]
            )
        } catch {
            // DeviceActivity monitoring may fail if not authorized or during testing
        }
    }
}
