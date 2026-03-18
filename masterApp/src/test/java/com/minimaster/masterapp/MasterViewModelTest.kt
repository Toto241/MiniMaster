package com.minimaster.masterapp

import com.google.android.gms.tasks.Tasks
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

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        functions = mock()
        callable = mock()
        credentialsRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun init_sets_success_when_credentials_exist() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf("imei-1" to "secret-1"))

        val viewModel = MasterViewModel(functions, credentialsRepository)
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
        whenever(callableResult.getData()).thenReturn(mapOf("secretKey" to "generated-secret"))
        whenever(callable.call(any())).thenReturn(Tasks.forResult(callableResult))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        advanceUntilIdle()

        viewModel.registerDevice("imei-123")
        advanceUntilIdle()

        verify(credentialsRepository).saveCredentials("imei-123", "generated-secret")
        assertTrue(viewModel.registrationState.value is RegistrationState.Success)
        assertEquals("imei-123", viewModel.debugState.value.imei)
        assertEquals("generated-secret", viewModel.debugState.value.secretKey)
    }

    @Test
    fun generateLink_without_credentials_sets_error() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))

        val viewModel = MasterViewModel(functions, credentialsRepository)
        advanceUntilIdle()

        viewModel.generateLink()
        advanceUntilIdle()

        val state = viewModel.linkGenerationState.value
        assertTrue(state is LinkGenerationState.Error)
        assertEquals("Device not registered yet.", (state as LinkGenerationState.Error).message)
    }
}
