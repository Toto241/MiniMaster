package com.minimaster.masterapp

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import dagger.hilt.android.qualifiers.ApplicationContext
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
class MasterCredentialsRepository @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    @ApplicationContext private val context: Context
) {

    /**
     * A private object to hold the keys for the values stored in DataStore.
     */
    private object PreferencesKeys {
        val MASTER_IMEI = stringPreferencesKey("master_imei")
        val SECRET_KEY = stringPreferencesKey("secret_key")
    }

    private val secureStore by lazy { MasterCredentialSecureStoreFactory.create(context) }

    /**
     * A [Flow] that emits a [Pair] of the master IMEI and secret key.
     * It emits a new pair whenever the credentials change in the DataStore.
     * The values in the pair will be null if they have not been set.
     */
    val getCredentials: Flow<Pair<String?, String?>> = dataStore.data
        .map { preferences ->
            val imei = preferences[PreferencesKeys.MASTER_IMEI]
                ?: secureStore.getString("master_imei")
            val secret = preferences[PreferencesKeys.SECRET_KEY]
                ?: secureStore.getString("secret_key")
            imei to secret
        }

    /**
     * Saves the master device's IMEI and secret key to DataStore.
     *
     * @param imei The unique identifier of the master device.
     * @param secretKey The secret key associated with the master device.
     */
    suspend fun saveCredentials(imei: String, secretKey: String) {
        secureStore.putCredentials(imei, secretKey)

        dataStore.edit { preferences ->
            preferences[PreferencesKeys.MASTER_IMEI] = imei
            preferences[PreferencesKeys.SECRET_KEY] = secretKey
        }
    }
}

internal interface MasterCredentialSecureStore {
    fun getString(key: String): String?
    fun putCredentials(imei: String, secretKey: String)
}

internal object MasterCredentialSecureStoreFactory {
    @Volatile
    var create: (Context) -> MasterCredentialSecureStore = { context ->
        defaultMasterCredentialSecureStore(context)
    }
}

internal fun defaultMasterCredentialSecureStore(context: Context): MasterCredentialSecureStore =
    EncryptedSharedPreferencesSecureStore(context)

private class EncryptedSharedPreferencesSecureStore(context: Context) : MasterCredentialSecureStore {
    private val encryptedPrefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "master_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun getString(key: String): String? = encryptedPrefs.getString(key, null)

    override fun putCredentials(imei: String, secretKey: String) {
        encryptedPrefs.edit()
            .putString("master_imei", imei)
            .putString("secret_key", secretKey)
            .apply()
    }
}
