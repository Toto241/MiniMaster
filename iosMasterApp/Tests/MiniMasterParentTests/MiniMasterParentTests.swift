import XCTest
@testable import MiniMasterParent

final class MiniMasterParentTests: XCTestCase {
    func testAndroidSupportsBundleIdBlacklistEditing() throws {
        XCTAssertTrue(DevicePlatform.android.supportsBundleIdBlacklistEditing)
        XCTAssertNil(DevicePlatform.android.appBlacklistUnsupportedMessage)
    }

    func testIosDisablesBundleIdBlacklistEditing() throws {
        XCTAssertFalse(DevicePlatform.ios.supportsBundleIdBlacklistEditing)
        XCTAssertNotNil(DevicePlatform.ios.appBlacklistUnsupportedMessage)
    }
}
