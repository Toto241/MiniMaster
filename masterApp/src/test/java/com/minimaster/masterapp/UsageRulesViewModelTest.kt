package com.minimaster.masterapp

import androidx.lifecycle.SavedStateHandle
import com.minimaster.masterapp.core.rules.UsageRuleDraft
import com.minimaster.masterapp.data.repositories.UsageRuleRepository
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
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

@OptIn(ExperimentalCoroutinesApi::class)
class UsageRulesViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    private lateinit var usageRuleRepository: UsageRuleRepository

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
        usageRuleRepository = mock()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun saveRules_withoutChildId_setsErrorImmediately() = runTest {
        val viewModel = UsageRulesViewModel(usageRuleRepository, SavedStateHandle())

        viewModel.saveRules()
        advanceUntilIdle()

        assertEquals("No child selected.", viewModel.state.value.error)
        assertFalse(viewModel.state.value.isSaving)
    }

    @Test
    fun saveRules_withUsageRules_callsBackendWithConvertedPayload() = runTest {
        whenever(usageRuleRepository.saveRules(any(), any())).thenReturn(Unit)
        val viewModel = UsageRulesViewModel(usageRuleRepository, SavedStateHandle(mapOf("childId" to "child-1")))

        viewModel.updateDailyLimit(15)
        viewModel.updateAllowedStartTime("08:00")
        viewModel.updateAllowedEndTime("18:00")
        viewModel.addPerAppLimit("com.example.video", 20)

        viewModel.saveRules()
        advanceUntilIdle()

        val expectedDraft = UsageRuleDraft(
            dailyLimitMinutes = 15,
            allowedStartTime = "08:00",
            allowedEndTime = "18:00",
            perAppLimits = mapOf("com.example.video" to 20)
        )
        verify(usageRuleRepository).saveRules(eq("child-1"), eq(expectedDraft))
        assertTrue(viewModel.state.value.saveSuccess)
        assertEquals(null, viewModel.state.value.error)
    }

    @Test
    fun saveRules_whenBackendFails_exposesUserVisibleError() = runTest {
        whenever(usageRuleRepository.saveRules(any(), any())).thenThrow(IllegalStateException("offline"))
        val viewModel = UsageRulesViewModel(usageRuleRepository, SavedStateHandle(mapOf("childId" to "child-1")))

        viewModel.updateDailyLimit(10)
        viewModel.saveRules()
        advanceUntilIdle()

        assertFalse(viewModel.state.value.isSaving)
        assertFalse(viewModel.state.value.saveSuccess)
        assertEquals("Failed to save rules: offline", viewModel.state.value.error)
    }
}
