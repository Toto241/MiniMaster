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
    private let lastSuccessfulSyncKey = "minimaster.cache.lastSuccessfulSync"

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

    // MARK: - Offline safe-mode fallback

    /// Maximum time the device may run on a cached policy without any successful
    /// server contact before it falls back to safe mode. Mirrors the Android
    /// `OfflinePolicyCache` 72-hour `EXPIRED_SAFE_MODE` tier.
    static let safeModeThresholdSeconds = 72 * 60 * 60

    /// Freshness tier of the locally cached policy, based on the time since the
    /// last successful sync (`PolicyStore.cachedAt`).
    enum Freshness {
        case fresh             // synced within the staleness window
        case staleButUsable    // stale but still within the safe-mode window
        case expiredSafeMode   // no server contact for > safeModeThresholdSeconds
    }

    /// Records a successful server contact (sync). Must be called on **every**
    /// successful sync — including `upToDate` syncs where the policy did not
    /// change and `PolicyStore.cachedAt` is therefore NOT updated. Without this,
    /// a device that keeps syncing an unchanged policy would falsely expire into
    /// safe mode after 72 h despite continuous server contact.
    func recordSuccessfulSync(now: Date = Date()) {
        defaults.set(now, forKey: lastSuccessfulSyncKey)
    }

    /// Classifies the cached policy, mirroring Android `assessFreshness`. Uses the
    /// most recent successful-sync timestamp (preferred — updated on every sync,
    /// even `upToDate` ones) and falls back to `PolicyStore.cachedAt`:
    /// - no contact timestamp at all → `.expiredSafeMode` (fail-safe: a paired
    ///   device with no policy locks down rather than running open),
    /// - negative age (clock skew) → treated benignly as `.fresh`,
    /// - within the staleness window → `.fresh`,
    /// - within the 72 h safe-mode window → `.staleButUsable`,
    /// - older → `.expiredSafeMode`.
    func freshness(now: Date = Date(), stalenessThresholdSeconds: Int = 300) -> Freshness {
        let lastSync = defaults.object(forKey: lastSuccessfulSyncKey) as? Date
        guard let cachedAt = lastSync ?? policyStore.cachedAt else { return .expiredSafeMode }
        let elapsed = now.timeIntervalSince(cachedAt)
        if elapsed < 0 { return .fresh }
        if elapsed > TimeInterval(Self.safeModeThresholdSeconds) { return .expiredSafeMode }
        if elapsed > TimeInterval(stalenessThresholdSeconds) { return .staleButUsable }
        return .fresh
    }

    /// Safe-mode policy: fully locked, no allowed apps, zero usage allowance.
    func safeModePolicy() -> PolicyState {
        PolicyState(
            isLocked: true,
            appBlacklist: [],
            usageRules: PolicyState.UsageRulesState(
                dailyLimitMinutes: 0, bedtimeStart: nil, bedtimeEnd: nil
            ),
            policyVersion: policyStore.policy.policyVersion
        )
    }

    /// If the cached policy has expired (no server contact for > 72 h), enforces
    /// the safe-mode policy via `apply` and returns `true`. The cached real policy
    /// is intentionally left untouched so it is restored on the next successful
    /// sync. Idempotent — safe to call on every heartbeat / failed sync.
    @discardableResult
    func enforceOfflineFallbackIfExpired(now: Date = Date(), apply: (PolicyState) -> Void) -> Bool {
        guard freshness(now: now) == .expiredSafeMode else { return false }
        os_log(
            "OfflinePolicyCache: no server contact for > %d h — entering offline safe mode (full lock).",
            log: .default,
            type: .fault,
            Self.safeModeThresholdSeconds / 3600
        )
        apply(safeModePolicy())
        return true
    }
}
