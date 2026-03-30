// swift-tools-version: 5.10
// MiniMasterChild – iOS Child App
// Requires: Xcode 15+, iOS 17+
//
// Required Entitlements (add via Signing & Capabilities in Xcode):
//   - com.apple.developer.family-controls
//
// Required Frameworks (linked in Xcode target):
//   - FamilyControls
//   - ManagedSettings
//   - DeviceActivity
//
// Firebase SPM:
//   https://github.com/firebase/firebase-ios-sdk
//   Products: FirebaseAuth, FirebaseFunctions, FirebaseMessaging

import PackageDescription

let package = Package(
    name: "MiniMasterChild",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MiniMasterChild", targets: ["MiniMasterChild"])
    ],
    dependencies: [],
    targets: [
        .target(
            name: "MiniMasterChild",
            path: "Sources/MiniMasterChild"
        ),
        .testTarget(
            name: "MiniMasterChildTests",
            dependencies: ["MiniMasterChild"],
            path: "Tests/MiniMasterChildTests"
        )
    ]
)
