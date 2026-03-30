import Foundation
import FirebaseFirestore

/// ViewModel for the parent dashboard — loads child devices and exposes
/// quick-action methods (lock/unlock, blacklist, usage rules).
@MainActor
final class DashboardViewModel: ObservableObject {

    @Published private(set) var children: [ChildDevice] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let db = Firestore.firestore()
    private let client = CloudFunctionsClient()
    private var listeners: [ListenerRegistration] = []

    // MARK: - Lifecycle

    func startListening(masterImei: String) {
        stopListening()
        isLoading = true
        let listener = db.collection("children")
            .whereField("masterImei", isEqualTo: masterImei)
            .addSnapshotListener { [weak self] snap, error in
                guard let self else { return }
                isLoading = false
                if let error {
                    errorMessage = error.localizedDescription
                    return
                }
                let docs = snap?.documents ?? []
                children = docs.compactMap { Self.childDevice(from: $0) }
            }
        listeners.append(listener)
    }

    func stopListening() {
        listeners.forEach { $0.remove() }
        listeners.removeAll()
    }

    // MARK: - Actions

    func setLocked(_ child: ChildDevice, isLocked: Bool) async {
        do {
            try await client.setDeviceLocked(childId: child.id, isLocked: isLocked)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateAppBlacklist(_ child: ChildDevice, apps: [String]) async {
        do {
            try await client.updateAppBlacklist(childId: child.id, appBlacklist: apps)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func setUsageRules(_ child: ChildDevice, rules: UsageRules) async {
        do {
            try await client.setUsageRules(
                childId: child.id,
                dailyLimitMinutes: rules.dailyLimitMinutes,
                bedtimeStart: rules.bedtimeStart,
                bedtimeEnd: rules.bedtimeEnd
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Helpers

    private static func childDevice(from doc: QueryDocumentSnapshot) -> ChildDevice? {
        let d = doc.data()
        return ChildDevice(
            id: doc.documentID,
            deviceName: d["deviceName"] as? String ?? doc.documentID,
            isLocked: d["isLocked"] as? Bool ?? false,
            appBlacklist: d["appBlacklist"] as? [String] ?? [],
            usageRules: {
                let raw = d["usageRules"] as? [String: Any] ?? [:]
                return UsageRules(
                    dailyLimitMinutes: raw["dailyLimit"] as? Int,
                    bedtimeStart: raw["bedtimeStart"] as? String,
                    bedtimeEnd: raw["bedtimeEnd"] as? String
                )
            }(),
            platform: DevicePlatform(rawValue: d["platform"] as? String ?? "android") ?? .android,
            capabilities: d["capabilities"] as? [String] ?? [],
            lastSeen: (d["lastSeen"] as? Timestamp)?.dateValue(),
            policyVersion: d["policyVersion"] as? Int ?? 0,
            lastPolicyVersion: d["lastPolicyVersion"] as? Int ?? 0
        )
    }
}
