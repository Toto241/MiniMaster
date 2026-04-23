import Foundation
import Network
import os.log

/// Dedicated cache manager that wraps [PolicyStore].
///
/// Provides staleness detection, conflict resolution (server wins),
/// and network-aware sync recommendations.
@MainActor
final class OfflinePolicyCache: ObservableObject {
    private let policyStore: PolicyStore
    private let defaults = UserDefaults.standard
    private let lastKnownServerVersionKey = "minimaster.cache.lastKnownServerVersion"

    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "minimaster.cache.network")
    private(set) var isNetworkAvailable = false

    @Published private(set) var lastKnownServerVersion: Int

    init(policyStore: PolicyStore) {
        self.policyStore = policyStore
        self.lastKnownServerVersion = defaults.integer(forKey: lastKnownServerVersionKey)

        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                self?.isNetworkAvailable = path.status == .satisfied
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    deinit {
        networkMonitor.cancel()
    }

    /// Whether the cached policy is older than the given threshold.
    func isStale(thresholdSeconds: Int = 300) -> Bool {
        guard let cachedAt = policyStore.cachedAt else {
            return true
        }
        return Date().timeIntervalSince(cachedAt) > TimeInterval(thresholdSeconds)
    }

    /// Whether a sync with the server should be attempted.
    func shouldSyncWithServer() -> Bool {
        isStale() && isNetworkAvailable
    }

    /// Resolves a conflict between local and server policy using "server wins".
    ///
    /// - Parameters:
    ///   - serverPolicy: The authoritative policy from the server.
    ///   - serverVersion: The version reported by the server.
    /// - Returns: The server policy (server always wins).
    func resolveConflict(serverPolicy: PolicyState, serverVersion: Int) -> PolicyState {
        let localVersion = policyStore.policy.policyVersion

        if localVersion > serverVersion {
            os_log(
                "OfflinePolicyCache: local policy (version %d) was newer than server version %d, but server wins",
                log: .default,
                type: .info,
                localVersion,
                serverVersion
            )
        }

        lastKnownServerVersion = serverVersion
        defaults.set(serverVersion, forKey: lastKnownServerVersionKey)

        return serverPolicy
    }
}
