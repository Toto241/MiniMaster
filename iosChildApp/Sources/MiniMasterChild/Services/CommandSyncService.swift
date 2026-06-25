import Foundation
import FirebaseMessaging
import Network
import os.log
import UIKit

/// Drives the Control-Plane pull loop on iOS.
///
/// Responsibilities:
/// - On app start: calls `syncPolicySnapshot` and then `fetchPendingCommands`.
/// - On FCM wake-up hint: calls `fetchPendingCommands` to commit missed commands.
/// - Acknowledges every applied/failed command back to the server.
/// - Reports events (heartbeat, usage_report) via `publishDeviceEvent`.
///
/// Thread-safety: `@MainActor` for the `PolicyStore` mutations;
/// network calls dispatched on `Task.detached`.
@MainActor
final class CommandSyncService: ObservableObject {

    @Published private(set) var isSyncing = false
    @Published private(set) var syncError: Error?
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var pendingCommandCount: Int = 0
    @Published var isOffline: Bool = false

    let client: ChildCloudFunctionsClient
    private let policyStore: PolicyStore
    private let blockingManager: AppBlockingManager
    private let offlinePolicyCache: OfflinePolicyCache
    private var childId: String?

    private let networkMonitor = NWPathMonitor()
    private let networkQueue = DispatchQueue(label: "minimaster.sync.network")
    private var previousPathStatus: NWPath.Status = .satisfied
    private var foregroundHeartbeatTask: Task<Void, Never>?

