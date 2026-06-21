import Foundation
import FirebaseAuth
import FirebaseFunctions

/// Manages Firebase Authentication for the parent (master) user.
///
/// Flow: sign in anonymously → call `registerAuthenticatedMaster(deviceId, deviceName?)`
/// → receive `{ masterId }`. Subsequent cold-starts reuse FirebaseAuth session
/// persistence instead of storing a legacy `secretKey` locally.
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

    /// Registers a new master device using the modern authenticated flow.
    /// Ensures Firebase anonymous auth first, then calls `registerAuthenticatedMaster`.
    func registerAndLogin(imei: String, deviceName: String? = nil) async {
        do {
            // Modern flow: anonymous auth first
            if Auth.auth().currentUser == nil {
                let authResult = try await Auth.auth().signInAnonymously()
                print("Master app signed in anonymously: \(authResult.user.uid)")
            }

            let params: [String: Any] = {
                var p: [String: Any] = ["deviceId": imei]
                if let name = deviceName { p["deviceName"] = name }
                return p
            }()
            let result = try await functions.httpsCallable("registerAuthenticatedMaster").call(params)
            guard let data = result.data as? [String: Any],
                  let masterId = data["masterId"] as? String else {
                throw AuthError.missingMasterId
            }

            masterImei = masterId
            syncFromCurrentUser(fallbackMasterId: masterId)
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

    private func syncFromCurrentUser(_ user: User? = Auth.auth().currentUser, fallbackMasterId: String? = nil) {
        let resolvedMasterId = user?.uid ?? fallbackMasterId
        isAuthenticated = resolvedMasterId != nil
        masterImei = resolvedMasterId
    }
}

enum AuthError: LocalizedError {
    case missingMasterId

    var errorDescription: String? {
        switch self {
        case .missingMasterId:
            return "Der Server hat keine Master-ID zurückgegeben."
        }
    }
}
