package com.minimaster.masterapp

import androidx.lifecycle.SavedStateHandle
import com.google.android.gms.tasks.Tasks
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.functions.HttpsCallableReference
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
class UsageRulesViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var functions: FirebaseFunctions
    private lateinit var callable: HttpsCallableReference

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        functions = mock()
        callable = mock()
        whenever(functions.getHttpsCallable(eq("setUsageRules"))).thenReturn(callable)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun saveRules_withoutChildId_setsErrorImmediately() = runTest {
        val viewModel = UsageRulesViewModel(functions, SavedStateHandle())

        viewModel.saveRules()
        advanceUntilIdle()

        assertEquals("No child selected.", viewModel.state.value.error)
        assertFalse(viewModel.state.value.isSaving)
    }

    @Test
    fun saveRules_withUsageRules_callsBackendWithConvertedPayload() = runTest {
        whenever(callable.call(any())).thenReturn(Tasks.forResult(mock()))
        val viewModel = UsageRulesViewModel(functions, SavedStateHandle(mapOf("childId" to "child-1")))

        viewModel.updateDailyLimit(15)
        viewModel.updateAllowedStartTime("08:00")
        viewModel.updateAllowedEndTime("18:00")
        viewModel.addPerAppLimit("com.example.video", 20)

        viewModel.saveRules()
        advanceUntilIdle()

        val payloadCaptor = argumentCaptor<Any>()
        verify(callable).call(payloadCaptor.capture())
        val payload = payloadCaptor.firstValue as Map<*, *>
        val usageRules = payload["usageRules"] as Map<*, *>

        assertEquals("child-1", payload["childId"])
        assertEquals(900, usageRules["dailyLimitSeconds"])
        assertEquals(mapOf("start" to "08:00", "end" to "18:00"), usageRules["allowedHours"])
        assertEquals(mapOf("com.example.video" to 1200), usageRules["appLimits"])
        assertTrue(viewModel.state.value.saveSuccess)
        assertEquals(null, viewModel.state.value.error)
    }

    @Test
    fun saveRules_whenBackendFails_exposesUserVisibleError() = runTest {
        whenever(callable.call(any())).thenReturn(Tasks.forException(IllegalStateException("offline")))
        val viewModel = UsageRulesViewModel(functions, SavedStateHandle(mapOf("childId" to "child-1")))

        viewModel.updateDailyLimit(10)
        viewModel.saveRules()
        advanceUntilIdle()

        assertFalse(viewModel.state.value.isSaving)
        assertFalse(viewModel.state.value.saveSuccess)
        assertEquals("Failed to save rules: offline", viewModel.state.value.error)
    }
}
