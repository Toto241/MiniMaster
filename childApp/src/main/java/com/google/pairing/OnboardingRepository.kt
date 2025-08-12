package com.google.pairing

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OnboardingRepository @Inject constructor(private val dataStore: DataStore<Preferences>) {

    private object PreferencesKeys {
        val ONBOARDING_COMPLETE = booleanPreferencesKey("onboarding_complete")
    }

    /**
     * A flow that emits true if the onboarding process has been completed, false otherwise.
     */
    val onboardingCompleteFlow: Flow<Boolean> = dataStore.data
        .map { preferences ->
            preferences[PreferencesKeys.ONBOARDING_COMPLETE] ?: false
        }

    /**
     * Marks the onboarding process as complete.
     */
    suspend fun setOnboardingComplete() {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.ONBOARDING_COMPLETE] = true
        }
    }
}
