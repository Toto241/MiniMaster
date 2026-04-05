import Foundation

enum AppBlacklistEnforcement {
    static let iosUnsupportedMessage = "Die konfigurierte App-Blacklist kann auf iOS derzeit nicht durchgesetzt werden, weil Bundle-IDs ohne Screen-Time-Auswahltokens nicht in ApplicationToken aufloesbar sind."

    static func notice(for bundleIds: [String]) -> String? {
        bundleIds.isEmpty ? nil : iosUnsupportedMessage
    }
}
