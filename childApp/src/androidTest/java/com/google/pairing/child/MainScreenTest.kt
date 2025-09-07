package com.google.pairing.child

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainScreenTest {
    @get:Rule 
    val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun showsAppTitle() {
        // Check if the app shows the expected title or content
        composeRule.onNodeWithText("Child App").assertExists()
    }

    @Test
    fun showsLockStatus() {
        // Test that lock status is displayed (this would need to be adapted to actual UI)
        composeRule.onNodeWithText("Status").assertExists()
    }
}