    init(
        client: ChildCloudFunctionsClient,
        policyStore: PolicyStore,
        blockingManager: AppBlockingManager
    ) {
        self.client = client
        self.policyStore = policyStore
        self.blockingManager = blockingManager
        self.offlinePolicyCache = OfflinePolicyCache(policyStore: policyStore)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onFcmTokenRefreshed(_:)),
            name: .childFcmTokenRefreshed,
            object: nil
        )

        networkMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor in
                guard let self = self else { return }
                let wasAvailable = self.previousPathStatus == .satisfied
                self.previousPathStatus = path.status
                self.isOffline = path.status != .satisfied

                if path.status == .satisfied && !wasAvailable, let childId = self.childId {
                    await self.syncPolicySnapshot(childId: childId)
                    await self.fetchAndApplyAllCommands(childId: childId)
                }
            }
        }
        networkMonitor.start(queue: networkQueue)
    }

    deinit {
        foregroundHeartbeatTask?.cancel()
        networkMonitor.cancel()
    }

    /// Store the childId after successful pairing.
    func configure(childId: String) {
        self.childId = childId
    }

    func clearConfiguration() {
        childId = nil
        pendingCommandCount = 0
        syncError = nil
        foregroundHeartbeatTask?.cancel()
        foregroundHeartbeatTask = nil
    }

    // MARK: - Convenience wrappers (no childId arg)

    func onAppStart() async {
        guard let id = childId else { return }
        await syncPolicySnapshot(childId: id)
        await fetchAndApplyAllCommands(childId: id)
        await reportLimitReachedIfNeeded(childId: id)
        await reportHeartbeat(childId: id)
        startForegroundHeartbeat()
    }

    func onFcmWakeUp() async {
        guard let id = childId else { return }
        await fetchAndApplyAllCommands(childId: id)
        await reportLimitReachedIfNeeded(childId: id)
    }

    func registerEndpoint() async {
        guard let id = childId,
              let token = Messaging.messaging().fcmToken else { return }
        await _registerEndpoint(childId: id, apnsToken: token, appVersion: appVersion)
    }

    // MARK: - Policy Snapshot

    func syncPolicySnapshot(childId: String) async {
        isSyncing = true; defer { isSyncing = false }
        do {
            let snapshot = try await client.syncPolicySnapshot(
                childId: childId,
                knownPolicyVersion: policyStore.policy.policyVersion
            )

            guard let fullPolicy = snapshot["fullPolicy"] as? [String: Any],
                  let policyVersion = snapshot["policyVersion"] as? Int else { return }

            let upToDate = snapshot["upToDate"] as? Bool ?? false
            if !upToDate {
                let newState = PolicyState(
                    isLocked: fullPolicy["isLocked"] as? Bool ?? false,
                    appBlacklist: fullPolicy["appBlacklist"] as? [String] ?? [],
                    usageRules: PolicyState.UsageRulesState(
                        dailyLimitMinutes: (fullPolicy["usageRules"] as? [String: Any])?["dailyLimit"] as? Int,
                        bedtimeStart: (fullPolicy["usageRules"] as? [String: Any])?["bedtimeStart"] as? String,
                        bedtimeEnd: (fullPolicy["usageRules"] as? [String: Any])?["bedtimeEnd"] as? String
                    ),
                    policyVersion: policyVersion
                )
                let resolved = offlinePolicyCache.resolveConflict(serverPolicy: newState, serverVersion: policyVersion)
                policyStore.apply(resolved)
                blockingManager.applyPolicy(resolved)
            }

            // Also apply pending critical commands in snapshot
            let criticals = snapshot["pendingCriticalCommands"] as? [[String: Any]] ?? []
            pendingCommandCount = criticals.count
            for raw in criticals {
                guard let command = DeviceCommand.from(raw) else { continue }
                await applyAndAck(command: command, childId: childId)
            }
            pendingCommandCount = 0
            lastSyncDate = Date()
        } catch {
            syncError = error
            if policyStore.lastSyncDate == nil ||
               Date().timeIntervalSince(policyStore.lastSyncDate!) > 300 {
                os_log(
                    "Policy sync failed and local policy is stale (lastSync: %@). Keeping local policy active.",
                    log: .default,
                    type: .fault,
                    policyStore.lastSyncDate?.description ?? "never"
                )
            }
        }
    }

    // MARK: - Fetch & Apply Commands

    func fetchAndApplyAllCommands(childId: String, cursor initialCursor: String? = nil) async {
        var cursor: String? = initialCursor
        var iterations = 0
        let maxIterations = 100
        do {
            repeat {
                let (commands, nextCursor, _) = try await client.fetchPendingCommands(
                    childId: childId,
                    cursor: cursor
                )
                for command in commands {
                    await applyAndAck(command: command, childId: childId)
                }
                cursor = nextCursor
                iterations += 1
            } while cursor != nil && iterations < maxIterations
            pendingCommandCount = 0
            lastSyncDate = Date()
        } catch {
            syncError = error
        }
    }

    // MARK: - Events

    func reportHeartbeat(childId: String) async {
        let key = "hb-\(childId)-\(Int(Date().timeIntervalSince1970 / 900))" // 15-min bucket
        do {
            try await client.publishDeviceEvent(
                childId: childId,
                eventType: "heartbeat",
                payload: ["ts": Int(Date().timeIntervalSince1970)],
                idempotencyKey: key
            )
        } catch { /* non-fatal */ }
    }

    /// If the DeviceActivityMonitor extension flagged that the daily usage limit
    /// was reached, publish the event here (the background extension cannot
    /// reliably call Cloud Functions). Idempotent per UTC day.
    func reportLimitReachedIfNeeded(childId: String) async {
        guard let flag = SharedPolicyDefaults.consumeLimitReachedFlag() else { return }
        let key = "limit-\(childId)-\(flag.dayBucket)"
        do {
            try await client.publishDeviceEvent(
                childId: childId,
                eventType: flag.event,
                payload: [
                    "limitMinutes": SharedPolicyDefaults.dailyLimitMinutes() ?? 0,
                    "dayBucket": flag.dayBucket
                ],
                idempotencyKey: key
            )
        } catch {
            // Non-fatal: restore the flag so the next foreground retries the report.
            SharedPolicyDefaults.markLimitReached(event: flag.event)
        }
    }

    func reportUsage(childId: String, appId: String, minutes: Int) async {
        let key = "usage-\(childId)-\(appId)-\(Int(Date().timeIntervalSince1970 / 3600))" // hourly key
        do {
            try await client.publishDeviceEvent(
                childId: childId,
                eventType: "usage_report",
                payload: ["appBundleId": appId, "durationMinutes": minutes],
                idempotencyKey: key
            )
        } catch { /* non-fatal */ }
    }

    func startForegroundHeartbeat(intervalSeconds: UInt64 = 900) {
        guard foregroundHeartbeatTask == nil else { return }
        foregroundHeartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.sendForegroundHeartbeat()
                do {
                    try await Task.sleep(nanoseconds: intervalSeconds * 1_000_000_000)
                } catch {
                    break
                }
            }
        }
    }

    // MARK: - Endpoint Registration

    func _registerEndpoint(childId: String, apnsToken: String, appVersion: String) async {
        let capabilities = [
            "lock", "appBlacklist", "usageRules", "screenTime",
            "screenTimeTokens", "offlinePolicy", "pushWakeup",
            "foregroundHeartbeat", "heartbeat"
        ]
        let supportedProtocols = [
            "control-plane/v1",
            "device-events/v1",
            "screen-time-token/v1",
            "foreground-heartbeat/v1"
        ]
        do {
            _ = try await client.registerDeviceEndpoint(
                childId: childId,
                token: apnsToken,
                appVersion: appVersion,
                buildNumber: buildNumber,
                releaseChannel: releaseChannel,
                capabilities: capabilities,
                supportedProtocols: supportedProtocols,
                runtime: runtimeContext
            )
        } catch { /* non-fatal: will retry on next token refresh */ }
    }

    // MARK: - Private

    private func applyAndAck(command: DeviceCommand, childId: String) async {
        guard !command.isExpired else { return }
        do {
            policyStore.apply(command: command)
            blockingManager.applyPolicy(policyStore.policy)
            try await client.acknowledgeCommand(
                childId: childId,
                commandId: command.id,
                status: "applied",
                appliedAt: Date()
            )
        } catch {
            try? await client.acknowledgeCommand(
                childId: childId,
                commandId: command.id,
                status: "failed",
                appliedAt: Date(),
                errorCode: String(describing: error)
            )
        }
    }

    private func sendForegroundHeartbeat() async {
        guard let id = childId else { return }
        await reportHeartbeat(childId: id)
    }

    @objc private func onFcmTokenRefreshed(_ notification: Notification) {
        guard let token = notification.userInfo?["token"] as? String,
              let id = childId else { return }
        Task { await _registerEndpoint(childId: id, apnsToken: token, appVersion: appVersion) }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    private var releaseChannel: String {
        Bundle.main.infoDictionary?["MINIMASTER_RELEASE_CHANNEL"] as? String ?? "unknown"
    }

    private var runtimeContext: [String: Any] {
        [
            "osVersion": UIDevice.current.systemVersion,
            "deviceModel": UIDevice.current.model,
            "locale": Locale.current.identifier,
            "timeZone": TimeZone.current.identifier,
            "appCheckMode": "apple"
        ]
    }
}
