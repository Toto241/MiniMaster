package com.minimaster.masterapp

import com.google.android.gms.tasks.Tasks
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
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
import org.junit.Assert.assertNull
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
class DashboardViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var firestore: FirebaseFirestore
    private lateinit var functions: FirebaseFunctions
    private lateinit var credentialsRepository: MasterCredentialsRepository
    private lateinit var callable: HttpsCallableReference

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        firestore = mock()
        functions = mock()
        credentialsRepository = mock()
        callable = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun setDeviceLocked_without_credentials_sets_error() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))

        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        viewModel.setDeviceLocked("child-1", true)
        advanceUntilIdle()

        assertEquals("Credentials not found. Cannot perform action.", viewModel.error.value)
    }

    @Test
    fun errorShown_resets_error_state() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))

        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        viewModel.setDeviceLocked("child-1", false)
        advanceUntilIdle()
        assertTrue(viewModel.error.value != null)

        viewModel.errorShown()

        assertNull(viewModel.error.value)
    }

    @Test
    fun createTask_with_credentials_calls_backend() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))
        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        whenever(credentialsRepository.getCredentials).thenReturn(flowOf("imei-1" to "secret-1"))
        whenever(functions.getHttpsCallable(eq("createTask"))).thenReturn(callable)
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.createTask("child-1", "Zimmer aufraeumen", 1704067200000L)
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("imei-1", payload["masterImei"])
        assertEquals("secret-1", payload["secretKey"])
        assertEquals("child-1", payload["childImei"])
        assertEquals("Zimmer aufraeumen", payload["description"])
        assertEquals("2024-01-01T00:00:00Z", payload["deadlineISO"])
    }

    @Test
    fun setDeviceLocked_with_credentials_calls_backend_with_expected_payload() = runTest {
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf(null to null))
        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        whenever(credentialsRepository.getCredentials).thenReturn(flowOf("imei-9" to "secret-9"))
        whenever(functions.getHttpsCallable(eq("setDeviceLocked"))).thenReturn(callable)
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.setDeviceLocked("child-9", true)
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("imei-9", payload["masterImei"])
        assertEquals("secret-9", payload["secretKey"])
        assertEquals("child-9", payload["childImei"])
        assertEquals(true, payload["isLocked"])
    }
}
