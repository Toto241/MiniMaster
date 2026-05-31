package com.minimaster.masterapp

import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
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
    private lateinit var firebaseUser: FirebaseUser

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        functions = mock()
        callable = mock()
        credentialsRepository = mock()
        firebaseAuth = mock()
        firebaseUser = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun init_sets_success_when_credentials_exist() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf("master-1"))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)
        advanceUntilIdle()

        assertTrue(viewModel.registrationState.value is RegistrationState.Success)
        assertEquals("master-1", viewModel.debugState.value.masterId)
    }

    @Test
    fun registerDevice_success_saves_master_id_and_updates_state() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf(null))
        whenever(functions.getHttpsCallable(eq("registerAuthenticatedMaster"))).thenReturn(callable)

        val authResult = mock<AuthResult>()
        whenever(authResult.user).thenReturn(firebaseUser)
        whenever(firebaseAuth.currentUser).thenReturn(null)
        whenever(firebaseAuth.signInAnonymously()).thenReturn(Tasks.forResult(authResult))

        val callableResult: HttpsCallableResult = mock()
        whenever(callableResult.getData()).thenReturn(mapOf("masterId" to "master-123"))
        whenever(callable.call(any())).thenReturn(Tasks.forResult(callableResult))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)
        advanceUntilIdle()

        viewModel.registerDevice("device-123")
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("device-123", payload["deviceId"])
        verify(credentialsRepository).saveMasterId("master-123")
        assertTrue(viewModel.registrationState.value is RegistrationState.Success)
        assertEquals("master-123", viewModel.debugState.value.masterId)
    }

    @Test
    fun generateLink_without_credentials_sets_error() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf(null))

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
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf("master-1"))
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
