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
    private lateinit var mockCredentialsRepository: MasterCredentialsRepository
    private lateinit var mockHttpsCallable: HttpsCallableReference
    private lateinit var viewModel: SubscriptionViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        
        mockBillingClientWrapper = mockk(relaxed = true)
        mockFunctions = mockk()
        mockCredentialsRepository = mockk()
        mockHttpsCallable = mockk()

        // Setup default mock returns
        every { mockBillingClientWrapper.productDetails } returns flowOf(emptyList())
        every { mockBillingClientWrapper.purchaseStatus } returns flowOf(null)
        every { mockFunctions.getHttpsCallable(any()) } returns mockHttpsCallable
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(null, null))

        viewModel = SubscriptionViewModel(mockBillingClientWrapper, mockFunctions, mockCredentialsRepository)
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
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        val purchaseToken = "test-purchase-token"
        val sku = "premium_subscription"

        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))
        
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
                    data["masterImei"] == imei &&
                    data["secretKey"] == secret &&
                    data["purchaseToken"] == purchaseToken &&
                    data["sku"] == sku
                }
            )
        }
    }

    @Test
    fun `verifyPurchase fails silently when credentials missing`() = runTest {
        // Given
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(null, null))
        
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns listOf("premium")

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then
        verify(exactly = 0) { mockHttpsCallable.call(any()) }
    }

    @Test
    fun `verifyPurchase handles firebase function exception`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))
        
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns listOf("premium")

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
    fun `verifyPurchase with partial credentials (only imei) fails silently`() = runTest {
        // Given
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair("test-imei", null))
        
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns listOf("premium")

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then
        verify(exactly = 0) { mockHttpsCallable.call(any()) }
    }

    @Test
    fun `verifyPurchase with partial credentials (only secret) fails silently`() = runTest {
        // Given
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(null, "test-secret"))
        
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns listOf("premium")

        // When
        viewModel.verifyPurchase(mockPurchase)
        advanceUntilIdle()

        // Then
        verify(exactly = 0) { mockHttpsCallable.call(any()) }
    }

    @Test
    fun `verifyPurchase handles empty product list`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))
        
        val mockPurchase = mockk<Purchase>()
        every { mockPurchase.purchaseToken } returns "test-token"
        every { mockPurchase.products } returns emptyList()

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
                    data["sku"] == null // Should handle empty products list
                }
            )
        }
    }
}