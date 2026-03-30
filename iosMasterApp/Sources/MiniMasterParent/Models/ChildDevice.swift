import Foundation

/// Represents a child device paired to this master account.
struct ChildDevice: Identifiable, Codable, Hashable {
    let id: String          // Firestore document ID (childImei)
    var deviceName: String
    var isLocked: Bool
    var appBlacklist: [String]
    var usageRules: UsageRules
    var platform: DevicePlatform
    var capabilities: [String]
    var lastSeen: Date?
    var policyVersion: Int
    var lastPolicyVersion: Int

    // Computed
    var isOnline: Bool {
        guard let lastSeen else { return false }
        return Date().timeIntervalSince(lastSeen) < 300 // 5 minutes
    }
}

struct UsageRules: Codable, Hashable {
    var dailyLimitMinutes: Int?
    var bedtimeStart: String?   // "HH:MM"
    var bedtimeEnd: String?     // "HH:MM"
}

enum DevicePlatform: String, Codable, CaseIterable {
    case android, ios
}
