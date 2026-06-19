import XCTest
@testable import MiniMasterChild

final class MiniMasterChildTests: XCTestCase {
    func testAppBlacklistNoticeIsNilForEmptyList() throws {
        XCTAssertNil(AppBlacklistEnforcement.notice(for: []))
    }

    func testAppBlacklistNoticeIsShownForConfiguredList() throws {
        let notice = AppBlacklistEnforcement.notice(for: ["com.example.blocked"])
        XCTAssertEqual(notice, AppBlacklistEnforcement.iosUnsupportedMessage)
    }

    func testPartialNoticeIsShownForResidualBundleIds() throws {
        let notice = AppBlacklistEnforcement.partialNotice(forResidualBundleIDs: ["com.example.legacy"])
        XCTAssertEqual(notice, AppBlacklistEnforcement.iosPartialSupportMessage)
    }

    func testMainChildViewContainsFamilyControlsRecoveryAndSafeUnpairHooks() throws {
        let source = try loadSource(relativePath: "Sources/MiniMasterChild/Views/MainChildView.swift")
        XCTAssertTrue(source.contains("familyControlsSection"))
        XCTAssertTrue(source.contains("blockingManager.requestAuthorization"))
        XCTAssertTrue(source.contains("policyStore.reset()"))
        XCTAssertTrue(source.contains("blockingManager.clearPolicy()"))
    }

    func testCommandSyncContainsForegroundHeartbeatHook() throws {
        let source = try loadSource(relativePath: "Sources/MiniMasterChild/Services/CommandSyncService.swift")
        XCTAssertTrue(source.contains("startForegroundHeartbeat"))
        XCTAssertTrue(source.contains("reportHeartbeat(childId:"))
        XCTAssertTrue(source.contains("clearConfiguration()"))
    }

    func testAppBlockingManagerCanClearLocalScreenTimePolicy() throws {
        let source = try loadSource(relativePath: "Sources/MiniMasterChild/Services/AppBlockingManager.swift")
        XCTAssertTrue(source.contains("func clearPolicy()"))
        XCTAssertTrue(source.contains("store.shield.applicationCategories = nil"))
        XCTAssertTrue(source.contains("store.shield.applications = nil"))
    }

    private func packageRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func loadSource(relativePath: String) throws -> String {
        let fileURL = packageRoot().appendingPathComponent(relativePath)
        return try String(contentsOf: fileURL, encoding: .utf8)
    }
}
