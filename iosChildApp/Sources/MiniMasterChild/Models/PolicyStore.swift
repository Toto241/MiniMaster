import Foundation
import Combine

/// Observable store for the local [PolicyState].
///
/// Persists to UserDefaults so the policy is available immediately on the
/// next app launch without a network round-trip.
@MainActor
final class PolicyStore: ObservableObject {

    @Published private(set) var policy: PolicyState

    private let defaults = UserDefaults.standard
    private let storeKey = "minimaster.policy"

    init() {
        if let data = defaults.data(forKey: storeKey),
           let saved = try? JSONDecoder().decode(PolicyState.self, from: data) {
            policy = saved
        } else {
            policy = PolicyState()
        }
    }
            @Published private(set) var lastSyncDate: Date?
    func apply(_ newPolicy: PolicyState) {
        policy = newPolicy
        persist()
            lastSyncDate = Date()
    }

    func apply(command: DeviceCommand) {
        var updated = policy
        switch command.type {
        case .lockState:
            if let locked = command.payload["isLocked"]?.value as? Bool {
                updated.isLocked = locked
            }
        case .appBlacklist:
            if let apps = command.payload["appBlacklist"]?.value as? [String] {
                updated.appBlacklist = apps
            }
        case .usageRules, .screenTime:
            updated.usageRules = PolicyState.UsageRulesState(
                dailyLimitMinutes: command.payload["dailyLimit"]?.value as? Int,
                bedtimeStart: command.payload["bedtimeStart"]?.value as? String,
                bedtimeEnd: command.payload["bedtimeEnd"]?.value as? String
            )
        case .policyUpdate:
            if let locked = command.payload["isLocked"]?.value as? Bool { updated.isLocked = locked }
            if let apps = command.payload["appBlacklist"]?.value as? [String] { updated.appBlacklist = apps }
        }
        updated.policyVersion = max(updated.policyVersion, command.policyVersion)
        policy = updated
        persist()
    }

    // MARK: - Private

    private func persist() {
        if let data = try? JSONEncoder().encode(policy) {
            defaults.set(data, forKey: storeKey)
        }
    }
}
