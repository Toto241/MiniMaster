package com.minimaster.masterapp

import android.util.Log
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MasterAppE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun registrationScreenSmokeTest() {
        composeTestRule
            .onNodeWithText("Parent Device Setup")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Register This Device")
            .assertIsDisplayed()
            .assertIsEnabled()

        composeTestRule
            .onNodeWithText("Register This Device")
            .performClick()

        Log.d("E2E_TEST", "Master registration smoke test executed")
    }
}
