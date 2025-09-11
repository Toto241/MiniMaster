package com.minimaster.masterapp

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing the persistence of the master device's credentials (IMEI and secret key).
 *
 * This class uses Jetpack DataStore to securely and asynchronously store and retrieve the credentials.
 * It provides a Flow to observe credential changes and a suspend function to save them.
 *
 * @property dataStore The [DataStore] instance for accessing preferences, injected by Hilt.
 */
@Singleton
class MasterCredentialsRepository @Inject constructor(private val dataStore: DataStore<Preferences>) {

    /**
     * A private object to hold the keys for the values stored in DataStore.
     */
    private object PreferencesKeys {
        val MASTER_IMEI = stringPreferencesKey("master_imei")
        val SECRET_KEY = stringPreferencesKey("secret_key")
    }

    /**
     * A [Flow] that emits a [Pair] of the master IMEI and secret key.
     * It emits a new pair whenever the credentials change in the DataStore.
     * The values in the pair will be null if they have not been set.
     */
    val getCredentials: Flow<Pair<String?, String?>> = dataStore.data
        .map { preferences ->
            val imei = preferences[PreferencesKeys.MASTER_IMEI]
            val secret = preferences[PreferencesKeys.SECRET_KEY]
            imei to secret
        }

    /**
     * Saves the master device's IMEI and secret key to DataStore.
     *
     * @param imei The unique identifier of the master device.
     * @param secretKey The secret key associated with the master device.
     */
    suspend fun saveCredentials(imei: String, secretKey: String) {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.MASTER_IMEI] = imei
            preferences[PreferencesKeys.SECRET_KEY] = secretKey
        }
    }
}
