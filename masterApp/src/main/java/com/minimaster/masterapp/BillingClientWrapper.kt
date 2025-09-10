package com.minimaster.masterapp

import android.app.Activity
import android.content.Context
import android.util.Log
import com.android.billingclient.api.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
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
    context: Context
) {
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
            for (purchase in purchases) {
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    _purchaseStatus.value = purchase
                }
            }
        } else {
            Log.e("BillingClient", "Purchase error: ${billingResult.debugMessage}")
        }
    }

    /** The instance of the [BillingClient]. */
    private var billingClient: BillingClient = BillingClient.newBuilder(context)
        .setListener(purchasesUpdatedListener)
        .enablePendingPurchases()
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
    private fun queryProducts() {
        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("monthly_subscription_placeholder")
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId("yearly_subscription_placeholder")
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        )
        val params = QueryProductDetailsParams.newBuilder().setProductList(productList)

        billingClient.queryProductDetails(params.build()) { billingResult, productDetailsList ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                _productDetails.value = productDetailsList
            } else {
                Log.e("BillingClient", "Error querying products: ${billingResult.debugMessage}")
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
