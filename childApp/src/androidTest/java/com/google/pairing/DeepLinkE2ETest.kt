package com.google.pairing

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DeepLinkE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun verifySuccessfulPairingFromDeepLink_showsLockScreen() {
        // On successful backend validation, app should navigate to lock screen.
        composeTestRule.waitUntil(timeoutMillis = 30_000) {
            composeTestRule
                .onAllNodesWithText(composeTestRule.activity.getString(R.string.lock_screen_title))
                .fetchSemanticsNodes().isNotEmpty()
        }

        composeTestRule
            .onNodeWithText(composeTestRule.activity.getString(R.string.lock_screen_title))
            .assertIsDisplayed()
    }
}
