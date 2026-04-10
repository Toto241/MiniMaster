package com.google.pairing

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing the persistence of the child device's unique ID.
 *
 * This class uses Jetpack DataStore to securely and asynchronously store and retrieve
 * the child ID. Hilt provides the [DataStore] instance, ensuring a single source of
 * persisted data.
 *
 * @property dataStore The [DataStore] instance for accessing preferences, injected by Hilt.
 */
@Singleton
class ChildIdRepository @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    @ApplicationContext private val context: Context
) {
    /**
     * Saves the provided child ID to DataStore. This is a suspend function,
     * ensuring it is called from a coroutine and does not block the main thread.
     *
     * @param id The unique identifier of the child device to save.
     */
    suspend fun saveChildId(id: String) {
        ChildIdentityStorage.persistChildId(context, id, dataStore)
    }

    /**
     * Retrieves the child ID from DataStore as a [Flow].
     *
     * The returned Flow will emit the stored child ID, or null if it has not been set.
     * It will also emit a new value whenever the child ID changes.
     *
     * @return A [Flow] that emits the child ID string, or null if not present.
     */
    fun getChildId(): Flow<String?> {
        return dataStore.data.map { preferences ->
            preferences[androidx.datastore.preferences.core.stringPreferencesKey("child_id")]
                ?: ChildIdentityStorage.readChildId(context, dataStore)
        }
    }
}
