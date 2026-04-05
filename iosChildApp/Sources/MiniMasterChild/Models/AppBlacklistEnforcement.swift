import Foundation

enum AppBlacklistEnforcement {
    static let iosUnsupportedMessage = "Die konfigurierte App-Blacklist kann auf iOS derzeit nicht durchgesetzt werden, weil Bundle-IDs ohne Screen-Time-Auswahltokens nicht in ApplicationToken aufloesbar sind."
    static let iosPartialSupportMessage = "Ein Teil der App-Blacklist wird ueber Screen-Time-Tokens durchgesetzt. Manuelle Bundle-IDs bleiben auf iOS wirkungslos und sollten migriert werden."

    static func notice(for bundleIds: [String]) -> String? {
        bundleIds.isEmpty ? nil : iosUnsupportedMessage
    }

    static func partialNotice(forResidualBundleIDs bundleIds: [String]) -> String? {
        bundleIds.isEmpty ? nil : iosPartialSupportMessage
    }
}
