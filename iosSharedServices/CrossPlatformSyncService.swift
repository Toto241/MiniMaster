import Foundation
import FirebaseFunctions
import FirebaseMessaging

/// Bidirectional control-plane for the iOS child device.
/// Pulls pending commands from Firestore, applies them locally, and acks back.
/// Also publishes device events (heartbeat, usage reports, tamper events).
@MainActor
final class CrossPlatformSyncService: ObservableObject {

    @Published private(set) var lastPolicyVersion: Int = 0
    @Published private(set) var isSyncing = false
    @Published private(set) var lastError: Error?

    private static let iso8601Formatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private let client = CloudFunctionsClient()
    private let childId: String
    private var syncTimer: Timer?
    private var fcmToken: String?

    // MARK: - Init

    init(childId: String) {
        self.childId = childId
    }

    // MARK: - Lifecycle

    /// Starts the sync loop: registers FCM, fetches commands immediately, then polls.
    func start() async {
        await registerFCM()
        await performSync()
        startPolling()
    }

    func stop() {
        syncTimer?.invalidate()
        syncTimer = nil
    }

    // MARK: - FCM Registration

    private func registerFCM() async {
        do {
            let token = try await Messaging.messaging().token()
            fcmToken = token
            _ = try await client.registerDeviceEndpoint(
                childId: childId,
                platform: "ios",
                provider: "fcm",
                token: token,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
                capabilities: ["lock", "appBlacklist", "usageRules", "screenTime"]
            )
        } catch {
            lastError = error
        }
    }

    // MARK: - Sync Loop

    private func startPolling() {
        syncTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in await self.performSync() }
        }
    }

    private func performSync() async {
        guard !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        do {
            // 1. Fetch pending commands
            let response = try await client.fetchPendingCommands(
                childId: childId,
                maxItems: 50
            )

            // 2. Apply commands in order
            for command in response.commands {
                await applyCommand(command)
            }

            // 3. If policyVersion drift detected, request full snapshot
            if response.policyVersion > lastPolicyVersion {
                let snapshot = try await client.syncPolicySnapshot(
                    childId: childId,
                    knownPolicyVersion: lastPolicyVersion
                )
                if !snapshot.upToDate {
                    await applyPolicySnapshot(snapshot)
                }
                lastPolicyVersion = snapshot.policyVersion
            }
        } catch {
            lastError = error
        }
    }

    // MARK: - Command Application

    private func applyCommand(_ command: DeviceCommand) async {
        switch command.type {
        case "lock_state":
            if let locked = command.payload["isLocked"] as? Bool {
                NotificationCenter.default.post(
                    name: .init("MiniMasterSetDeviceLocked"),
                    object: nil,
                    userInfo: ["isLocked": locked]
                )
            }
        case "app_blacklist":
            if let blacklist = command.payload["appBlacklist"] as? [String] {
                NotificationCenter.default.post(
                    name: .init("MiniMasterUpdateAppBlacklist"),
                    object: nil,
                    userInfo: ["appBlacklist": blacklist]
                )
            }
        case "usage_rules":
            if let rules = command.payload["usageRules"] as? [String: Any] {
                NotificationCenter.default.post(
                    name: .init("MiniMasterSetUsageRules"),
                    object: nil,
                    userInfo: ["usageRules": rules]
                )
            }
        case "policy_update":
            // Full policy refresh requested — sync loop handles this next iteration
            break
        default:
            print("[CrossPlatformSyncService] Unknown command type: \(command.type)")
            do {
                try await client.acknowledgeCommand(
                    childId: childId,
                    commandId: command.commandId,
                    status: "failed",
                    appliedAt: Date()
                )
            } catch {
                lastError = error
            }
            return
        }

        // Acknowledge
        do {
            try await client.acknowledgeCommand(
                childId: childId,
                commandId: command.commandId,
                status: "applied",
                appliedAt: Date()
            )
        } catch {
            lastError = error
        }
    }

    private func applyPolicySnapshot(_ snapshot: PolicySnapshotResponse) async {
        NotificationCenter.default.post(
            name: .init("MiniMasterSetDeviceLocked"),
            object: nil,
            userInfo: ["isLocked": snapshot.isLocked]
        )
        NotificationCenter.default.post(
            name: .init("MiniMasterUpdateAppBlacklist"),
            object: nil,
            userInfo: ["appBlacklist": snapshot.appBlacklist]
        )
        NotificationCenter.default.post(
            name: .init("MiniMasterSetUsageRules"),
            object: nil,
            userInfo: ["usageRules": snapshot.usageRules]
        )
    }

    // MARK: - Event Publishing

    /// Publishes a heartbeat event to the server.
    func publishHeartbeat() async {
        do {
            let payload: [String: Any] = [
                "timestamp": Self.iso8601Formatter.string(from: Date()),
                "batteryLevel": await getBatteryLevel(),
                "networkType": getNetworkType()
            ]
            _ = try await Functions.functions().httpsCallable("publishDeviceEvent").call([
                "childId": childId,
                "eventType": "heartbeat",
                "payload": payload
            ])
        } catch {
            lastError = error
        }
    }

    /// Publishes a tamper event (e.g. child disables Screen Time).
    func publishTamperEvent(reason: String) async {
        do {
            _ = try await Functions.functions().httpsCallable("publishDeviceEvent").call([
                "childId": childId,
                "eventType": "tamper_event",
                "payload": ["reason": reason, "timestamp": Self.iso8601Formatter.string(from: Date())]
            ])
        } catch {
            lastError = error
        }
    }

    // MARK: - Helpers

    private func getBatteryLevel() async -> Int {
        // UIDevice.batteryLevel is available but requires monitoring to be enabled.
        // Return -1 if unavailable.
        return -1
    }

    private func getNetworkType() -> String {
        // Simplified — real implementation would use NWPathMonitor
        return "unknown"
    }
}

// MARK: - DeviceCommand Model

struct DeviceCommand: Identifiable {
    let id = UUID()
    let commandId: String
    let type: String
    let payload: [String: Any]
    let policyVersion: Int

    static func from(_ dict: [String: Any]) -> DeviceCommand? {
        guard let commandId = dict["commandId"] as? String,
              let type = dict["type"] as? String else { return nil }
        return DeviceCommand(
            commandId: commandId,
            type: type,
            payload: dict["payload"] as? [String: Any] ?? [:],
            policyVersion: (dict["policyVersion"] as? Int) ?? 0
        )
    }
}
