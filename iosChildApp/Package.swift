// swift-tools-version: 5.10
// MiniMasterChild – iOS Child App
// Requires: Xcode 15+, iOS 17+
//
// Required Entitlements (add via Signing & Capabilities in Xcode):
//   - com.apple.developer.family-controls
//   - com.apple.security.application-groups → group.com.minimaster.childapp
//     (shared between the app and the DeviceActivityMonitor extension)
//
// Required Frameworks (linked in Xcode target):
//   - FamilyControls
//   - ManagedSettings
//   - DeviceActivity
//   - FirebaseStorage (task photo-proof upload)
//
// Xcode-only target membership (cannot be expressed in SwiftPM):
//   - Shared file ../iosSharedServices/PhotoProofService.swift must be added to
//     the app target's "Compile Sources" (task photo-proof upload).
//   - The DeviceActivityMonitor extension under
//     DeviceActivityMonitorExtension/ is a separate App-Extension target;
//     SwiftPM cannot build app extensions. Add it in the Xcode project and
//     compile DeviceActivityMonitorExtension.swift + SharedPolicyDefaults.swift
//     into it.

import PackageDescription

let package = Package(
    name: "MiniMasterChild",
    defaultLocalization: "en",
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
                .product(name: "FirebaseStorage", package: "firebase-ios-sdk"),
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
