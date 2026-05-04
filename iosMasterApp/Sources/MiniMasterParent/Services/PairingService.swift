import Foundation
import FirebaseFunctions
import FirebaseFirestore

/// Orchestrates the pairing lifecycle for the parent app.
/// Wraps Cloud Functions and caches transient pairing state locally.
@MainActor
final class PairingService: ObservableObject {

    @Published private(set) var lastPairingCode: String?
    @Published private(set) var lastPairingLink: String?
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?

    private let client = CloudFunctionsClient()
    private let db = Firestore.firestore()
    private var pairingListener: ListenerRegistration?

    // MARK: - Public API

    /// Generates a 6-digit pairing code valid for 24 hours.
    func generatePairingCode() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let code = try await client.createPairingCode()
            lastPairingCode = code
            lastPairingLink = nil
            await listenForPairingCompletion(code: code)
        } catch {
            self.error = error
        }
    }

    /// Generates a short-lived (5 min) pairing link.
    func generatePairingLink() async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let link = try await client.generatePairingLink()
            lastPairingLink = link
            lastPairingCode = nil
        } catch {
            self.error = error
        }
    }

    /// Clears any transient pairing state (e.g. after success or cancellation).
    func reset() {
        lastPairingCode = nil
        lastPairingLink = nil
        error = nil
        pairingListener?.remove()
        pairingListener = nil
    }

    // MARK: - Pairing Completion Detection

    /// Listens for the pairing code document to disappear (indicating
    /// redemption by the child device) and then waits for the child doc
    /// to appear under the current master.
    private func listenForPairingCompletion(code: String) async {
        let codeRef = db.collection("pairingCodes").document(code)

        pairingListener = codeRef.addSnapshotListener { [weak self] snapshot, error in
            guard let self else { return }

            if let error {
                Task { @MainActor in self.error = error }
                return
            }

            // Document deleted → child redeemed the code
            guard let snapshot, !snapshot.exists else { return }

            Task { @MainActor in
                self.lastPairingCode = nil
                self.pairingListener?.remove()
                self.pairingListener = nil
                // Consumer (e.g. DashboardViewModel) should observe children
                // via its own Firestore listener and will pick up the new child.
            }
        }
    }

    deinit {
        pairingListener?.remove()
    }
}

// MARK: - Errors

enum PairingServiceError: LocalizedError {
    case alreadyInProgress

    var errorDescription: String? {
        switch self {
        case .alreadyInProgress:
            return "Es läuft bereits ein Pairing-Vorgang."
        }
    }
}
