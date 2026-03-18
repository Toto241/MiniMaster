package com.google.pairing

import android.content.Context
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.datastore.preferences.core.edit
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PairingFlowIntegrationTest {

    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()

        // Clear DataStore so each test starts from a deterministic state.
        runBlocking {
            context.dataStore.edit { preferences ->
                preferences.clear()
            }
        }
    }

    @Test
    fun savedChildId_navigatesToLockScreenAfterRelaunch() {
        val childIdToSave = "child-integration-test"

        // Start state: Pairing screen must be visible when no child ID is persisted.
        composeTestRule.onNodeWithText(context.getString(R.string.pairing_screen_title)).assertIsDisplayed()

        runBlocking {
            val childIdRepository = (composeTestRule.activity as MainActivity).let { activity ->
                val dataStore = com.google.pairing.di.AppModule.provideDataStore(context)
                ChildIdRepository(dataStore)
            }
            childIdRepository.saveChildId(childIdToSave)
        }

        // Relaunch so MainActivity re-evaluates the persisted pairing state.
        composeTestRule.activityRule.scenario.relaunch()

        val expectedLockScreenText = context.getString(R.string.lock_screen_message, childIdToSave)
        composeTestRule.onNodeWithText(expectedLockScreenText).assertIsDisplayed()
    }
}
