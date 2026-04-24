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

import PackageDescription

let package = Package(
    name: "MiniMasterChild",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "MiniMasterChild", targets: ["MiniMasterChild"])
    ],
    dependencies: [
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0")
    ],
    targets: [
        .target(
            name: "MiniMasterChild",
            dependencies: [
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFunctions", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk"),
            ],
            path: "Sources/MiniMasterChild",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "MiniMasterChildTests",
            dependencies: ["MiniMasterChild"],
            path: "Tests/MiniMasterChildTests"
        )
    ]
)
