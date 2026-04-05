import Foundation

#if canImport(FamilyControls)
import FamilyControls
#endif

enum ScreenTimeAppSelection {
    static let tokenPrefix = "ios-app-token:"

    static func bundleIDs(from storedValues: [String]) -> [String] {
        storedValues.filter { !$0.hasPrefix(tokenPrefix) }
    }

    static func encodedTokenCount(in storedValues: [String]) -> Int {
        storedValues.filter { $0.hasPrefix(tokenPrefix) }.count
    }

    static func hasEncodedTokens(in storedValues: [String]) -> Bool {
        encodedTokenCount(in: storedValues) > 0
    }

#if canImport(FamilyControls)
    static func encode(_ selection: FamilyActivitySelection) -> [String] {
        selection.applicationTokens.compactMap(encodeToken)
    }

    static func decodeSelection(from storedValues: [String]) -> FamilyActivitySelection {
        var selection = FamilyActivitySelection()
        selection.applicationTokens = Set(decodeTokens(from: storedValues))
        return selection
    }

    static func decodeTokens(from storedValues: [String]) -> [ApplicationToken] {
        storedValues.compactMap(decodeToken)
    }

    private static func encodeToken(_ token: ApplicationToken) -> String? {
        guard let data = try? JSONEncoder().encode(token) else { return nil }
        return tokenPrefix + data.base64EncodedString()
    }

    private static func decodeToken(_ storedValue: String) -> ApplicationToken? {
        guard storedValue.hasPrefix(tokenPrefix) else { return nil }
        let encoded = String(storedValue.dropFirst(tokenPrefix.count))
        guard let data = Data(base64Encoded: encoded) else { return nil }
        return try? JSONDecoder().decode(ApplicationToken.self, from: data)
    }
#endif
}
