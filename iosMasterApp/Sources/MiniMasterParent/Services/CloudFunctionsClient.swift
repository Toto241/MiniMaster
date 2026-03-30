import Foundation
import FirebaseFunctions

/// Type-safe wrapper around all MiniMaster Firebase Callable Functions.
///
/// Each method maps 1:1 to a backend callable function. Parameters and
/// responses are strongly typed so calling code doesn't work with raw
/// dictionaries.
///
/// Usage:
/// ```swift
/// let client = CloudFunctionsClient()
/// let result = try await client.setDeviceLocked(childId: "abc", isLocked: true)
/// ```
final class CloudFunctionsClient {

    private let functions = Functions.functions()

    // MARK: - Pairing

    func generatePairingLink() async throws -> String {
        let result = try await functions.httpsCallable("generatePairingLink").call()
        let data = try cast(result.data, to: [String: Any].self)
        return try require(data["pairingToken"] as? String, key: "pairingToken")
    }

    func createPairingCode(childId: String) async throws -> String {
        let result = try await functions.httpsCallable("createPairingCode")
            .call(["childId": childId])
        let data = try cast(result.data, to: [String: Any].self)
        return try require(data["pairingCode"] as? String, key: "pairingCode")
    }

    // MARK: - Device Rules

    func setDeviceLocked(childId: String, isLocked: Bool) async throws {
        _ = try await functions.httpsCallable("setDeviceLocked")
            .call(["childId": childId, "isLocked": isLocked])
    }

    func updateAppBlacklist(childId: String, appBlacklist: [String]) async throws {
        _ = try await functions.httpsCallable("updateAppBlacklist")
            .call(["childId": childId, "appBlacklist": appBlacklist])
    }

    func setUsageRules(childId: String, dailyLimitMinutes: Int?,
                       bedtimeStart: String?, bedtimeEnd: String?) async throws {
        var usageRules: [String: Any] = [:]
        if let v = dailyLimitMinutes { usageRules["dailyLimit"] = v }
        if let v = bedtimeStart      { usageRules["bedtimeStart"] = v }
        if let v = bedtimeEnd        { usageRules["bedtimeEnd"] = v }
        _ = try await functions.httpsCallable("setUsageRules")
            .call(["childId": childId, "usageRules": usageRules])
    }

