package com.minimaster.masterapp

import com.google.android.gms.tasks.Tasks
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
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
    private lateinit var childrenCollection: CollectionReference
    private lateinit var childrenQuery: Query
    private lateinit var tasksQuery: Query
    private lateinit var listenerRegistration: ListenerRegistration

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        firestore = mock()
        functions = mock()
        credentialsRepository = mock()
        callable = mock()
        childrenCollection = mock()
        childrenQuery = mock()
        tasksQuery = mock()
        listenerRegistration = mock()

        whenever(firestore.collection(eq("children"))).thenReturn(childrenCollection)
        whenever(childrenCollection.whereEqualTo(eq("masterImei"), any())).thenReturn(childrenQuery)
        whenever(childrenQuery.addSnapshotListener(any())).thenReturn(listenerRegistration)
        whenever(firestore.collectionGroup(eq("tasks"))).thenReturn(tasksQuery)
        whenever(tasksQuery.whereEqualTo(eq("masterImei"), any())).thenReturn(tasksQuery)
        whenever(tasksQuery.whereEqualTo(eq("status"), eq("pending_approval"))).thenReturn(tasksQuery)
        whenever(tasksQuery.addSnapshotListener(any())).thenReturn(listenerRegistration)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun setDeviceLocked_without_credentials_sets_error() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf(null))

        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        viewModel.setDeviceLocked("child-1", true)
        advanceUntilIdle()

        assertEquals("Credentials not found. Cannot perform action.", viewModel.error.value)
    }

    @Test
    fun errorShown_resets_error_state() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf(null))

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
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf("master-1"))
        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        whenever(functions.getHttpsCallable(eq("createTask"))).thenReturn(callable)
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.createTask("child-1", "Zimmer aufraeumen", 1704067200000L)
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("child-1", payload["childId"])
        assertEquals("Zimmer aufraeumen", payload["description"])
        assertEquals("2024-01-01T00:00:00Z", payload["deadlineISO"])
    }

    @Test
    fun setDeviceLocked_with_credentials_calls_backend_with_expected_payload() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf("master-9"))
        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        whenever(functions.getHttpsCallable(eq("setDeviceLocked"))).thenReturn(callable)
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.setDeviceLocked("child-9", true)
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("child-9", payload["childId"])
        assertEquals(true, payload["isLocked"])
    }

    @Test
    fun rejectTask_with_credentials_calls_backend_with_expected_payload() = runTest {
        whenever(credentialsRepository.getMasterId).thenReturn(flowOf("master-3"))
        val viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
        advanceUntilIdle()

        whenever(functions.getHttpsCallable(eq("rejectTask"))).thenReturn(callable)
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))

        viewModel.rejectTask("child-3", "task-7", "Foto unscharf")
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("child-3", payload["childId"])
        assertEquals("task-7", payload["taskId"])
        assertEquals("Foto unscharf", payload["reason"])
    }
}
