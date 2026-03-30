import Foundation
import FirebaseAuth
import FirebaseFunctions

/// Manages Firebase Authentication for the parent (master) user.
///
/// Flow: `registerMasterDevice` → receives `secretKey`
///       → calls `generateCustomToken(masterImei, secretKey)`
///       → signs in with the returned Firebase custom token.
///
/// The IMEI/secretKey pair is stored in Keychain (via `KeychainHelper`).
/// On cold-start the stored credentials are used to silently refresh the session.
@MainActor
final class AuthService: ObservableObject {

    @Published private(set) var isAuthenticated = false
    @Published private(set) var masterImei: String?
    @Published private(set) var error: Error?

    private let functions = Functions.functions()
    private let keychain = KeychainHelper.shared

    init() {
        // Attempt silent re-login from keychain
        Task { await silentLogin() }

        Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                self?.isAuthenticated = user != nil
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
                  let secretKey = data["secretKey"] as? String else {
                throw AuthError.missingSecretKey
            }

            keychain.save(imei: imei, secretKey: secretKey)
            masterImei = imei
            try await signInWithCustomToken(imei: imei, secretKey: secretKey)
        } catch {
            self.error = error
        }
    }

    /// Signs in with stored credentials (called on app launch).
    func silentLogin() async {
        guard let (imei, secretKey) = keychain.load() else { return }
        do {
            masterImei = imei
            try await signInWithCustomToken(imei: imei, secretKey: secretKey)
        } catch {
            // Credentials stale – user needs to re-login
            self.error = error
        }
    }

    func signOut() {
        try? Auth.auth().signOut()
        isAuthenticated = false
        masterImei = nil
    }

    // MARK: - Private

    private func signInWithCustomToken(imei: String, secretKey: String) async throws {
        let tokenResult = try await functions.httpsCallable("generateCustomToken")
            .call(["masterImei": imei, "secretKey": secretKey])
        guard let data = tokenResult.data as? [String: Any],
              let customToken = data["customToken"] as? String else {
            throw AuthError.tokenGenerationFailed
        }
        try await Auth.auth().signIn(withCustomToken: customToken)
    }
}

// MARK: - Keychain Helper

final class KeychainHelper {
    static let shared = KeychainHelper()
    private let service = "com.minimaster.masterapp"
    private let imeiKey = "masterImei"
    private let secretKeyKey = "secretKey"

    func save(imei: String, secretKey: String) {
        save(value: imei, forKey: imeiKey)
        save(value: secretKey, forKey: secretKeyKey)
    }

    func load() -> (imei: String, secretKey: String)? {
        guard let imei = load(forKey: imeiKey),
              let key = load(forKey: secretKeyKey) else { return nil }
        return (imei, key)
    }

    private func save(value: String, forKey key: String) {
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecValueData:   data
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    private func load(forKey key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass:            kSecClassGenericPassword,
            kSecAttrService:      service,
            kSecAttrAccount:      key,
            kSecReturnData:       true,
            kSecMatchLimit:       kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(decoding: data, as: UTF8.self)
    }
}

enum AuthError: LocalizedError {
    case missingSecretKey
    case tokenGenerationFailed

    var errorDescription: String? {
        switch self {
        case .missingSecretKey:     return "Der Server hat keinen secretKey zurückgegeben."
        case .tokenGenerationFailed: return "Anmeldung fehlgeschlagen. Bitte erneut versuchen."
        }
    }
}
