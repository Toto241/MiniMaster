package com.minimaster.masterapp

import androidx.arch.core.executor.testing.InstantTaskExecutorRule
import com.google.android.gms.tasks.Task
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
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MasterViewModelTest {

    @get:Rule
    val instantTaskExecutorRule = InstantTaskExecutorRule()

    private val testDispatcher = StandardTestDispatcher()

    private lateinit var mockFunctions: FirebaseFunctions
    private lateinit var mockCredentialsRepository: MasterCredentialsRepository
    private lateinit var mockHttpsCallable: HttpsCallableReference
    private lateinit var viewModel: MasterViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        
        mockFunctions = mockk()
        mockCredentialsRepository = mockk()
        mockHttpsCallable = mockk()

        every { mockFunctions.getHttpsCallable(any()) } returns mockHttpsCallable
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(null, null))

        viewModel = MasterViewModel(mockFunctions, mockCredentialsRepository)
    }

    @Test
    fun `initial state is idle`() {
        assertTrue(viewModel.registrationState.value is RegistrationState.Idle)
        assertTrue(viewModel.linkGenerationState.value is LinkGenerationState.Idle)
    }

    @Test
    fun `checkRegistrationStatus updates state when credentials exist`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))

        // When
        val newViewModel = MasterViewModel(mockFunctions, mockCredentialsRepository)
        advanceUntilIdle()

        // Then
        assertTrue(newViewModel.registrationState.value is RegistrationState.Success)
        assertEquals(imei, newViewModel.debugState.value.imei)
        assertEquals(secret, newViewModel.debugState.value.secretKey)
    }

    @Test
    fun `registerDevice success updates state correctly`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secretKey = "generated-secret-key"
        val mockResult = mockk<HttpsCallableResult>()
        val mockTask = Tasks.forResult(mockResult)

        every { mockResult.data } returns mapOf("secretKey" to secretKey)
        every { mockHttpsCallable.call(any()) } returns mockTask
        coEvery { mockCredentialsRepository.saveCredentials(imei, secretKey) } returns Unit

        // When
        viewModel.registerDevice(imei)
        advanceUntilIdle()

        // Then
        assertTrue(viewModel.registrationState.value is RegistrationState.Success)
        assertEquals(imei, viewModel.debugState.value.imei)
        assertEquals(secretKey, viewModel.debugState.value.secretKey)
        verify { mockCredentialsRepository.saveCredentials(imei, secretKey) }
    }

    @Test
    fun `registerDevice failure updates state with error`() = runTest {
        // Given
        val imei = "test-imei-123"
        val exception = FirebaseFunctionsException(
            FirebaseFunctionsException.Code.INVALID_ARGUMENT,
            "Invalid IMEI",
            null,
            null
        )
        val mockTask: Task<HttpsCallableResult> = Tasks.forException(exception)

        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        viewModel.registerDevice(imei)
        advanceUntilIdle()

        // Then
        val state = viewModel.registrationState.value
        assertTrue(state is RegistrationState.Error)
        assertTrue((state as RegistrationState.Error).message.contains("INVALID_ARGUMENT"))
    }

    @Test
    fun `registerDevice with missing secret key returns error`() = runTest {
        // Given
        val imei = "test-imei-123"
        val mockResult = mockk<HttpsCallableResult>()
        val mockTask = Tasks.forResult(mockResult)

        every { mockResult.data } returns mapOf("otherField" to "value") // No secretKey
        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        viewModel.registerDevice(imei)
        advanceUntilIdle()

        // Then
        val state = viewModel.registrationState.value
        assertTrue(state is RegistrationState.Error)
        assertEquals("Backend returned no secret key.", (state as RegistrationState.Error).message)
    }

    @Test
    fun `generateLink success returns pairing token`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        val pairingToken = "abc123def456"
        
        // Set up debug state with credentials
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))
        val newViewModel = MasterViewModel(mockFunctions, mockCredentialsRepository)
        advanceUntilIdle()

        val mockResult = mockk<HttpsCallableResult>()
        val mockTask = Tasks.forResult(mockResult)
        every { mockResult.data } returns mapOf("pairingToken" to pairingToken)
        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        newViewModel.generateLink()
        advanceUntilIdle()

        // Then
        val state = newViewModel.linkGenerationState.value
        assertTrue(state is LinkGenerationState.Success)
        assertTrue((state as LinkGenerationState.Success).pairingToken.contains(pairingToken))
    }

    @Test
    fun `generateLink without credentials returns error`() = runTest {
        // Given - viewModel starts with no credentials (null, null)

        // When
        viewModel.generateLink()
        advanceUntilIdle()

        // Then
        val state = viewModel.linkGenerationState.value
        assertTrue(state is LinkGenerationState.Error)
        assertEquals("Device not registered yet.", (state as LinkGenerationState.Error).message)
    }

    @Test
    fun `generateLink failure updates state with error`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        
        // Set up debug state with credentials
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))
        val newViewModel = MasterViewModel(mockFunctions, mockCredentialsRepository)
        advanceUntilIdle()

        val exception = FirebaseFunctionsException(
            FirebaseFunctionsException.Code.NOT_FOUND,
            "Master device not found",
            null,
            null
        )
        val mockTask: Task<HttpsCallableResult> = Tasks.forException(exception)
        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        newViewModel.generateLink()
        advanceUntilIdle()

        // Then
        val state = newViewModel.linkGenerationState.value
        assertTrue(state is LinkGenerationState.Error)
        assertTrue((state as LinkGenerationState.Error).message.contains("NOT_FOUND"))
    }

    @Test
    fun `generateLink with missing token returns error`() = runTest {
        // Given
        val imei = "test-imei-123"
        val secret = "test-secret-456"
        
        // Set up debug state with credentials
        every { mockCredentialsRepository.getCredentials } returns flowOf(Pair(imei, secret))
        val newViewModel = MasterViewModel(mockFunctions, mockCredentialsRepository)
        advanceUntilIdle()

        val mockResult = mockk<HttpsCallableResult>()
        val mockTask = Tasks.forResult(mockResult)
        every { mockResult.data } returns mapOf("otherField" to "value") // No pairingToken
        every { mockHttpsCallable.call(any()) } returns mockTask

        // When
        newViewModel.generateLink()
        advanceUntilIdle()

        // Then
        val state = newViewModel.linkGenerationState.value
        assertTrue(state is LinkGenerationState.Error)
        assertEquals("Backend returned no token.", (state as LinkGenerationState.Error).message)
    }
}