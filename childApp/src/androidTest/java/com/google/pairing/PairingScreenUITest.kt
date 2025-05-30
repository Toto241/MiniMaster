package com.google.pairing

import android.content.Context
import android.content.res.Configuration
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.lifecycle.viewmodel.compose.viewModel // Import for viewModel()
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import java.util.Locale

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class PairingScreenUITest {

    @get:Rule(order = 0)
    var hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createComposeRule()

    private lateinit var context: Context

    // Bind the FakePairingViewModel to be used by Hilt instead of the real one.
    // Ensure FakePairingViewModel extends PairingViewModel.
    @BindValue @JvmField
    val fakeViewModel: PairingViewModel = FakePairingViewModel()
    // We cast to FakePairingViewModel when we need to call its specific methods for test setup.
    private val testSpecificViewModel: FakePairingViewModel
        get() = fakeViewModel as FakePairingViewModel


    @Before
    fun setUp() {
        hiltRule.inject()
        context = ApplicationProvider.getApplicationContext()
        setLocale(Locale.ENGLISH)
        // fakeViewModel is already initialized by Hilt via @BindValue
        // We need to clear its state before each test if it's not reset by Hilt.
        testSpecificViewModel.clearAllErrors()
        testSpecificViewModel._isLoadingLiveData.postValue(false)
    }

    private fun setLocale(locale: Locale) {
        Locale.setDefault(locale)
        val resources = context.resources
        val config = Configuration(resources.configuration)
        config.setLocale(locale)
        resources.updateConfiguration(config, resources.displayMetrics)
        // Re-initialize context to ensure it picks up the new locale for string resources
        // This is a bit of a workaround; more robust solutions might involve Activity recreation
        // or specific test runners/rules for locale.
        context = ApplicationProvider.getApplicationContext<Context>().createConfigurationContext(config)
    }

    @Test
    fun pairingScreenElementsAreDisplayed() {
        composeTestRule.setContent {
            // PairingScreen will use the Hilt-injected ViewModel (which is our fakeViewModel)
            PairingScreen()
        }

        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_code_input_label)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsDisplayed()
    }

    @Test
    fun textInputInCodeFieldWorks() {
        composeTestRule.setContent {
            PairingScreen()
        }
        val testInput = "123456"
        // Use the label to find the OutlinedTextField
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).performTextInput(testInput)
        composeTestRule.onNodeWithText(testInput).assertIsDisplayed()
    }

    @Test
    fun pairingButtonDisabledWhenLoading() {
        testSpecificViewModel._isLoadingLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsNotEnabled()
        composeTestRule.onNode(hasProgressBarRangeInfo()).assertIsDisplayed()
    }

    @Test
    fun pairingButtonDisabledWhenCodeIsEmpty() {
        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).assertTextEquals("")
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsNotEnabled()
    }

    @Test
    fun pairingButtonEnabledWhenCodeIsNotEmptyAndNotLoading() {
        testSpecificViewModel._isLoadingLiveData.postValue(false)
        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).performTextInput("123")
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsEnabled()
    }

    @Test
    fun displayErrorCodeExpired() {
        testSpecificViewModel._showExpiredCodeErrorLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_code_expired)).assertIsDisplayed()
    }

    @Test
    fun displayErrorInvalidCode() {
        testSpecificViewModel._showInvalidCodeErrorLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertIsDisplayed()
    }

    @Test
    fun displayErrorSavingChildId() {
        testSpecificViewModel._showChildIdSaveErrorLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_saving_child_id)).assertIsDisplayed()
    }

    @Test
    fun errorMessageNotShownWhenNoError() {
        testSpecificViewModel.clearAllErrors() // Ensure all errors are false
        testSpecificViewModel._isLoadingLiveData.postValue(false)

        composeTestRule.setContent {
            PairingScreen()
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_code_expired)).assertDoesNotExist()
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertDoesNotExist()
        composeTestRule.onNodeWithText(context.getString(R.string.error_saving_child_id)).assertDoesNotExist()
    }

    @Test
    fun clickingPairButtonCallsViewModel() {
        // For this test, we want to verify the interaction with the Hilt-injected fakeViewModel
        // The @BindValue fakeViewModel is already in place.
        val testCode = "TESTCODE"
        composeTestRule.setContent {
            PairingScreen() // Uses the Hilt-injected fakeViewModel
        }

        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).performTextInput(testCode)
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).performClick()

        // Verify that the validatePairingCode method on our Hilt-injected fakeViewModel was called
        assert(testSpecificViewModel.validatePairingCodeCalledWith == testCode)
    }

    @Test
    fun pairingScreenDisplaysCorrectLanguageGerman() {
        setLocale(Locale.GERMAN)
        // fakeViewModel is already injected by Hilt.
        // We need to ensure its state is clean if previous tests modified it,
        // or re-initialize it if necessary (though Hilt handles its lifecycle here).
        // For this test, we might want to reset any error states on fakeViewModel if they persist.
        testSpecificViewModel.clearAllErrors()
        testSpecificViewModel._isLoadingLiveData.postValue(false)


        composeTestRule.setContent {
            PairingScreen() // Uses Hilt-injected fakeViewModel
        }

        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_code_input_label)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsDisplayed()

        // Test an error message for German
        testSpecificViewModel._showInvalidCodeErrorLiveData.postValue(true)
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertIsDisplayed()
    }
}
