import Foundation
import FirebaseAuth
import FirebaseFunctions

/// Manages Firebase Authentication for the parent (master) user.
///
/// Flow: `registerMasterDevice(imei, deviceName?)` → receives
/// `{ masterId, customToken }` → signs in with the returned Firebase custom token.
/// Subsequent cold-starts reuse FirebaseAuth session persistence instead of
/// storing a legacy `secretKey` locally.
@MainActor
final class AuthService: ObservableObject {

    @Published private(set) var isAuthenticated = false
    @Published private(set) var masterImei: String?
    @Published private(set) var error: Error?

    private let functions = Functions.functions()

    init() {
        syncFromCurrentUser()

        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.syncFromCurrentUser(user)
            }
        }
    }

    // MARK: - Registration & Login

    /// Registers a new master device and signs in immediately.
    func registerAndLogin(imei: String, deviceName: String? = nil) async {
        do {
            let params: [String: Any] = {
                var p: [String: Any] = ["imei": imei]
                if let name = deviceName { p["deviceName"] = name }
                return p
            }()
            let result = try await functions.httpsCallable("registerMasterDevice").call(params)
            guard let data = result.data as? [String: Any],
                  let customToken = data["customToken"] as? String else {
                throw AuthError.missingCustomToken
            }

            let resolvedMasterId = (data["masterId"] as? String) ?? imei
            masterImei = resolvedMasterId
            try await signInWithCustomToken(customToken)
            syncFromCurrentUser(fallbackMasterId: resolvedMasterId)
            self.error = nil
        } catch {
            self.error = error
        }
    }

    /// Restores local auth state from FirebaseAuth session persistence.
    func silentLogin() async {
        syncFromCurrentUser()
    }

    func signOut() {
        try? Auth.auth().signOut()
        syncFromCurrentUser()
    }

    // MARK: - Private

    private func signInWithCustomToken(_ customToken: String) async throws {
        try await Auth.auth().signIn(withCustomToken: customToken)
    }

    private func syncFromCurrentUser(_ user: User? = Auth.auth().currentUser, fallbackMasterId: String? = nil) {
        let resolvedMasterId = user?.uid ?? fallbackMasterId
        isAuthenticated = resolvedMasterId != nil
        masterImei = resolvedMasterId
    }
}

enum AuthError: LocalizedError {
    case missingCustomToken

    var errorDescription: String? {
        switch self {
        case .missingCustomToken:
            return "Der Server hat keinen Firebase Custom Token zurückgegeben."
        }
    }
}
