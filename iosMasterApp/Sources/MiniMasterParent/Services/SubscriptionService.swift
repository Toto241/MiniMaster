import Foundation
import StoreKit
import FirebaseFunctions

/// Manages App Store subscriptions via StoreKit 2 and syncs purchase tokens
/// with the MiniMaster backend via `verifyPurchase`.
///
/// Product IDs must match the SKUs configured in App Store Connect and the
/// backend `SUBSCRIPTION_PLANS` constant in `src/subscription.ts`.
@MainActor
final class SubscriptionService: ObservableObject {

    // Product IDs — keep in sync with backend SUBSCRIPTION_PLANS
    static let productIds: Set<String> = [
        "minimaster.single_child_monthly",
        "minimaster.single_child_yearly",
        "minimaster.family_monthly",
        "minimaster.family_yearly"
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasedProductId: String?
    @Published private(set) var isLoading = false
    @Published private(set) var error: Error?

    private let functions = Functions.functions()
    private var updateListenerTask: Task<Void, Error>?

    init() {
        // Listen for transactions pushed by the App Store (renewals, refunds, …)
        updateListenerTask = Task.detached { [weak self] in
            for await result in Transaction.updates {
                await self?.handleTransactionResult(result)
            }
        }
        Task { await loadProducts() }
        Task { await refreshStatus() }
    }

    deinit { updateListenerTask?.cancel() }

    // MARK: - Products

    func loadProducts() async {
        isLoading = true
        defer { isLoading = false }
        do {
            products = try await Product.products(for: Self.productIds)
                .sorted { $0.price < $1.price }
        } catch {
            self.error = error
        }
    }

    // MARK: - Purchase

    /// Initiates an in-app purchase and verifies the receipt with the backend.
    func purchase(_ product: Product) async {
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verificationResult):
                await handleTransactionResult(verificationResult)
            case .userCancelled:
                break
            case .pending:
                break // User needs to complete action (Ask to Buy, etc.)
            @unknown default:
                break
            }
        } catch {
            self.error = error
        }
    }

    // MARK: - Restore / Refresh

    func refreshStatus() async {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.revocationDate == nil {
                purchasedProductId = transaction.productID
                return
            }
        }
        purchasedProductId = nil
    }

    // MARK: - Private

    private func handleTransactionResult(_ result: VerificationResult<Transaction>) async {
        guard case .verified(let transaction) = result else { return }

        // Verify server-side
        do {
            _ = try await functions.httpsCallable("verifyPurchase").call([
                "purchaseToken": transaction.originalID.description,
                "sku": transaction.productID
            ])
            purchasedProductId = transaction.productID
        } catch {
            self.error = error
        }

        await transaction.finish()
    }
}
