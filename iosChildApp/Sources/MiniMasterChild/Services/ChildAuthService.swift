import Foundation
import FirebaseAuth
import FamilyControls

enum ChildAuthError: LocalizedError {
    case pairingFailed(String)
    case customTokenSignInFailed(Error)
    case familyControlsNotAuthorized
    case notPaired

    var errorDescription: String? {
        switch self {
        case .pairingFailed(let msg): return "Pairing fehlgeschlagen: \(msg)"
        case .customTokenSignInFailed(let e): return "Anmeldung fehlgeschlagen: \(e.localizedDescription)"
        case .familyControlsNotAuthorized: return "Bildschirmzeit-Berechtigung nicht erteilt."
        case .notPaired: return "Gerät ist nicht gepairt."
        }
    }
}

/// Handles child-device authentication and Screen Time (FamilyControls) authorization.
///
/// - Pairs the device with the parent using a 6-digit code or deep-link token.
/// - On successful pairing persists `childId` and signs in via Firebase Custom Token.
/// - Requests `FamilyControls` authorization for the `.individual` audience.
@MainActor
final class ChildAuthService: ObservableObject {

    @Published private(set) var isPaired: Bool = false
    @Published private(set) var childId: String?
    @Published private(set) var isSignedInToFirebase: Bool = false
    @Published private(set) var error: Error?

    private let client: ChildCloudFunctionsClient
    private let syncService: CommandSyncService

    // UserDefaults keys
    private enum Keys {
        static let childId = "minimaster.child.childId"
        static let deviceImei = "minimaster.child.deviceImei"
    }

    init(client: ChildCloudFunctionsClient, syncService: CommandSyncService) {
        self.client = client
        self.syncService = syncService
        restorePersistedState()
    }

    var currentChildId: String? { childId }

    // MARK: - Pairing

    /// Use a 6-digit code shown in the parent app.
    func pairWithCode(_ code: String) async {
        do {
            try await ensureAnonymousAuth()
            let result = try await client.pairAuthenticatedChild(pairingCode: code)
            try await completePairing(childId: result.childId)
        } catch {
            self.error = ChildAuthError.pairingFailed(error.localizedDescription)
        }
    }

    /// Use a deep-link token (e.g. from a QR code URL).
    func pairWithToken(_ token: String) async {
        do {
            try await ensureAnonymousAuth()
            let result = try await client.pairAuthenticatedChild(pairingToken: token)
            try await completePairing(childId: result.childId)
        } catch {
            self.error = ChildAuthError.pairingFailed(error.localizedDescription)
        }
    }

    // MARK: - FamilyControls

    func requestFamilyControlsAuthorization() async {
        do {
            try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        } catch {
            self.error = ChildAuthError.familyControlsNotAuthorized
        }
    }

    // MARK: - Sign Out / Unpair

    func unpair() {
        do {
            try Auth.auth().signOut()
        } catch {}
        isPaired = false
        childId = nil
        isSignedInToFirebase = false
        UserDefaults.standard.removeObject(forKey: Keys.childId)
        UserDefaults.standard.removeObject(forKey: Keys.deviceImei)
    }

    // MARK: - Private

    private func ensureAnonymousAuth() async throws {
        guard Auth.auth().currentUser == nil else { return }
        do {
            let result = try await Auth.auth().signInAnonymously()
            isSignedInToFirebase = true
            print("Child app signed in anonymously: \(result.user.uid)")
        } catch {
            throw ChildAuthError.customTokenSignInFailed(error)
        }
    }

    private func completePairing(childId: String) async throws {
        persist(childId: childId)
        syncService.configure(childId: childId)
        isPaired = true
        isSignedInToFirebase = Auth.auth().currentUser != nil
        // Register endpoint now that we have a resolved childId
        await syncService.registerEndpoint()
    }

    private func persist(childId: String) {
        self.childId = childId
        UserDefaults.standard.set(childId, forKey: Keys.childId)
    }

    private func restorePersistedState() {
        if let stored = UserDefaults.standard.string(forKey: Keys.childId) {
            childId = stored
            isPaired = true
            syncService.configure(childId: stored)
            isSignedInToFirebase = Auth.auth().currentUser != nil
        }
    }
}
