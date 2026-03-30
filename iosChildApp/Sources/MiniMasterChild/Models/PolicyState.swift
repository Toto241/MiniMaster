import Foundation

/// The canonical local representation of the parental-control policy enforced on this device.
///
/// Persisted via `PolicyStore` to UserDefaults so the policy survives
/// app restarts and periods without a network connection.
struct PolicyState: Codable, Equatable {
    var isLocked: Bool = false
    var appBlacklist: [String] = []
    var usageRules: UsageRulesState = .init()
    var policyVersion: Int = 0

    struct UsageRulesState: Codable, Equatable {
        var dailyLimitMinutes: Int?
        var bedtimeStart: String?
        var bedtimeEnd: String?
    }
}

/// A locally cached command waiting to be applied.
struct DeviceCommand: Identifiable, Codable {
    let id: String           // = commandId
    let type: CommandType
    let payload: [String: AnyCodable]
    let policyVersion: Int
    let expiresAtMs: Double  // Unix ms from Firestore Timestamp

    var isExpired: Bool {
        Date().timeIntervalSince1970 * 1000 > expiresAtMs
    }

    enum CommandType: String, Codable {
        case policyUpdate  = "policy_update"
        case lockState     = "lock_state"
        case appBlacklist  = "app_blacklist"
        case usageRules    = "usage_rules"
        case screenTime    = "screen_time"
    }

    /// Parses raw [String:Any] dict from CloudFunctionsClient.
    static func from(_ raw: [String: Any]) -> DeviceCommand? {
        guard let id = raw["commandId"] as? String,
              let typeRaw = raw["type"] as? String,
              let type = CommandType(rawValue: typeRaw),
              let policyVersion = raw["policyVersion"] as? Int,
              let payload = raw["payload"] as? [String: Any] else { return nil }
        let expiresAtSec = (raw["expiresAt"] as? [String: Any])?["seconds"] as? Double ?? 0
        return DeviceCommand(
            id: id,
            type: type,
            payload: payload.mapValues { AnyCodable($0) },
            policyVersion: policyVersion,
            expiresAtMs: expiresAtSec * 1000
        )
    }
}

/// Type-erased `Codable` wrapper so `[String: Any]` values can be stored.
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let i = try? container.decode(Int.self)    { value = i; return }
        if let d = try? container.decode(Double.self) { value = d; return }
        if let b = try? container.decode(Bool.self)   { value = b; return }
        if let s = try? container.decode(String.self) { value = s; return }
        value = NSNull()
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let i as Int:    try container.encode(i)
        case let d as Double: try container.encode(d)
        case let b as Bool:   try container.encode(b)
        case let s as String: try container.encode(s)
        default:              try container.encodeNil()
        }
    }
}
