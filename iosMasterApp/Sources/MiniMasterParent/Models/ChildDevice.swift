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
    var supportedProtocols: [String]
    var appVersion: String?
    var buildNumber: String?
    var releaseChannel: String
    var componentInterfaceVersion: Int
    var lastSeen: Date?
    var policyVersion: Int
    var lastPolicyVersion: Int

    // Computed
    var isOnline: Bool {
        guard let lastSeen else { return false }
        return Date().timeIntervalSince(lastSeen) < 300 // 5 minutes
    }

    var versionSummary: String {
        let version = appVersion ?? "unknown"
        guard let buildNumber, !buildNumber.isEmpty else { return version }
        return "\(version)+\(buildNumber)"
    }
}

struct UsageRules: Codable, Hashable {
    var dailyLimitMinutes: Int?
    var bedtimeStart: String?   // "HH:MM"
    var bedtimeEnd: String?     // "HH:MM"
}

enum DevicePlatform: String, Codable, CaseIterable {
    case android, ios

    var supportsBundleIdBlacklistEditing: Bool {
        self == .android
    }

    var supportsScreenTimeTokenSelection: Bool {
        self == .ios
    }

    var appBlacklistEditorHint: String {
        switch self {
        case .android:
            return "Android verwendet Paketnamen bzw. Bundle-IDs fuer die App-Blacklist."
        case .ios:
            return "iOS verwendet Screen-Time-Tokens aus der System-Auswahl statt manueller Bundle-IDs."
        }
    }
}
