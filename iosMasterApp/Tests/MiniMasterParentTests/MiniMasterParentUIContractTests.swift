import XCTest

final class MiniMasterParentUIContractTests: XCTestCase {
    func testLoginViewExposesAccessibilityIdentifiers() throws {
        let source = try loadSource(relativePath: "Sources/MiniMasterParent/Views/LoginView.swift")
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"login.imeiField\")"))
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"login.deviceNameField\")"))
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"login.registerButton\")"))
    }

    func testPairingViewExposesAccessibilityIdentifiers() throws {
        let source = try loadSource(relativePath: "Sources/MiniMasterParent/Views/PairingView.swift")
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"pairing.generateCodeButton\")"))
        XCTAssertTrue(source.contains("accessibilityIdentifier(\"pairing.generateLinkButton\")"))
    }

    func testBetaTestingChecklistHasAutomatedUiContractCoverage() throws {
        let doc = try loadDoc(relativePath: "docs/IOS_BETA_TESTING.md")
        XCTAssertTrue(doc.contains("UI contract tests"))
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func loadSource(relativePath: String) throws -> String {
        let fileURL = repoRoot().appendingPathComponent(relativePath)
        return try String(contentsOf: fileURL, encoding: .utf8)
    }

    private func loadDoc(relativePath: String) throws -> String {
        let fileURL = repoRoot().appendingPathComponent(relativePath)
        return try String(contentsOf: fileURL, encoding: .utf8)
    }
}