    func getRulesForChild(childId: String) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("getRulesForChild")
            .call(["childId": childId])
        return try cast(result.data, to: [String: Any].self)
    }

    // MARK: - Tasks

    func createTask(childId: String, description: String, deadline: Date?) async throws -> String {
        var params: [String: Any] = ["childId": childId, "description": description]
        if let d = deadline { params["deadline"] = ISO8601DateFormatter().string(from: d) }
        let result = try await functions.httpsCallable("createTask").call(params)
        let data = try cast(result.data, to: [String: Any].self)
        return try require(data["taskId"] as? String, key: "taskId")
    }

    func approveTask(childId: String, taskId: String) async throws {
        _ = try await functions.httpsCallable("approveTask")
            .call(["childId": childId, "taskId": taskId])
    }

    func rejectTask(childId: String, taskId: String, reason: String?) async throws {
        var params: [String: Any] = ["childId": childId, "taskId": taskId]
        if let r = reason { params["reason"] = r }
        _ = try await functions.httpsCallable("rejectTask").call(params)
    }

    // MARK: - Subscription

    func verifyPurchase(purchaseToken: String, sku: String) async throws {
        _ = try await functions.httpsCallable("verifyPurchase")
            .call(["purchaseToken": purchaseToken, "sku": sku])
    }

    func getSubscriptionStatus() async throws -> [String: Any] {
        let result = try await functions.httpsCallable("getSubscriptionStatus").call()
        return try cast(result.data, to: [String: Any].self)
    }

    // MARK: - Control-Plane

    func registerDeviceEndpoint(
        childId: String,
        platform: String,
        provider: String,
        token: String,
        appVersion: String,
        capabilities: [String]
    ) async throws -> (endpointId: String, acceptedCapabilities: [String]) {
        let params: [String: Any] = [
            "childId": childId,
            "platform": platform,
            "provider": provider,
            "token": token,
            "appVersion": appVersion,
            "capabilities": capabilities
        ]
        let result = try await functions.httpsCallable("registerDeviceEndpoint").call(params)
        let data = try cast(result.data, to: [String: Any].self)
        let endpointId = try require(data["endpointId"] as? String, key: "endpointId")
        let accepted = (data["acceptedCapabilities"] as? [String]) ?? []
        return (endpointId, accepted)
    }

    func fetchPendingCommands(childId: String, cursor: String? = nil,
                              maxItems: Int = 20) async throws -> CommandsResponse {
        var params: [String: Any] = ["childId": childId, "maxItems": maxItems]
        if let c = cursor { params["sinceCursor"] = c }
        let result = try await functions.httpsCallable("fetchPendingCommands").call(params)
        let data = try cast(result.data, to: [String: Any].self)
        let rawCommands = (data["commands"] as? [[String: Any]]) ?? []
        let commands = rawCommands.compactMap(DeviceCommand.from)
        let nextCursor = data["nextCursor"] as? String
        let policyVersion = (data["policyVersion"] as? Int) ?? 0
        return CommandsResponse(commands: commands, nextCursor: nextCursor, policyVersion: policyVersion)
    }

    func acknowledgeCommand(childId: String, commandId: String,
                            status: String, appliedAt: Date,
                            errorCode: String? = nil) async throws {
        var params: [String: Any] = [
            "childId": childId,
            "commandId": commandId,
            "status": status,
            "appliedAt": Int(appliedAt.timeIntervalSince1970 * 1000)
        ]
        if let e = errorCode { params["errorCode"] = e }
        _ = try await functions.httpsCallable("acknowledgeCommand").call(params)
    }

    func syncPolicySnapshot(childId: String,
                            knownPolicyVersion: Int = 0) async throws -> PolicySnapshotResponse {
        let params: [String: Any] = [
            "childId": childId,
            "knownPolicyVersion": knownPolicyVersion
        ]
        let result = try await functions.httpsCallable("syncPolicySnapshot").call(params)
        let data = try cast(result.data, to: [String: Any].self)
        return PolicySnapshotResponse(from: data)
    }

    // MARK: - Helpers

    private func cast<T>(_ value: Any?, to type: T.Type) throws -> T {
        guard let typed = value as? T else {
            throw CloudFunctionsError.unexpectedResponseType
        }
        return typed
    }

    private func require<T>(_ value: T?, key: String) throws -> T {
        guard let v = value else {
            throw CloudFunctionsError.missingField(key)
        }
        return v
    }
}

// MARK: - Response Types

struct CommandsResponse {
    let commands: [DeviceCommand]
    let nextCursor: String?
    let policyVersion: Int
}

struct PolicySnapshotResponse {
    let isLocked: Bool
    let appBlacklist: [String]
    let usageRules: [String: Any]
    let platform: String
    let policyVersion: Int
    let pendingCriticalCommands: [DeviceCommand]
    let upToDate: Bool

    init(from data: [String: Any]) {
        let policy = data["fullPolicy"] as? [String: Any] ?? [:]
        isLocked = policy["isLocked"] as? Bool ?? false
        appBlacklist = policy["appBlacklist"] as? [String] ?? []
        usageRules = policy["usageRules"] as? [String: Any] ?? [:]
        platform = policy["platform"] as? String ?? "ios"
        policyVersion = data["policyVersion"] as? Int ?? 0
        upToDate = data["upToDate"] as? Bool ?? false
        let raw = data["pendingCriticalCommands"] as? [[String: Any]] ?? []
        pendingCriticalCommands = raw.compactMap(DeviceCommand.from)
    }
}

enum CloudFunctionsError: LocalizedError {
    case unexpectedResponseType
    case missingField(String)

    var errorDescription: String? {
        switch self {
        case .unexpectedResponseType: return "Unerwartetes Antwortformat vom Server."
        case .missingField(let key):  return "Pflichtfeld '\(key)' fehlt in der Serverantwort."
        }
    }
}
