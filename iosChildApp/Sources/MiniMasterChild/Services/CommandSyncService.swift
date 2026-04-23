import Foundation
import FirebaseMessaging

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

    let client: ChildCloudFunctionsClient
    private let policyStore: PolicyStore
    private let blockingManager: AppBlockingManager
    private var childId: String?

    init(
        client: ChildCloudFunctionsClient,
        policyStore: PolicyStore,
        blockingManager: AppBlockingManager
    ) {
        self.client = client
        self.policyStore = policyStore
        self.blockingManager = blockingManager
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onFcmTokenRefreshed(_:)),
            name: .childFcmTokenRefreshed,
            object: nil
        )
    }

    /// Store the childId after successful pairing.
    func configure(childId: String) {
        self.childId = childId
    }

    // MARK: - Convenience wrappers (no childId arg)

    func onAppStart() async {
        guard let id = childId else { return }
        await syncPolicySnapshot(childId: id)
        await fetchAndApplyAllCommands(childId: id)
        await reportHeartbeat(childId: id)
    }

    func onFcmWakeUp() async {
        guard let id = childId else { return }
        await fetchAndApplyAllCommands(childId: id)
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
                policyStore.apply(newState)
                appBlockingManager.applyPolicy(newState)
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
        }
    }

    // MARK: - Fetch & Apply Commands

    func fetchAndApplyAllCommands(childId: String, cursor: String? = nil) async {
        do {
            let (commands, nextCursor, _) = try await client.fetchPendingCommands(
                childId: childId,
                cursor: cursor
            )
            for command in commands {
                await applyAndAck(command: command, childId: childId)
            }
            if let next = nextCursor {
                await fetchAndApplyAllCommands(childId: childId, cursor: next)
            }
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

    // MARK: - Endpoint Registration

    func _registerEndpoint(childId: String, apnsToken: String, appVersion: String) async {
        let capabilities = [
            "lock", "appBlacklist", "usageRules", "screenTime",
            "tamperDetection", "heartbeat", "taskProof"
        ]
        do {
            _ = try await client.registerDeviceEndpoint(
                childId: childId,
                token: apnsToken,
                appVersion: appVersion,
                capabilities: capabilities
            )
        } catch { /* non-fatal: will retry on next token refresh */ }
    }

    // MARK: - Private

    private func applyAndAck(command: DeviceCommand, childId: String) async {
        guard !command.isExpired else { return }
        do {
            policyStore.apply(command: command)
            blockingManager.applyCommand(command)
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

    @objc private func onFcmTokenRefreshed(_ notification: Notification) {
        guard let token = notification.userInfo?["token"] as? String,
              let id = childId else { return }
        Task { await _registerEndpoint(childId: id, apnsToken: token, appVersion: appVersion) }
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }
}
