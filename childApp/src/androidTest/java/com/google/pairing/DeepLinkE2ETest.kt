package com.google.pairing

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * This test is designed to be run as part of an end-to-end testing script.
 * It does not perform any actions on its own. Instead, it waits and verifies
 * the result of the app being launched with a deep link by an external process (e.g., adb).
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class DeepLinkE2ETest {

    @get:Rule(order = 0)
    var hiltRule = HiltAndroidRule(this)

    // The Activity is launched by an external ADB command, but the test rule is still needed to hook into it.
    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private lateinit var context: Context

    @Before
    fun setUp() {
        hiltRule.inject()
        context = ApplicationProvider.getApplicationContext()
    }

    @Test
    fun verifySuccessfulPairingFromDeepLink_showsLockScreen() {
        // The app is launched via a deep link from the orchestration script.
        // This test's only job is to wait and verify that the LockScreen is eventually displayed.

        // Get the partial string to identify the lock screen message, ignoring the placeholder
        val lockScreenSubString = context.getString(R.string.lock_screen_message).substringBefore("%1$s")

        // Wait up to 15 seconds for the LockScreen to appear. This allows time for the
        // ViewModel to process the intent, make the network call, save the ID, and for the UI to recompose.
        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            composeTestRule
                .onAllNodes(hasText(lockScreenSubString, substring = true))
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Assert that the lock screen message is actually displayed.
        composeTestRule
            .onNodeWithText(lockScreenSubString, substring = true)
            .assertIsDisplayed()
    }
}
