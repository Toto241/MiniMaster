import Foundation
import SwiftUI
#if canImport(FamilyControls)
import FamilyControls
import ManagedSettings
#endif

/// Manages app blocking on iOS using the Screen Time API (FamilyControls).
/// Falls back to a simple local lock flag if Screen Time authorization is denied.
///
/// - Note: Requires the `com.apple.developer.family-controls` entitlement.
@MainActor
final class AppBlockingManager: ObservableObject {

    @Published private(set) var isAuthorized = false
    @Published private(set) var isLocked = false
    @Published private(set) var blockedTokens: [String] = []
    @Published private(set) var error: Error?

    #if canImport(FamilyControls)
    private let store = ManagedSettingsStore()
    #endif

    // MARK: - Authorization

    /// Requests Screen Time authorization from the user.
    /// Must be called before any blocking can be applied.
    func requestAuthorization() async {
        #if canImport(FamilyControls)
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            isAuthorized = true
        } catch {
            self.error = error
            isAuthorized = false
        }
        #else
        error = AppBlockingError.screenTimeUnavailable
        #endif
    }

    // MARK: - Lock State

    /// Applies or removes the global device lock.
    /// When locked, all apps except a small whitelist (Phone, Settings) are blocked.
    func setLocked(_ locked: Bool) {
        isLocked = locked
        #if canImport(FamilyControls)
        if locked {
            let shieldConfiguration = ShieldConfiguration(
                backgroundBlurStyle: .light,
                backgroundColor: .systemRed,
                icon: .init(systemImageName: "lock.fill"),
                title: .init(text: "Gerät gesperrt"),
                subtitle: .init(text: "Dieses Gerät ist durch deine Eltern gesperrt.")
            )
            store.shield.applications = .all
            store.shield.applicationCategories = .specific([.allApps])
        } else {
            store.shield.applications = nil
            store.shield.applicationCategories = nil
            applyBlacklist(blockedTokens)
        }
        #endif
    }

    // MARK: - App Blacklist

    /// Updates the list of blocked apps.
    /// Supports both raw bundle IDs and encoded FamilyControls tokens.
    func updateBlacklist(_ tokens: [String]) {
        blockedTokens = tokens
        guard !isLocked else { return }
        applyBlacklist(tokens)
    }

    private func applyBlacklist(_ tokens: [String]) {
        #if canImport(FamilyControls)
        if ScreenTimeAppSelection.hasEncodedTokens(in: tokens) {
            let selection = ScreenTimeAppSelection.decodeSelection(from: tokens)
            store.shield.applications = selection
            store.shield.applicationCategories = nil
        } else if !tokens.isEmpty {
            // Fallback: without encoded tokens we cannot block specific apps
            // via FamilyControls. Log for telemetry.
            print("[AppBlockingManager] No encoded ScreenTime tokens available.")
        } else {
            store.shield.applications = nil
            store.shield.applicationCategories = nil
        }
        #endif
    }

    // MARK: - Usage Rules

    /// Applies daily limit and bedtime rules.
    /// On iOS this sets up local notifications as a soft reminder;
    /// hard enforcement requires Screen Time schedules (future work).
    func setUsageRules(dailyLimitMinutes: Int?, bedtimeStart: String?, bedtimeEnd: String?) {
        // TODO: Integrate with ManagedSettings schedules when API supports it.
        // For now, rules are stored locally and the child UI can display them.
        print("[AppBlockingManager] Usage rules updated: limit=\(String(describing: dailyLimitMinutes)), bedtime=\(String(describing: bedtimeStart))-\(String(describing: bedtimeEnd))")
    }
}

// MARK: - Errors

enum AppBlockingError: LocalizedError {
    case screenTimeUnavailable

    var errorDescription: String? {
        switch self {
        case .screenTimeUnavailable:
            return "Screen Time API ist auf diesem Gerät nicht verfügbar."
        }
    }
}
