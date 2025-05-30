package com.google.pairing

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flowOf
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class MainActivityNavigationTest {

    @get:Rule(order = 0)
    var hiltRule = HiltAndroidRule(this)

    // createAndroidComposeRule is used because we are testing Compose UIs (LockScreen, PairingScreen)
    // launched by MainActivity.
    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private lateinit var context: Context

    // Replace ChildIdRepository mock with ChildIdProvider mock
    @BindValue @JvmField
    val mockChildIdProvider: ChildIdProvider = mock()

    // To control the emissions of mockChildIdProvider.childIdFlow
    private val childIdStateFlow = MutableStateFlow<String?>(null)

    @Before
    fun setUp() {
        hiltRule.inject()
        context = ApplicationProvider.getApplicationContext()
        // Configure the mockChildIdProvider to return our controllable StateFlow
        whenever(mockChildIdProvider.childIdFlow).thenReturn(childIdStateFlow.asStateFlow())
        // Reset the state before each test
        childIdStateFlow.value = null
    }

    @Test
    fun testAppStart_withExistingChildId_navigateToLockScreen() {
        val testChildId = "existingTestChildId123"
        // Set the value for the StateFlow that the MainActivity will collect
        childIdStateFlow.value = testChildId

        // Activity is launched by the rule. We might need to ensure it's relaunched
        // if the rule launches before @Before or if we need to apply mock changes
        // before the very first launch. HiltAndroidRule and ActivityScenarioRule
        // ordering should handle injection before launch.
        // Relaunch to ensure MainActivity collects the new flow value if it started too early.
        // However, Hilt should set up bindings before Activity launch.
        // If tests are flaky, relaunching after setting the flow value might be necessary.
        composeTestRule.activityRule.scenario.relaunch() // Relaunch to ensure new flow value is collected

        // Assertions
        val expectedLockScreenText = context.getString(R.string.lock_screen_message, testChildId)
        composeTestRule.onNodeWithText(expectedLockScreenText).assertIsDisplayed()

        // Verify PairingScreen is not displayed
        val pairingScreenTitle = context.getString(R.string.pairing_screen_title)
        composeTestRule.onNodeWithText(pairingScreenTitle).assertDoesNotExist()
    }

    @Test
    fun testAppStart_withoutChildId_navigateToPairingScreen() {
        // Set the value for the StateFlow to null
        childIdStateFlow.value = null

        // Relaunch to ensure new flow value is collected
        composeTestRule.activityRule.scenario.relaunch()

        // Assertions
        val pairingScreenTitle = context.getString(R.string.pairing_screen_title)
        composeTestRule.onNodeWithText(pairingScreenTitle).assertIsDisplayed()

        // Verify LockScreen is not displayed (using a generic part of its message)
        val partialLockScreenText = "App is locked. Child ID:" // From R.string.lock_screen_message
        composeTestRule.onNode(withText(startsWith(partialLockScreenText))).assertDoesNotExist()
    }
}
