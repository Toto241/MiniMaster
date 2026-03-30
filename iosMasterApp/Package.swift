// swift-tools-version: 5.10
// MiniMasterParent – iOS Parent App (SwiftUI)
// Requires: Xcode 15+, iOS 17+
// Before opening in Xcode, add the following Firebase SPM packages:
//   https://github.com/firebase/firebase-ios-sdk  (FirebaseFirestore, FirebaseFunctions, FirebaseMessaging, FirebaseAuth)
//   https://github.com/openid/AppAuth-iOS  (for StoreKit2 if needed)
// Then add google-services GoogleService-Info.plist to the app target.

import PackageDescription

let package = Package(
    name: "MiniMasterParent",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "MiniMasterParent", targets: ["MiniMasterParent"])
    ],
    dependencies: [],   // Firebase added as Xcode framework targets (not as SPM deps here)
    targets: [
        .target(
            name: "MiniMasterParent",
            path: "Sources/MiniMasterParent"
        ),
        .testTarget(
            name: "MiniMasterParentTests",
            dependencies: ["MiniMasterParent"],
            path: "Tests/MiniMasterParentTests"
        )
    ]
)
