package com.minimaster.masterapp

import android.util.Log
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MasterAppE2ETest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun firstLaunchShowsLegalConsentBeforeRegistration() {
        composeTestRule
            .onNodeWithText("Accept legal terms to continue")
            .assertIsDisplayed()

        composeTestRule
            .onNodeWithText("Accept and continue")
            .assertIsDisplayed()

        Log.d("E2E_TEST", "Master legal consent gate smoke test executed")
    }

    @Test
    fun phase1_1_registrationIsBlockedUntilLegalConsent() {
        composeTestRule
            .onNodeWithText("Accept legal terms to continue")
            .assertIsDisplayed()

        composeTestRule
            .onAllNodesWithText("Register This Device")
            .assertCountEquals(0)
    }
}
