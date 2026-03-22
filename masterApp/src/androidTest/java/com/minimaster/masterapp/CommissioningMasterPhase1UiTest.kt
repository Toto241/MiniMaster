package com.minimaster.masterapp

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class CommissioningMasterPhase1UiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun phase1_1_preRegistrationDebugState_isVisibleAsNotSet() {
        composeTestRule.setContent {
            DebugInfoView(
                debugState = DebugState(),
                linkState = LinkGenerationState.Idle
            )
        }

        composeTestRule.onNodeWithText("Device ID: Not set").assertIsDisplayed()
        composeTestRule.onNodeWithText("Secret Key: Not set").assertIsDisplayed()
        composeTestRule.onNodeWithText("Link Status: Idle").assertIsDisplayed()
    }

    @Test
    fun phase1_2_linkGenerationSection_coversIdleLoadingSuccessAndErrorStates() {
        composeTestRule.setContent {
            LinkGenerationSection(
                linkState = LinkGenerationState.Idle,
                onGenerateClick = {}
            )
        }
        composeTestRule.onNodeWithText("Generate Pairing Link").assertIsDisplayed()

        composeTestRule.setContent {
            LinkGenerationSection(
                linkState = LinkGenerationState.Loading,
                onGenerateClick = {}
            )
        }
        composeTestRule.onNodeWithText("Generating link...").assertIsDisplayed()

        composeTestRule.setContent {
            LinkGenerationSection(
                linkState = LinkGenerationState.Success("PAIR-TOKEN-123"),
                onGenerateClick = {}
            )
        }
        composeTestRule.onNodeWithText("Link generated successfully!").assertIsDisplayed()
        composeTestRule.onNodeWithText("PAIR-TOKEN-123").assertIsDisplayed()

        composeTestRule.setContent {
            LinkGenerationSection(
                linkState = LinkGenerationState.Error("Generation failed"),
                onGenerateClick = {}
            )
        }
        composeTestRule.onNodeWithText("Generation failed").assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry Link Generation").assertIsDisplayed()
    }
}
