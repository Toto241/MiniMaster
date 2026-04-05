import Foundation

#if canImport(FamilyControls)
import FamilyControls
#endif

enum ScreenTimeAppBlacklistCodec {
    static let tokenPrefix = "ios-app-token:"

    static func legacyBundleIDs(from storedValues: [String]) -> [String] {
        storedValues.filter { !$0.hasPrefix(tokenPrefix) }
    }

#if canImport(FamilyControls)
    static func decodeTokens(from storedValues: [String]) -> [ApplicationToken] {
        storedValues.compactMap(decodeToken)
    }

    private static func decodeToken(_ storedValue: String) -> ApplicationToken? {
        guard storedValue.hasPrefix(tokenPrefix) else { return nil }
        let encoded = String(storedValue.dropFirst(tokenPrefix.count))
        guard let data = Data(base64Encoded: encoded) else { return nil }
        return try? JSONDecoder().decode(ApplicationToken.self, from: data)
    }
#else
    static func decodeTokens(from storedValues: [String]) -> [Never] {
        []
    }
#endif
}
