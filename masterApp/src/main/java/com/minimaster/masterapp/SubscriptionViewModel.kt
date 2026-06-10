package com.minimaster.masterapp

import android.app.Activity
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.google.firebase.functions.FirebaseFunctions
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

/**
 * A [ViewModel] for managing the subscription screen's state and logic.
 *
 * This ViewModel interacts with the [BillingClientWrapper] to fetch product details
 * and to initiate the Google Play Billing purchase flow. It also communicates with the
 * Firebase backend to verify purchases once they are made.
 *
 * @property billingClientWrapper The wrapper for the Google Play Billing Client.
 * @property functions The Firebase Functions instance for backend calls.
 * @property credentialsRepository The repository for accessing the master's credentials.
 */
@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val billingClientWrapper: BillingClientWrapper,
    private val functions: FirebaseFunctions
) : ViewModel() {

    /** A [StateFlow] that emits the list of available subscription products. */
    val productDetails: StateFlow<List<ProductDetails>> = billingClientWrapper.productDetails
    /** A [StateFlow] that emits the latest purchase, which can be observed to trigger verification. */
    val purchaseStatus: StateFlow<Purchase?> = billingClientWrapper.purchaseStatus.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = null
    )

    private val TAG = "SubscriptionViewModel"

    init {
        // Start the connection to the Google Play Billing service when the ViewModel is created.
        billingClientWrapper.startConnection()
    }

    /**
     * Initiates the Google Play purchase flow for a selected product.
     * @param activity The current [Activity] required to launch the billing flow.
     * @param productDetails The [ProductDetails] of the item to be purchased.
     */
    fun launchPurchaseFlow(activity: Activity, productDetails: ProductDetails) {
        billingClientWrapper.launchPurchaseFlow(activity, productDetails)
    }

    /**
     * Verifies a completed purchase with the backend.
     * This involves calling the `verifyPurchase` Firebase Function with the purchase details.
     * @param purchase The [Purchase] object to be verified.
     */
    fun verifyPurchase(purchase: com.android.billingclient.api.Purchase) {
        viewModelScope.launch {
            val sku = purchase.products.firstOrNull()
            if (sku == null) {
                Log.e(TAG, "Cannot verify purchase, no product ID found.")
                return@launch
            }

            // Auth is handled by Firebase Auth token — no masterImei/secretKey needed
            val data = hashMapOf(
                "purchaseToken" to purchase.purchaseToken,
                "sku" to sku
            )
            try {
                functions.getHttpsCallable("verifyPurchase").call(data).await()
                if (!purchase.isAcknowledged) {
                    billingClientWrapper.acknowledgePurchase(purchase)
                }
                Log.d(TAG, "Purchase verification successful for $sku.")
            } catch (e: Exception) {
                Log.e(TAG, "Purchase verification failed for $sku.", e)
            }
        }
    }
}
