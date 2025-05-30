package com.google.pairing

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
// Remove preferencesDataStore import if Context.dataStore extension is no longer used directly here
// import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

// The Context.dataStore extension might be removed if DataStore is always injected by Hilt.
// However, if AppModule uses it, it can remain. For this class, it's no longer directly used.
// val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "child_prefs") // Keep if AppModule uses this way

@Singleton // Optional: If you want Hilt to manage it as a singleton across other possible injections.
           // AppModule already provides it as a Singleton, so this might be redundant here
           // unless ChildIdRepository itself is injected elsewhere and needs to be a singleton.
           // For constructor injection where AppModule provides DataStore, this isn't strictly necessary on the class itself.
class ChildIdRepository @Inject constructor(
    private val dataStore: DataStore<Preferences> // Injected by Hilt
) {

    private object PreferencesKeys {
        val CHILD_ID = stringPreferencesKey("child_id")
    }

    suspend fun saveChildId(id: String) {
        dataStore.edit { preferences -> // Use the injected dataStore instance
            preferences[PreferencesKeys.CHILD_ID] = id
        }
    }

    fun getChildId(): Flow<String?> {
        return dataStore.data.map { preferences -> // Use the injected dataStore instance
            preferences[PreferencesKeys.CHILD_ID]
        }
    }
}
