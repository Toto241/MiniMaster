package com.minimaster.masterapp

import com.google.android.gms.tasks.Task
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import com.google.firebase.functions.HttpsCallableResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.TestCoroutineDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runBlockingTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentCaptor
import org.mockito.Captor
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner
import org.mockito.kotlin.any
import org.mockito.kotlin.firstValue
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@ExperimentalCoroutinesApi
@RunWith(MockitoJUnitRunner::class)
class DashboardViewModelTest {

    @Mock
    private lateinit var firestore: FirebaseFirestore

    @Mock
    private lateinit var functions: FirebaseFunctions

    @Mock
    private lateinit var credentialsRepository: MasterCredentialsRepository

    @Mock
    private lateinit var callableReference: HttpsCallableReference

    @Mock
    private lateinit var task: Task<HttpsCallableResult>

    @Captor
    private lateinit var dataCaptor: ArgumentCaptor<HashMap<String, Any>>

    private val testDispatcher = TestCoroutineDispatcher()

    private lateinit var viewModel: DashboardViewModel

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
        whenever(credentialsRepository.getCredentials).thenReturn(flowOf("test_imei" to "test_secret"))
        whenever(functions.getHttpsCallable(any())).thenReturn(callableReference)
        whenever(callableReference.call(any<HashMap<String, Any>>())).thenReturn(task)
        viewModel = DashboardViewModel(firestore, functions, credentialsRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        testDispatcher.cleanupTestCoroutines()
    }

    @Test
    fun `createTask formats date correctly and calls firebase function`() = testDispatcher.runBlockingTest {
        // Given
        val childImei = "child_imei_123"
        val description = "Test task"
        val deadline = 1672531200000L // 2023-01-01 00:00:00 UTC

        // When
        viewModel.createTask(childImei, description, deadline)

        // Then
        verify(functions).getHttpsCallable("createTask")
        verify(callableReference).call(dataCaptor.capture())

        val expectedDeadlineISO = "2023-01-01T00:00:00Z"
        val capturedData = dataCaptor.value
        assert(capturedData["childImei"] == childImei)
        assert(capturedData["description"] == description)
        assert(capturedData["deadlineISO"] == expectedDeadlineISO)
        assert(capturedData["masterImei"] == "test_imei")
        assert(capturedData["secretKey"] == "test_secret")
    }
}
