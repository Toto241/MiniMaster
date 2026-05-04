import SwiftUI
import StoreKit

/// Subscription management screen — shows current plan and available upgrades.
struct SubscriptionView: View {
    @EnvironmentObject var subscriptionService: SubscriptionService

    var body: some View {
        NavigationStack {
            Group {
                if subscriptionService.isLoading {
                    ProgressView("subscription.loading")
                } else {
                    List {
                        currentStatusSection
                        if subscriptionService.purchasedProductId == nil {
                            availableProductsSection
                        }
                    }
                }
            }
            .navigationTitle("subscription.navTitle")
            .refreshable { await subscriptionService.refreshStatus() }
        }
    }

    private var currentStatusSection: some View {
        Section(header: Text("subscription.section.status")) {
            if let productId = subscriptionService.purchasedProductId {
                Label(String(format: NSLocalizedString("subscription.status.active", comment: ""), displayName(for: productId)), systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
            } else {
                Label("subscription.status.none", systemImage: "xmark.seal")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var availableProductsSection: some View {
        Section(header: Text("subscription.section.plans")) {
            ForEach(subscriptionService.products) { product in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(product.displayName).font(.headline)
                        Text(product.description).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button(product.displayPrice) {
                        Task { await subscriptionService.purchase(product) }
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding(.vertical, 4)
            }
        }
    }

    private func displayName(for productId: String) -> String {
        subscriptionService.products.first { $0.id == productId }?.displayName ?? productId
    }
}
