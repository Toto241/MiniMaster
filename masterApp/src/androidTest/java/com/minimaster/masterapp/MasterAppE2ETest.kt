package com.minimaster.masterapp

import android.util.Log
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MasterAppE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun generateTokenAndLogIt() {
        // In a real-world scenario, the device needs to be registered first.
        // The permission grant should trigger the registration automatically in this app's logic.
        // We will wait until the "Generate Pairing Link" button is visible, which confirms registration success.
        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            composeTestRule
                .onAllNodesWithText("Generate Pairing Link")
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Click the button to generate the pairing link
        composeTestRule.onNodeWithText("Generate Pairing Link").performClick()

        // Wait for the link generation to succeed.
        // We check the debug status text for the "Success:" message.
        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            val nodes = composeTestRule
                .onAllNodesWithTag("debug_link_status")
                .fetchSemanticsNodes()
            if (nodes.isEmpty()) return@waitUntil false
            val text = nodes[0].config.getOrNull(SemanticsProperties.Text)?.get(0)?.text ?: ""
            text.contains("Success:")
        }

        // The debug info might be hidden. Click the button to ensure it's visible.
        // If the button isn't found, we assume the info is already visible.
        try {
            composeTestRule.onNodeWithText("Show Debug Info").performClick()
        } catch (e: AssertionError) {
            // This is okay, it means the debug info is likely already visible.
        }

        // Retrieve the text from the debug view using the testTag
        val statusTextNode = composeTestRule.onNodeWithTag("debug_link_status").fetchSemanticsNode()
        val statusText = statusTextNode.config[SemanticsProperties.Text][0].text

        // Extract the token from the status text
        val token = statusText.substringAfter("Success: ").trim()

        // Verify that the token is not empty and log it for the orchestration script
        assert(token.isNotEmpty()) { "Token is empty" }
        Log.d("E2E_TEST", "Token: $token")
    }
}
