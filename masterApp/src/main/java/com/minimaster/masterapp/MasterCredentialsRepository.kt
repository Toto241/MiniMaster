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
 * Repository for persisting the registered master device identifier.
 *
 * Phase 2 auth migration: only the canonical masterId is stored locally.
 * Legacy secretKey values are purged on read.
 */
@Singleton
class MasterCredentialsRepository @Inject constructor(
    private val dataStore: DataStore<Preferences>,
    @ApplicationContext private val context: Context
) {
    private object PreferencesKeys {
        val MASTER_IMEI = stringPreferencesKey("master_imei")
    }

    private val secureStore by lazy { MasterCredentialSecureStoreFactory.create(context) }

    val getMasterId: Flow<String?> = dataStore.data
        .map { preferences ->
            secureStore.purgeLegacySecretKey()
            val secureMasterId = secureStore.getString("master_imei")
            val legacyMasterId = preferences[PreferencesKeys.MASTER_IMEI]
            (secureMasterId ?: legacyMasterId)?.takeIf { it.isNotBlank() }
        }

    suspend fun saveMasterId(masterId: String) {
        secureStore.putMasterId(masterId)
        secureStore.purgeLegacySecretKey()

        dataStore.edit { preferences ->
            preferences.remove(PreferencesKeys.MASTER_IMEI)
        }
    }
}

internal interface MasterCredentialSecureStore {
    fun getString(key: String): String?
    fun putMasterId(masterId: String)
    fun purgeLegacySecretKey()
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

    override fun putMasterId(masterId: String) {
        encryptedPrefs.edit()
            .putString("master_imei", masterId)
            .apply()
    }

    override fun purgeLegacySecretKey() {
        if (encryptedPrefs.contains("secret_key")) {
            encryptedPrefs.edit().remove("secret_key").apply()
        }
    }
}
