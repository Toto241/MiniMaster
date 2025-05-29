package com.google.pairing

import android.content.Context
import android.content.res.Configuration
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import java.util.Locale

@RunWith(AndroidJUnit4::class)
class PairingScreenUITest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var context: Context
    private lateinit var fakeViewModel: FakePairingViewModel

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // Initialize with default English for most tests
        setLocale(Locale.ENGLISH)
        fakeViewModel = FakePairingViewModel()
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
            PairingScreen(viewModel = fakeViewModel)
        }

        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_code_input_label)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsDisplayed()
    }

    @Test
    fun textInputInCodeFieldWorks() {
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        val testInput = "123456"
        // Use the label to find the OutlinedTextField, then its text input child
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).performTextInput(testInput)
        composeTestRule.onNodeWithText(testInput).assertIsDisplayed() // Checks if the input text is now part of the composable tree
    }

    @Test
    fun pairingButtonDisabledWhenLoading() {
        fakeViewModel._isLoadingLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsNotEnabled()
        composeTestRule.onNode(hasProgressBarRangeInfo()).assertIsDisplayed() // Checks for CircularProgressIndicator
    }

    @Test
    fun pairingButtonDisabledWhenCodeIsEmpty() {
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        // Ensure code is empty by checking the text field's content (optional, default is empty)
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).assertTextEquals("")
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsNotEnabled()
    }

    @Test
    fun pairingButtonEnabledWhenCodeIsNotEmptyAndNotLoading() {
        fakeViewModel._isLoadingLiveData.postValue(false)
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).performTextInput("123")
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsEnabled()
    }

    @Test
    fun displayErrorCodeExpired() {
        fakeViewModel._showExpiredCodeErrorLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_code_expired)).assertIsDisplayed()
    }

    @Test
    fun displayErrorInvalidCode() {
        fakeViewModel._showInvalidCodeErrorLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertIsDisplayed()
    }

    @Test
    fun displayErrorSavingChildId() {
        fakeViewModel._showChildIdSaveErrorLiveData.postValue(true)
        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_saving_child_id)).assertIsDisplayed()
    }

    @Test
    fun errorMessageNotShownWhenNoError() {
        fakeViewModel.clearAllErrors() // Ensure all errors are false
        fakeViewModel._isLoadingLiveData.postValue(false)

        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }
        composeTestRule.onNodeWithText(context.getString(R.string.error_code_expired)).assertDoesNotExist()
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertDoesNotExist()
        composeTestRule.onNodeWithText(context.getString(R.string.error_saving_child_id)).assertDoesNotExist()
    }

    @Test
    fun clickingPairButtonCallsViewModel() {
        val mockViewModel: PairingViewModel = mock() // Use a real Mockito mock here
        val testCode = "TESTCODE"

        composeTestRule.setContent {
            PairingScreen(viewModel = mockViewModel)
        }

        composeTestRule.onNodeWithLabel(context.getString(R.string.pairing_code_input_label)).performTextInput(testCode)
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).performClick()

        verify(mockViewModel).validatePairingCode(testCode)
    }

    @Test
    fun pairingScreenDisplaysCorrectLanguageGerman() {
        setLocale(Locale.GERMAN) // Change to German
        // Re-initialize fakeViewModel to ensure it's created after locale change if it matters for any internal logic (it doesn't here)
        // fakeViewModel = FakePairingViewModel() // Not strictly needed here as FakeVM doesn't use context for strings

        composeTestRule.setContent {
            PairingScreen(viewModel = fakeViewModel)
        }

        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()
        // For OutlinedTextField, the label is a child Composable. We find the OutlinedTextField node first.
        // A more robust way would be to use a testTag on the OutlinedTextField itself.
        // However, searching by label text directly on a node that *is* the label also works.
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_code_input_label)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsDisplayed()

        // Test an error message for German
        fakeViewModel._showInvalidCodeErrorLiveData.postValue(true)
        composeTestRule.onNodeWithText(context.getString(R.string.error_invalid_code)).assertIsDisplayed()
    }
}
