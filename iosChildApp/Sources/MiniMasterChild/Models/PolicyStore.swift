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
    private let cachedAtKey = "minimaster.policy.cachedAt"
    private let cacheVersionKey = "minimaster.policy.cacheVersion"

    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var cachedAt: Date?
    @Published private(set) var cacheVersion: Int

    init() {
        if let data = defaults.data(forKey: storeKey),
           let saved = try? JSONDecoder().decode(PolicyState.self, from: data) {
            policy = saved
        } else {
            policy = PolicyState()
        }

        // Backward compatibility: missing keys default gracefully
        if let dateData = defaults.data(forKey: cachedAtKey),
           let date = try? JSONDecoder().decode(Date.self, from: dateData) {
            cachedAt = date
        } else {
            cachedAt = nil
        }

        cacheVersion = defaults.integer(forKey: cacheVersionKey)
    }

    func apply(_ newPolicy: PolicyState) {
        policy = newPolicy
        persist()
        lastSyncDate = Date()
        cachedAt = Date()
        cacheVersion += 1
        persistMetadata()
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

    private func persistMetadata() {
        if let dateData = try? JSONEncoder().encode(cachedAt) {
            defaults.set(dateData, forKey: cachedAtKey)
        }
        defaults.set(cacheVersion, forKey: cacheVersionKey)
    }
}
