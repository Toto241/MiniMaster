package com.minimaster.masterapp

import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import com.google.firebase.functions.HttpsCallableResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class MasterViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var functions: FirebaseFunctions
    private lateinit var callable: HttpsCallableReference
    private lateinit var credentialsRepository: MasterCredentialsRepository
    private lateinit var firebaseAuth: FirebaseAuth

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        functions = mock()
        callable = mock()
        credentialsRepository = mock()
        firebaseAuth = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun init_sets_success_when_credentials_exist() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf("imei-1" to "secret-1"))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)
        advanceUntilIdle()

        assertTrue(viewModel.registrationState.value is RegistrationState.Success)
        assertEquals("imei-1", viewModel.debugState.value.imei)
        assertEquals("secret-1", viewModel.debugState.value.secretKey)
    }

    @Test
    fun registerDevice_success_saves_credentials_and_updates_state() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))
        whenever(functions.getHttpsCallable(eq("registerMasterDevice"))).thenReturn(callable)

        val callableResult: HttpsCallableResult = mock()
        whenever(callableResult.getData()).thenReturn(mapOf("masterId" to "imei-123", "customToken" to "token-123"))
        whenever(callable.call(any())).thenReturn(Tasks.forResult(callableResult))
        whenever(firebaseAuth.signInWithCustomToken("token-123")).thenReturn(Tasks.forResult(mock<AuthResult>()))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)
        advanceUntilIdle()

        viewModel.registerDevice("imei-123")
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("imei-123", payload["imei"])
        verify(credentialsRepository).saveCredentials("imei-123", "")
        assertTrue(viewModel.registrationState.value is RegistrationState.Success)
        assertEquals("imei-123", viewModel.debugState.value.imei)
        assertEquals(null, viewModel.debugState.value.secretKey)
    }

    @Test
    fun generateLink_without_credentials_sets_error() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)
        advanceUntilIdle()

        viewModel.generateLink()
        advanceUntilIdle()

        val state = viewModel.linkGenerationState.value
        assertTrue(state is LinkGenerationState.Error)
        assertEquals("Device not registered yet.", (state as LinkGenerationState.Error).message)
    }

    @Test
    fun generateLink_with_credentials_calls_backend_with_payload_and_sets_success() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf("imei-1" to "secret-1"))
        whenever(functions.getHttpsCallable(eq("generatePairingLink"))).thenReturn(callable)

        val callableResult: HttpsCallableResult = mock()
        whenever(callableResult.getData()).thenReturn(
            mapOf(
                "pairingToken" to "token-xyz",
                "pairingLink" to "https://pair.example/token-xyz",
                "qrCodeValue" to "https://pair.example/token-xyz",
            )
        )
        whenever(callable.call(any())).thenReturn(Tasks.forResult(callableResult))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)
        advanceUntilIdle()

        viewModel.generateLink()
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>
        val state = viewModel.linkGenerationState.value as LinkGenerationState.Success

        assertTrue(payload.isEmpty())
        assertEquals("token-xyz", state.pairingToken)
        assertEquals("https://pair.example/token-xyz", state.pairingLink)
        assertEquals("https://pair.example/token-xyz", state.qrCodeValue)
    }
}
