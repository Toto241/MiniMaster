package com.google.pairing

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "child_prefs")

class ChildIdRepository(private val context: Context) {

    private object PreferencesKeys {
        val CHILD_ID = stringPreferencesKey("child_id")
    }

    suspend fun saveChildId(id: String) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.CHILD_ID] = id
        }
    }

    fun getChildId(): Flow<String?> {
        return context.dataStore.data.map { preferences ->
            preferences[PreferencesKeys.CHILD_ID]
        }
    }
}
