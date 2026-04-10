package com.google.pairing

import android.content.Context
import android.provider.Settings
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.util.UUID
import kotlinx.coroutines.flow.first

private const val CHILD_SETTINGS_DATASTORE_NAME = "child_settings"
private const val LEGACY_CHILD_ID_PREFS = "MiniMasterPrefs"
private const val LEGACY_CHILD_RUNTIME_PREFS = "child_prefs"
private const val CHILD_IDENTITY_PREFS = "child_identity"
private const val CHILD_ID_KEY_NAME = "child_id"
private const val STABLE_CHILD_ID_KEY_NAME = "stable_child_id"

val Context.childIdentityDataStore: DataStore<Preferences> by preferencesDataStore(name = CHILD_SETTINGS_DATASTORE_NAME)

internal object ChildIdentityStorage {
    private val childIdKey = stringPreferencesKey(CHILD_ID_KEY_NAME)

    suspend fun readChildId(
        context: Context,
        dataStore: DataStore<Preferences> = context.applicationContext.childIdentityDataStore
    ): String? {
        val persisted = dataStore.data.first()[childIdKey]
        if (!persisted.isNullOrBlank()) {
            clearLegacyChildId(context)
            return persisted
        }
        return migrateLegacyChildId(context, dataStore)
    }

    suspend fun persistChildId(
        context: Context,
        childId: String,
        dataStore: DataStore<Preferences> = context.applicationContext.childIdentityDataStore
    ) {
        dataStore.edit { preferences ->
            preferences[childIdKey] = childId
        }
        clearLegacyChildId(context)
    }

    suspend fun clearChildId(
        context: Context,
        dataStore: DataStore<Preferences> = context.applicationContext.childIdentityDataStore
    ) {
        dataStore.edit { preferences ->
            preferences.remove(childIdKey)
        }
        clearLegacyChildId(context)
    }

    fun getOrCreateStableChildId(context: Context): String {
        val prefs = context.applicationContext.getSharedPreferences(CHILD_IDENTITY_PREFS, Context.MODE_PRIVATE)
        val cachedId = prefs.getString(STABLE_CHILD_ID_KEY_NAME, null)
        if (!cachedId.isNullOrBlank()) {
            return cachedId
        }

        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        val stableId = if (androidId.isNullOrBlank() || androidId == "9774d56d682e549c") {
            "child-${UUID.randomUUID()}"
        } else {
            "android-$androidId"
        }

        prefs.edit().putString(STABLE_CHILD_ID_KEY_NAME, stableId).apply()
        return stableId
    }

    private suspend fun migrateLegacyChildId(
        context: Context,
        dataStore: DataStore<Preferences>
    ): String? {
        val legacyChildId = listOf(
            context.applicationContext.getSharedPreferences(LEGACY_CHILD_ID_PREFS, Context.MODE_PRIVATE)
                .getString(CHILD_ID_KEY_NAME, null),
            context.applicationContext.getSharedPreferences(LEGACY_CHILD_RUNTIME_PREFS, Context.MODE_PRIVATE)
                .getString(CHILD_ID_KEY_NAME, null),
        ).firstOrNull { !it.isNullOrBlank() }

        if (legacyChildId.isNullOrBlank()) {
            return null
        }

        dataStore.edit { preferences ->
            preferences[childIdKey] = legacyChildId
        }
        clearLegacyChildId(context)
        return legacyChildId
    }

    private fun clearLegacyChildId(context: Context) {
        context.applicationContext.getSharedPreferences(LEGACY_CHILD_ID_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(CHILD_ID_KEY_NAME)
            .apply()
        context.applicationContext.getSharedPreferences(LEGACY_CHILD_RUNTIME_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(CHILD_ID_KEY_NAME)
            .apply()
    }
}