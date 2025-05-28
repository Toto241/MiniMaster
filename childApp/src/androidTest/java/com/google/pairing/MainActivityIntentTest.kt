package com.google.pairing

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityIntentTest {

    @get:Rule
    val activityScenarioRule = ActivityScenarioRule(MainActivity::class.java)

    private lateinit var context: Context
    private lateinit var childIdRepository: ChildIdRepository // For direct manipulation

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        // Initialize the real repository for direct DataStore manipulation
        childIdRepository = ChildIdRepository(context)

        // Clear any existing childId before each test
        runBlocking {
            context.dataStore.edit { preferences ->
                preferences.clear() // Clear all preferences
            }
        }
    }

    @Test
    fun appStarts_withSavedChildId_showsLockScreen() {
        val testChildId = "testChild123"
        // Save a childId directly to DataStore
        runBlocking {
            childIdRepository.saveChildId(testChildId)
        }

        // Relaunch or ensure activity picks up the change.
        // ActivityScenarioRule normally launches activity before @Test.
        // For this, we'd ideally set up data *before* launch.
        // Let's re-launch the activity to ensure it reads the new state.
        activityScenarioRule.scenario.relaunch()


        // Check if LockScreen is displayed by looking for its unique text
        // Assuming LockScreen shows "App is locked. Child ID: testChild123"
        // We need to use string resources for robust tests if text is localized.
        // For now, using hardcoded English string for simplicity as per LockScreen.kt
        // R.string.lock_screen_message = "App is locked. Child ID: %1$s"
        val expectedText = context.getString(R.string.lock_screen_message, testChildId)
        onView(withText(expectedText)).check(matches(isDisplayed()))
    }

    @Test
    fun appStarts_withoutChildId_showsPairingScreen() {
        // ChildId is already cleared in setUp.

        // Relaunch the activity to ensure it reads the cleared state.
        activityScenarioRule.scenario.relaunch()

        // Check if PairingScreen is displayed
        // R.string.pairing_screen_title = "Pairing Screen"
        val expectedText = context.getString(R.string.pairing_screen_title)
        onView(withText(expectedText)).check(matches(isDisplayed()))
    }
}
