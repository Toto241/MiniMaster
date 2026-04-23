import Foundation
import FirebaseFunctions

/// Minimal Cloud Functions client for the child device.
///
/// Only calls the endpoints that the child app actually uses so the
/// dependency surface stays small and auditable.
final class ChildCloudFunctionsClient {

    private let functions = Functions.functions()

    // MARK: - Pairing

    struct PairingResult {
        let childId: String
        let masterId: String?
    }

    func pairAuthenticatedChild(pairingCode: String?) async throws -> PairingResult {
        var params: [String: Any] = [:]
        if let code = pairingCode { params["pairingCode"] = code }
        let result = try await functions.httpsCallable("pairAuthenticatedChild").call(params)
        let data = try cast(result.data)
        let childId = try require(data["childId"] as? String, key: "childId")
        let masterId = data["masterId"] as? String
        return PairingResult(childId: childId, masterId: masterId)
    }

    func pairAuthenticatedChild(pairingToken: String?) async throws -> PairingResult {
        var params: [String: Any] = [:]
        if let token = pairingToken { params["pairingToken"] = token }
        let result = try await functions.httpsCallable("pairAuthenticatedChild").call(params)
        let data = try cast(result.data)
        let childId = try require(data["childId"] as? String, key: "childId")
        let masterId = data["masterId"] as? String
        return PairingResult(childId: childId, masterId: masterId)
    }

    // MARK: - Control-Plane (Pull)

    func registerDeviceEndpoint(
        childId: String,
        token: String,
        appVersion: String,
        capabilities: [String]
    ) async throws -> String {
        let params: [String: Any] = [
            "childId": childId,
            "platform": "ios",
            "provider": "apns",         // iOS devices use APNs tokens
            "token": token,
            "appVersion": appVersion,
            "capabilities": capabilities
        ]
        let result = try await functions.httpsCallable("registerDeviceEndpoint").call(params)
        let data = try cast(result.data)
        return try require(data["endpointId"] as? String, key: "endpointId")
    }

    func fetchPendingCommands(
        childId: String,
        cursor: String? = nil,
        maxItems: Int = 20
    ) async throws -> ([DeviceCommand], nextCursor: String?, policyVersion: Int) {
        var params: [String: Any] = ["childId": childId, "maxItems": maxItems]
        if let c = cursor { params["sinceCursor"] = c }
        let result = try await functions.httpsCallable("fetchPendingCommands").call(params)
        let data = try cast(result.data)
        let raw = data["commands"] as? [[String: Any]] ?? []
        let commands = raw.compactMap(DeviceCommand.from)
        let nextCursor = data["nextCursor"] as? String
        let policyVersion = data["policyVersion"] as? Int ?? 0
        return (commands, nextCursor, policyVersion)
    }

    func acknowledgeCommand(
        childId: String,
        commandId: String,
        status: String,
        appliedAt: Date,
        errorCode: String? = nil
    ) async throws {
        var params: [String: Any] = [
            "childId": childId,
            "commandId": commandId,
            "status": status,
            "appliedAt": Int(appliedAt.timeIntervalSince1970 * 1000)
        ]
        if let e = errorCode { params["errorCode"] = e }
        _ = try await functions.httpsCallable("acknowledgeCommand").call(params)
    }

    func syncPolicySnapshot(childId: String, knownPolicyVersion: Int = 0) async throws -> [String: Any] {
        let result = try await functions.httpsCallable("syncPolicySnapshot").call([
            "childId": childId,
            "knownPolicyVersion": knownPolicyVersion
        ])
        return try cast(result.data)
    }

    func publishDeviceEvent(
        childId: String,
        eventType: String,
        payload: [String: Any],
        idempotencyKey: String
    ) async throws {
        _ = try await functions.httpsCallable("publishDeviceEvent").call([
            "childId": childId,
            "eventType": eventType,
            "payload": payload,
            "idempotencyKey": idempotencyKey
        ])
    }

    // MARK: - Heartbeat / Tasks

    func recordHeartbeat(childId: String) async throws {
        _ = try await functions.httpsCallable("recordHeartbeat")
            .call(["childImei": childId])
    }

    func getTasks(childId: String) async throws -> [[String: Any]] {
        let result = try await functions.httpsCallable("getTasksForChild")
            .call(["childId": childId])
        let data = try cast(result.data)
        return data["tasks"] as? [[String: Any]] ?? []
    }

    // MARK: - Helpers

    private func cast(_ value: Any?) throws -> [String: Any] {
        guard let d = value as? [String: Any] else {
            throw CloudFunctionsClientError.unexpectedResponseType
        }
        return d
    }

    private func require<T>(_ value: T?, key: String) throws -> T {
        guard let v = value else {
            throw CloudFunctionsClientError.missingField(key)
        }
        return v
    }
}

enum CloudFunctionsClientError: LocalizedError {
    case unexpectedResponseType
    case missingField(String)

    var errorDescription: String? {
        switch self {
        case .unexpectedResponseType: return "Unerwartetes Antwortformat vom Server."
        case .missingField(let key):  return "Pflichtfeld '\(key)' fehlt in der Antwort."
        }
    }
}
