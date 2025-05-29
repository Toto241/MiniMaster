package com.google.pairing

import android.content.Context
import androidx.datastore.core.DataStore // Import DataStore
import androidx.datastore.preferences.core.Preferences // Import Preferences
import androidx.datastore.preferences.core.edit
import androidx.test.core.app.ApplicationProvider
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.isDisplayed
import androidx.test.espresso.matcher.ViewMatchers.withText
import androidx.test.ext.junit.rules.ActivityScenarioRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.BindValue
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import javax.inject.Inject

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class MainActivityIntentTest {

    @get:Rule(order = 0)
    var hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1) // Ensure ActivityScenarioRule runs after HiltAndroidRule
    val activityScenarioRule = ActivityScenarioRule(MainActivity::class.java)

    private lateinit var context: Context

    // Use @BindValue to replace the real ChildIdRepository with a mock
    // This mock will be used by MainActivity when it's injected with @Inject
    @BindValue @JvmField
    val mockChildIdRepository: ChildIdRepository = mock()
    // Note: @JvmField is needed for fields that are bound with @BindValue if they are in Kotlin.

    // We might still need direct DataStore access for PRE-test setup if we want to
    // ensure a clean slate beyond what the mocked repository provides.
    // However, with @BindValue, the activity will use the MOCK, so direct DataStore manipulation
    // for THIS test's assertions might be less relevant if the activity relies purely on the injected repo.
    // For this pattern, we'll control the behavior entirely via the mock.
    // If direct DataStore interaction was for setting up a state that another *real* (non-mocked)
    // component would read, then it would be needed.
    // Here, MainActivity.childIdRepository IS mockChildIdRepository.

    @Before
    fun setUp() {
        hiltRule.inject() // Initialize Hilt-injected fields in the test class
        context = ApplicationProvider.getApplicationContext()
        // No need to clear DataStore directly if we control the mock's behavior.
    }

    @Test
    fun appStarts_withSavedChildId_showsLockScreen() {
        val testChildId = "testChild123"
        // Configure the mock to return a specific childId
        whenever(mockChildIdRepository.getChildId()).thenReturn(flowOf(testChildId))

        // Relaunch the activity to ensure it picks up the mocked repository's state
        // This is important because the mock setup happens before the activity is launched by the rule.
        // If the activity is already launched, it might have already collected the initial flow.
        activityScenarioRule.scenario.relaunch()

        val expectedText = context.getString(R.string.lock_screen_message, testChildId)
        onView(withText(expectedText)).check(matches(isDisplayed()))
    }

    @Test
    fun appStarts_withoutChildId_showsPairingScreen() {
        // Configure the mock to return null/empty, simulating no childId
        whenever(mockChildIdRepository.getChildId()).thenReturn(flowOf(null)) // Or flowOf("")

        activityScenarioRule.scenario.relaunch()

        val expectedText = context.getString(R.string.pairing_screen_title)
        onView(withText(expectedText)).check(matches(isDisplayed()))
    }
}
