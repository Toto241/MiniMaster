package com.google.pairing

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.any
import org.mockito.kotlin.coEvery
import org.mockito.kotlin.mock
import org.mockito.kotlin.coVerify

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class PairingFlowEndToEndTest {

    @get:Rule(order = 0)
    var hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private lateinit var context: Context

    // Bind the FakePairingViewModel. It will be injected into PairingScreen.
    @BindValue @JvmField
    val fakePairingViewModel: PairingViewModel = FakePairingViewModel()
    private val testSpecificViewModel: FakePairingViewModel
        get() = fakePairingViewModel as FakePairingViewModel

    // We also need to control ChildIdRepository for MainActivity's observation.
    // We'll use a mock for ChildIdRepository.
    @BindValue @JvmField
    val mockChildIdRepository: ChildIdRepository = mock()

    // StateFlow to simulate the childId in DataStore for MainActivity to observe
    private val childIdFlow = MutableStateFlow<String?>(null)

    @Before
    fun setUp() {
        hiltRule.inject()
        context = ApplicationProvider.getApplicationContext()

        // Configure the mockChildIdRepository before each test
        // MainActivity collects getChildId()
        coEvery { mockChildIdRepository.getChildId() } returns childIdFlow.asStateFlow()
        // Reset the flow to initial state (no childId)
        childIdFlow.value = null

        // Reset fake ViewModel state
        testSpecificViewModel.clearAllErrors()
        testSpecificViewModel._isLoadingLiveData.postValue(false)
        testSpecificViewModel.validatePairingCodeCalledWith = null
        testSpecificViewModel.childIdSaved = null
    }

    @Test
    fun testSuccessfulPairingFlow_navigateToLockScreen() {
        // 1. Ensure we start on PairingScreen because childIdFlow is null
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()

        // 2. Configure the mock ChildIdRepository.saveChildId to update our StateFlow
        // This simulates the real repository saving the ID and MainActivity's collector reacting.
        coEvery { mockChildIdRepository.saveChildId(FakePairingViewModel.TEST_CHILD_ID_HAPPY_PATH) } coAnswers {
            childIdFlow.value = FakePairingViewModel.TEST_CHILD_ID_HAPPY_PATH
            // Simulate successful save, no exception
        }

        // 3. UI Interactions on PairingScreen
        // Enter the magic success code
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label))
            .performTextInput(FakePairingViewModel.MAGIC_TEST_CODE_SUCCESS)

        // Click the pair button
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text))
            .performClick()

        // 4. Assertions
        // Check if loading indicator was shown (FakeViewModel sets isLoading)
        // This happens quickly, so we check the outcome.
        // The FakePairingViewModel's validatePairingCode will set isLoading to true then false.
        // And then handleSuccessfulValidation (from real ViewModel, called by Fake) will set it true then false.
        // We expect the navigation to happen due to childIdFlow update.

        // Verify that validatePairingCode on the fake VM was called
        assert(testSpecificViewModel.validatePairingCodeCalledWith == FakePairingViewModel.MAGIC_TEST_CODE_SUCCESS)
        // Verify that the fake VM "saved" the correct childId (internal state of fake)
        assert(testSpecificViewModel.childIdSaved == FakePairingViewModel.TEST_CHILD_ID_HAPPY_PATH)


        // Wait for UI to update based on StateFlow change in MainActivity
        composeTestRule.waitForIdle() // Ensure Compose recomposition due to state change

        // Verify navigation to LockScreen and correct childId display
        val expectedLockScreenText = context.getString(R.string.lock_screen_message, FakePairingViewModel.TEST_CHILD_ID_HAPPY_PATH)
        composeTestRule.onNodeWithText(expectedLockScreenText).assertIsDisplayed()

        // Verify that saveChildId was called on the mock repository
        coVerify { mockChildIdRepository.saveChildId(FakePairingViewModel.TEST_CHILD_ID_HAPPY_PATH) }
    }

    @Test
    fun testInvalidCode_showsErrorAndStaysOnPairingScreen() {
        // 1. Ensure we start on PairingScreen
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()

        // 2. UI Interactions on PairingScreen
        // Enter the magic invalid code
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label))
            .performTextInput(FakePairingViewModel.MAGIC_TEST_CODE_INVALID)

        // Click the pair button
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text))
            .performClick()

        // 3. Assertions
        // Verify that validatePairingCode on the fake VM was called with the invalid code
        assert(testSpecificViewModel.validatePairingCodeCalledWith == FakePairingViewModel.MAGIC_TEST_CODE_INVALID)

        // Wait for UI to update (e.g., error message to appear)
        composeTestRule.waitForIdle()

        // Check if the error message for invalid code is displayed
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertIsDisplayed()

        // Check if still on PairingScreen (e.g., title is still visible)
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()
        // Check if LockScreen is NOT displayed
        val lockScreenTextIfNavigated = context.getString(R.string.lock_screen_message, "anyId") // Use a placeholder
        composeTestRule.onNode(withText(startsWith(lockScreenTextIfNavigated.substring(0, 10)))).assertDoesNotExist()


        // Check if the input field is still enabled (or check its content)
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).assertIsEnabled()
        // Check if the pairing button is enabled again
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsEnabled()

        // Ensure no attempt was made to save a childId
        coVerify(exactly = 0) { mockChildIdRepository.saveChildId(any()) }
        // Ensure childIdFlow is still null (no navigation should have been triggered by it)
        assert(childIdFlow.value == null)
    }
}
