package com.google.pairing

import com.google.android.gms.tasks.Tasks
import com.google.firebase.auth.AuthResult
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import com.google.firebase.functions.HttpsCallableResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
class PairingViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var childIdRepository: ChildIdRepository
    private lateinit var functions: FirebaseFunctions
    private lateinit var callable: HttpsCallableReference
    private lateinit var firebaseAuth: FirebaseAuth
    private lateinit var firebaseUser: FirebaseUser

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        childIdRepository = mock()
        functions = mock()
        callable = mock()
        firebaseAuth = mock()
        firebaseUser = mock()
        whenever(functions.getHttpsCallable(eq("pairAuthenticatedChild"))).thenReturn(callable)

        val authResult = mock<AuthResult>()
        whenever(authResult.user).thenReturn(firebaseUser)
        whenever(firebaseAuth.currentUser).thenReturn(null)
        whenever(firebaseAuth.signInAnonymously()).thenReturn(Tasks.forResult(authResult))
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun validateToken_success_saves_child_id_and_sets_success() = runTest {
        val callableResult: HttpsCallableResult = mock()
        whenever(callableResult.getData()).thenReturn(mapOf("childId" to "child-123"))
        whenever(callable.call(any())).thenReturn(Tasks.forResult(callableResult))

        val viewModel = PairingViewModel(childIdRepository, functions, dispatcher)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)

        viewModel.validateToken("token-1", "android-device-1")
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>

        assertEquals("token-1", payload["pairingToken"])
        assertEquals(null, payload["childImei"])
        verify(childIdRepository).saveChildId("child-123")
        assertTrue(viewModel.pairingState.value is PairingState.Success)
        assertEquals("android-device-1", viewModel.stableDeviceIdForDebug.value)
    }

    @Test
    fun validateToken_missing_child_id_sets_error() = runTest {
        val callableResult: HttpsCallableResult = mock()
        whenever(callableResult.getData()).thenReturn(mapOf("other" to "value"))
        whenever(callable.call(any())).thenReturn(Tasks.forResult(callableResult))

        val viewModel = PairingViewModel(childIdRepository, functions, dispatcher)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)

        viewModel.validateToken("token-2")
        advanceUntilIdle()

        val state = viewModel.pairingState.value
        assertTrue(state is PairingState.Error)
        assertEquals("Backend returned no childId.", (state as PairingState.Error).message)
    }

    @Test
    fun validateToken_callable_failure_sets_error() = runTest {
        whenever(callable.call(any())).thenReturn(Tasks.forException(RuntimeException("network down")))

        val viewModel = PairingViewModel(childIdRepository, functions, dispatcher)
        viewModel.setFirebaseAuthForTesting(firebaseAuth)

        viewModel.validateToken("token-3")
        advanceUntilIdle()

        val state = viewModel.pairingState.value
        assertTrue(state is PairingState.Error)
        assertTrue((state as PairingState.Error).message.contains("network down"))
    }
}
