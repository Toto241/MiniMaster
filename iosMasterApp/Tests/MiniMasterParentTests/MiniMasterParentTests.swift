import XCTest
@testable import MiniMasterParent

final class MiniMasterParentTests: XCTestCase {
    func testAndroidSupportsBundleIdBlacklistEditing() throws {
        XCTAssertTrue(DevicePlatform.android.supportsBundleIdBlacklistEditing)
        XCTAssertFalse(DevicePlatform.android.supportsScreenTimeTokenSelection)
    }

    func testIosUsesScreenTimeTokenSelection() throws {
        XCTAssertFalse(DevicePlatform.ios.supportsBundleIdBlacklistEditing)
        XCTAssertTrue(DevicePlatform.ios.supportsScreenTimeTokenSelection)
    }

    func testTokenPrefixDetection() throws {
        let values = ["ios-app-token:abc", "com.example.legacy"]
        XCTAssertEqual(ScreenTimeAppSelection.encodedTokenCount(in: values), 1)
        XCTAssertEqual(ScreenTimeAppSelection.bundleIDs(from: values), ["com.example.legacy"])
    }
}
