package com.minimaster.masterapp

import android.app.Activity
import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.google.android.gms.tasks.Tasks
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.FirebaseFunctionsException
import com.google.firebase.functions.HttpsCallableReference
import com.google.firebase.functions.HttpsCallableResult
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SubscriptionViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var mockBillingClientWrapper: BillingClientWrapper
    private lateinit var mockFunctions: FirebaseFunctions
    private lateinit var mockHttpsCallable: HttpsCallableReference
    private lateinit var viewModel: SubscriptionViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)

        mockBillingClientWrapper = mockk(relaxed = true)
        mockFunctions = mockk()
        mockHttpsCallable = mockk()

        // Setup default mock returns
        every { mockBillingClientWrapper.productDetails } returns flowOf(emptyList())
        every { mockBillingClientWrapper.purchaseStatus } returns flowOf(null)
        every { mockFunctions.getHttpsCallable(any()) } returns mockHttpsCallable

        viewModel = SubscriptionViewModel(mockBillingClientWrapper, mockFunctions)
    }

    @Test
    fun `init starts billing connection`() {
        // Verify that startConnection was called during initialization
        verify { mockBillingClientWrapper.startConnection() }
    }

    @Test
    fun `launchPurchaseFlow delegates to billing client`() {
        // Given
        val mockActivity = mockk<Activity>()
        val mockProductDetails = mockk<ProductDetails>()

        // When
        viewModel.launchPurchaseFlow(mockActivity, mockProductDetails)

        // Then
        verify { mockBillingClientWrapper.launchPurchaseFlow(mockActivity, mockProductDetails) }
    }

    @Test
    fun `verifyPurchase success with valid credentials`() = runTest {
        // Given
        val purchaseToken = "test-purchase-token"
        val sku = "single_child_monthly"

        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns purchaseToken
        every { mockPurchase.products } returns listOf(sku)

        val mockResult = mockk<HttpsCallableResult>()
        val mockTask = Tasks.forResult(mockResult)
        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then
        verify {
            mockHttpsCallable.call(
                match<HashMap<String, Any?>> { data ->
                    data["purchaseToken"] == purchaseToken &&
                    data["sku"] == sku
                }
            )
        }
    }

    @Test
    fun `verifyPurchase fails silently when products list empty`() = runTest {
        // Given
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns emptyList()

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then - no sku means no call
        verify(exactly = 0) { mockHttpsCallable.call(any()) }
    }

    @Test
    fun `verifyPurchase handles firebase function exception`() = runTest {
        // Given
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns listOf("single_child_monthly")

        val exception = FirebaseFunctionsException(
            FirebaseFunctionsException.Code.INVALID_ARGUMENT,
            "Invalid purchase token",
            null,
            null
        )
        val mockTask = Tasks.forException<HttpsCallableResult>(exception)
        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then - Should handle exception gracefully (method doesn't throw)
        verify { mockHttpsCallable.call(any()) }
    }

    @Test
    fun `verifyPurchase handles empty product list`() = runTest {
        // Given
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns emptyList()

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then - no call since sku is null
        verify(exactly = 0) { mockHttpsCallable.call(any()) }
    }
}
