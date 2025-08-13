package com.minimaster.masterapp

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MasterCredentialsRepository @Inject constructor(private val dataStore: DataStore<Preferences>) {

    private object PreferencesKeys {
        val MASTER_IMEI = stringPreferencesKey("master_imei")
        val SECRET_KEY = stringPreferencesKey("secret_key")
    }

    val getCredentials: Flow<Pair<String?, String?>> = dataStore.data
        .map { preferences ->
            val imei = preferences[PreferencesKeys.MASTER_IMEI]
            val secret = preferences[PreferencesKeys.SECRET_KEY]
            imei to secret
        }

    suspend fun saveCredentials(imei: String, secretKey: String) {
        dataStore.edit { preferences ->
            preferences[PreferencesKeys.MASTER_IMEI] = imei
            preferences[PreferencesKeys.SECRET_KEY] = secretKey
        }
    }
}
