package com.google.pairing

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing the onboarding state of the application.
 *
 * This class uses Jetpack DataStore to persist a boolean flag indicating whether
 * the user has completed the initial setup process (e.g., granting necessary permissions).
 *
 * @property dataStore The [DataStore] instance for accessing preferences, injected by Hilt.
 */
@Singleton
class OnboardingRepository @Inject constructor(private val dataStore: DataStore<Preferences>) {

    /**
     * A private object to hold the keys for the values stored in DataStore.
     */
    private object PreferencesKeys {
        val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
    }

    /**
     * A [Flow] that emits true if the onboarding process has been completed, and false otherwise.
     * Defaults to false if the value is not yet set in DataStore.
     */
    val onboardingCompleteFlow: Flow<Boolean> = dataStore.data
        .map { preferences ->
            preferences[PreferencesKeys.ONBOARDING_COMPLETE] ?: false
        }

    /**
     * Marks the onboarding process as complete by setting the corresponding
     * flag in DataStore to true.
     */
    suspend fun setOnboardingComplete() {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.ONBOARDING_COMPLETE] = true
        }
    }
}
