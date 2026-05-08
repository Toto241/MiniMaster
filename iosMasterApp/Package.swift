// swift-tools-version: 5.10
// MiniMasterParent – iOS Parent App (SwiftUI)
// Requires: Xcode 15+, iOS 17+
// Add google-services GoogleService-Info.plist to the app target in Xcode.

import PackageDescription

let package = Package(
    name: "MiniMasterParent",
    defaultLocalization: "en",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "MiniMasterParent", targets: ["MiniMasterParent"])
    ],
    dependencies: [
        .package(url: "https://github.com/firebase/firebase-ios-sdk.git", from: "11.0.0")
    ],
    targets: [
        .target(
            name: "MiniMasterParent",
            dependencies: [
                .product(name: "FirebaseAuth", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFirestore", package: "firebase-ios-sdk"),
                .product(name: "FirebaseFunctions", package: "firebase-ios-sdk"),
                .product(name: "FirebaseMessaging", package: "firebase-ios-sdk"),
            ],
            path: "Sources/MiniMasterParent",
            resources: [
                .process("Resources")
            ]
        ),
        .testTarget(
            name: "MiniMasterParentTests",
            dependencies: ["MiniMasterParent"],
            path: "Tests/MiniMasterParentTests"
        )
    ]
)
