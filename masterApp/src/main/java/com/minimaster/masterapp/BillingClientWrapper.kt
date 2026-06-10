package com.minimaster.masterapp

import android.app.Activity
import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import com.android.billingclient.api.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * A wrapper class for the Google Play Billing Client to simplify its usage.
 *
 * This singleton class handles the connection to the billing service, querying for products,
 * and launching the purchase flow. It exposes product details and purchase status via StateFlows.
 *
 * @param context The application context, injected by Hilt.
 */
@Singleton
class BillingClientWrapper @Inject constructor(
    @ApplicationContext
    context: Context
) {
    private val billingScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _productDetails = MutableStateFlow<List<ProductDetails>>(emptyList())
    /** A [StateFlow] that emits the list of available product details (subscriptions). */
    val productDetails = _productDetails.asStateFlow()

    private val _purchaseStatus = MutableStateFlow<Purchase?>(null)
    /** A [StateFlow] that emits the most recent purchase for processing. */
    val purchaseStatus = _purchaseStatus.asStateFlow()

    /**
     * Listener for purchase updates from the BillingClient.
     * It gets called when a purchase is completed or fails.
     */
    private val purchasesUpdatedListener = PurchasesUpdatedListener { billingResult, purchases ->
        if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            purchases.forEach(::handlePurchasedSubscription)
        } else {
            Log.e("BillingClient", "Purchase error: ${billingResult.debugMessage}")
        }
    }

    /** The instance of the [BillingClient]. */
    private var billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(purchasesUpdatedListener)
        .enableAutoServiceReconnection()
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build()

    /**
     * Starts the connection to the Google Play Billing service.
     * If the connection is successful, it queries for available products.
     */
    fun startConnection() {
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    Log.d("BillingClient", "Billing client setup finished.")
                    queryProducts()
                    queryActiveSubscriptions()
                }
            }
            override fun onBillingServiceDisconnected() {
                Log.w("BillingClient", "Billing service disconnected. Should implement retry logic.")
            }
        })
    }

    /**
     * Queries for the details of the subscription products defined in the Google Play Console.
     * The product IDs are hardcoded here for simplicity.
     */
    companion object {
        /** v2 monetisation product IDs matching the backend (VALID_PRODUCT_IDS).
         *  Updated April 2026: Added FAMILY_YEARLY_PREMIUM tier (99.99 EUR/year).
         */
        const val SINGLE_CHILD_MONTHLY = "single_child_monthly"     // €4.99/month – 1 child
        const val FAMILY_MONTHLY       = "family_monthly"            // €9.99/month – 4 children
        const val SINGLE_CHILD_YEARLY  = "single_child_yearly"       // €39.99/year – 1 child
        const val FAMILY_YEARLY        = "family_yearly"             // €79.99/year – 4 children
        const val FAMILY_YEARLY_PREMIUM = "family_yearly_premium"   // €99.99/year – 6 children, beta access
    }

    private fun queryProducts() {
        val productList = listOf(
            SINGLE_CHILD_MONTHLY, FAMILY_MONTHLY,
            SINGLE_CHILD_YEARLY, FAMILY_YEARLY, FAMILY_YEARLY_PREMIUM
        ).map { id ->
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        }
        val params = QueryProductDetailsParams.newBuilder().setProductList(productList)

        billingScope.launch {
            val result = billingClient.queryProductDetails(params.build())
            if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                _productDetails.value = result.productDetailsList.orEmpty()
            } else {
                Log.e("BillingClient", "Error querying products: ${result.billingResult.debugMessage}")
            }
        }
    }

    private fun handlePurchasedSubscription(purchase: Purchase) {
        if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
            _purchaseStatus.value = purchase
        }
    }

    private fun queryActiveSubscriptions() {
        val params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build()

        billingScope.launch {
            val result = billingClient.queryPurchasesAsync(params)
            if (result.billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                result.purchasesList.forEach(::handlePurchasedSubscription)
            } else {
                Log.e("BillingClient", "Error querying active subscriptions: ${result.billingResult.debugMessage}")
            }
        }
    }

    fun acknowledgePurchase(purchase: Purchase) {
        if (purchase.isAcknowledged) {
            return
        }

        val params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchase.purchaseToken)
            .build()

        billingScope.launch {
            val result = billingClient.acknowledgePurchase(params)
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                Log.d("BillingClient", "Purchase acknowledged.")
            } else {
                Log.e("BillingClient", "Purchase acknowledgement failed: ${result.debugMessage}")
            }
        }
    }

    /**
     * Launches the Google Play Billing purchase flow for a specific product.
     * @param activity The current [Activity] needed to launch the flow.
     * @param productDetails The [ProductDetails] of the item to purchase.
     */
    fun launchPurchaseFlow(activity: Activity, productDetails: ProductDetails) {
        val offerToken = productDetails.subscriptionOfferDetails?.firstOrNull()?.offerToken
        if (offerToken == null) {
            Log.e("BillingClient", "No offer token found for ${productDetails.productId}")
            return
        }

        val productDetailsParamsList = listOf(
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .setOfferToken(offerToken)
                .build()
        )
        val billingFlowParams = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(productDetailsParamsList)
            .build()

        billingClient.launchBillingFlow(activity, billingFlowParams)
    }
}
