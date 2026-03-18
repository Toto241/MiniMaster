package com.google.pairing

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.Dispatchers
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PairingScreenUITest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var context: Context
    private lateinit var viewModel: PairingViewModel

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        val dataStore = com.google.pairing.di.AppModule.provideDataStore(context)
        val childIdRepository = ChildIdRepository(dataStore)
        viewModel = PairingViewModel(childIdRepository, FirebaseFunctions.getInstance(), Dispatchers.Main)
    }

    @Test
    fun pairingScreenElementsAreDisplayed() {
        composeTestRule.setContent {
            PairingScreen(viewModel = viewModel)
        }

        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_code_input_label)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_button_text)).assertIsDisplayed()
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_status_idle)).assertIsDisplayed()
    }

    @Test
    fun pairingButtonEnabledWhenCodeNotEmpty() {
        composeTestRule.setContent {
            PairingScreen(viewModel = viewModel)
        }

        composeTestRule
            .onNodeWithTag("PairingButton")
            .assertIsNotEnabled()

        composeTestRule
            .onNodeWithTag("PairingCodeTextField")
            .performTextInput("123456")

        composeTestRule
            .onNodeWithTag("PairingButton")
            .assertIsEnabled()
    }
}
