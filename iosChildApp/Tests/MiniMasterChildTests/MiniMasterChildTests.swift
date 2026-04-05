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
}
