package com.google.pairing

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.Locale
import android.content.res.Configuration

@RunWith(AndroidJUnit4::class)
class LockScreenUITest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun lockScreen_displaysChildIdCorrectly_english() {
        val testChildId = "testChildXYZ"
        // Set device locale to English for this test
        setLocale(Locale.ENGLISH)

        composeTestRule.setContent {
            LockScreen(childId = testChildId)
        }

        val expectedText = context.getString(R.string.lock_screen_message, testChildId)
        composeTestRule.onNodeWithText(expectedText).assertIsDisplayed()
    }

    @Test
    fun lockScreen_displaysChildIdCorrectly_german() {
        val testChildId = "testKindID987"
        // Set device locale to German for this test
        setLocale(Locale.GERMAN)

        // It's important that the context used for getString is updated with the new locale.
        // ActivityScenario or similar would handle this naturally. For createComposeRule,
        // we re-fetch the context or ensure it's correctly configured.
        // ApplicationProvider.getApplicationContext() might not reflect locale changes immediately
        // in a way that getString picks up without activity recreation.
        // However, stringResource in Compose should pick up the current system locale.

        composeTestRule.setContent {
            LockScreen(childId = testChildId)
        }

        // For this to work reliably, the resources must be loaded with the German locale.
        // Compose's stringResource() should handle this.
        // Let's manually construct the expected German string based on R.string.lock_screen_message
        // Default (English): "App is locked. Child ID: %1$s"
        // German: "App ist gesperrt. Kind-ID: %1$s"
        val expectedText = "App ist gesperrt. Kind-ID: $testChildId" // Manually construct for clarity

        composeTestRule.onNodeWithText(expectedText).assertIsDisplayed()
    }


    // Helper function to change locale for testing (simplified)
    // Note: For robust locale testing in instrumented tests, consider using tools like `androidx.test.runner.LocaleTestRule`
    // or ensuring the Activity is recreated after locale changes.
    private fun setLocale(locale: Locale) {
        Locale.setDefault(locale)
        val resources = context.resources
        val config = Configuration(resources.configuration)
        config.setLocale(locale)
        // context.createConfigurationContext(config) // This creates a new context
        // For composeTestRule, it's more about the system/app context Compose uses for stringResource
        resources.updateConfiguration(config, resources.displayMetrics)
    }

    // Optional Test: Internationalization (PairingScreen - German)
    // This would be similar to the LockScreen German test.
    @Test
    fun pairingScreen_displaysTitle_german() {
        setLocale(Locale.GERMAN)
        composeTestRule.setContent {
            PairingScreen()
        }
        // R.string.pairing_screen_title in German is "Kopplungsbildschirm"
        composeTestRule.onNodeWithText("Kopplungsbildschirm").assertIsDisplayed()
    }
}
