package com.minimaster.masterapp

import android.app.Activity
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.android.billingclient.api.ProductDetails
import com.google.firebase.functions.FirebaseFunctions
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

@HiltViewModel
class SubscriptionViewModel @Inject constructor(
    private val billingClientWrapper: BillingClientWrapper,
    private val functions: FirebaseFunctions
) : ViewModel() {

    val productDetails: StateFlow<List<ProductDetails>> = billingClientWrapper.productDetails
    val purchaseStatus: StateFlow<Purchase?> = billingClientWrapper.purchaseStatus.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5000),
        initialValue = null
    )

    private val TAG = "SubscriptionViewModel"
    // TODO: Replace with actual master device credentials from secure storage
    private val masterImei = "master-device-imei-placeholder"
    private val secretKey = "master-device-secret-placeholder"

    init {
        billingClientWrapper.startConnection()
    }

    fun launchPurchaseFlow(activity: Activity, productDetails: ProductDetails) {
        billingClientWrapper.launchPurchaseFlow(activity, productDetails)
    }

    fun verifyPurchase(purchase: com.android.billingclient.api.Purchase) {
        viewModelScope.launch {
            val data = hashMapOf(
                "masterImei" to masterImei,
                "secretKey" to secretKey,
                "purchaseToken" to purchase.purchaseToken,
                "sku" to purchase.products.firstOrNull()
            )
            try {
                functions
                    .getHttpsCallable("verifyPurchase")
                    .call(data)
                    .await()
                Log.d(TAG, "Purchase verification successful.")
            } catch (e: Exception) {
                Log.e(TAG, "Purchase verification failed.", e)
            }
        }
    }
}
