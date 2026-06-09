package com.minimaster.masterapp

import android.app.Activity
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.google.android.gms.tasks.Tasks
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class SubscriptionViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var billingClientWrapper: BillingClientWrapper
    private lateinit var functions: FirebaseFunctions
    private lateinit var callable: HttpsCallableReference

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        billingClientWrapper = mock()
        functions = mock()
        callable = mock()

        whenever(billingClientWrapper.productDetails).thenReturn(MutableStateFlow(emptyList()))
        whenever(billingClientWrapper.purchaseStatus).thenReturn(MutableStateFlow(null))
        whenever(functions.getHttpsCallable(eq("verifyPurchase"))).thenReturn(callable)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun init_starts_billing_connection() {
        SubscriptionViewModel(billingClientWrapper, functions)

        verify(billingClientWrapper).startConnection()
    }

    @Test
    fun launchPurchaseFlow_delegates_to_wrapper() {
        val viewModel = SubscriptionViewModel(billingClientWrapper, functions)
        val activity: Activity = mock()
        val product: ProductDetails = mock()

        viewModel.launchPurchaseFlow(activity, product)

        verify(billingClientWrapper).launchPurchaseFlow(activity, product)
    }

    @Test
    fun verifyPurchase_calls_backend_with_token_and_sku() = runTest {
        val viewModel = SubscriptionViewModel(billingClientWrapper, functions)
        val purchase: Purchase = mock()

        whenever(purchase.purchaseToken).thenReturn("token-1")
        whenever(purchase.products).thenReturn(listOf("single_child_monthly"))
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.verifyPurchase(purchase)
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("token-1", payload["purchaseToken"])
        assertEquals("single_child_monthly", payload["sku"])
        verify(billingClientWrapper).acknowledgePurchase(purchase)
    }

    @Test
    fun verifyPurchase_without_products_does_not_call_backend() = runTest {
        val viewModel = SubscriptionViewModel(billingClientWrapper, functions)
        val purchase: Purchase = mock()

        whenever(purchase.purchaseToken).thenReturn("token-2")
        whenever(purchase.products).thenReturn(emptyList())

        viewModel.verifyPurchase(purchase)
        advanceUntilIdle()

        verify(callable, never()).call(any())
        verify(billingClientWrapper, never()).acknowledgePurchase(purchase)
    }

    @Test
    fun verifyPurchase_alreadyAcknowledged_doesNotAcknowledgeAgain() = runTest {
        val viewModel = SubscriptionViewModel(billingClientWrapper, functions)
        val purchase: Purchase = mock()

        whenever(purchase.purchaseToken).thenReturn("token-3")
        whenever(purchase.products).thenReturn(listOf("family_monthly"))
        whenever(purchase.isAcknowledged).thenReturn(true)
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.verifyPurchase(purchase)
        advanceUntilIdle()

        verify(callable).call(any())
        verify(billingClientWrapper, never()).acknowledgePurchase(purchase)
    }
}
