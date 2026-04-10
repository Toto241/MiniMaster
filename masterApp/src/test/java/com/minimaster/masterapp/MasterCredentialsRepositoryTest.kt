package com.minimaster.masterapp

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.mockito.kotlin.mock
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class MasterCredentialsRepositoryTest {

    @After
    fun tearDown() {
        MasterCredentialSecureStoreFactory.create = ::defaultMasterCredentialSecureStore
    }

    @Test
    fun `saveCredentials persists values to secure store and datastore`() = runTest {
        val secureStore = FakeSecureStore()
        val dataStore = createDataStore("saveCredentials")
        MasterCredentialSecureStoreFactory.create = { secureStore }

        val repository = MasterCredentialsRepository(
            dataStore = dataStore,
            context = mock<Context>(),
        )

        repository.saveCredentials("imei-123", "secret-456")

        assertEquals("imei-123", secureStore.values["master_imei"])
        assertEquals("secret-456", secureStore.values["secret_key"])
        assertEquals("imei-123" to "secret-456", repository.getCredentials.first())
        assertNull(readPlaintextValue(dataStore, "master_imei"))
        assertNull(readPlaintextValue(dataStore, "secret_key"))
    }

    @Test
    fun `getCredentials falls back to secure store when datastore is empty`() = runTest {
        val secureStore = FakeSecureStore(
            mutableMapOf(
                "master_imei" to "imei-fallback",
                "secret_key" to "secret-fallback",
            )
        )
        MasterCredentialSecureStoreFactory.create = { secureStore }

        val repository = MasterCredentialsRepository(
            dataStore = createDataStore("fallbackCredentials"),
            context = mock<Context>(),
        )

        assertEquals("imei-fallback" to "secret-fallback", repository.getCredentials.first())
    }

    @Test
    fun `getCredentials migrates legacy plaintext credentials into secure store and clears datastore`() = runTest {
        val secureStore = FakeSecureStore()
        val dataStore = createDataStore("migrateLegacyCredentials")
        MasterCredentialSecureStoreFactory.create = { secureStore }

        dataStore.edit { preferences ->
            preferences[stringPreferencesKey("master_imei")] = "imei-legacy"
            preferences[stringPreferencesKey("secret_key")] = "secret-legacy"
        }

        val repository = MasterCredentialsRepository(
            dataStore = dataStore,
            context = mock<Context>(),
        )

        assertEquals("imei-legacy" to "secret-legacy", repository.getCredentials.first())
        assertEquals("imei-legacy", secureStore.values["master_imei"])
        assertEquals("secret-legacy", secureStore.values["secret_key"])
        assertNull(readPlaintextValue(dataStore, "master_imei"))
        assertNull(readPlaintextValue(dataStore, "secret_key"))
    }

    @Test
    fun `getCredentials prefers secure store over legacy plaintext and still clears plaintext`() = runTest {
        val secureStore = FakeSecureStore(
            mutableMapOf(
                "master_imei" to "imei-secure",
                "secret_key" to "secret-secure",
            )
        )
        val dataStore = createDataStore("preferSecureStore")
        MasterCredentialSecureStoreFactory.create = { secureStore }

        dataStore.edit { preferences ->
            preferences[stringPreferencesKey("master_imei")] = "imei-legacy"
            preferences[stringPreferencesKey("secret_key")] = "secret-legacy"
        }

        val repository = MasterCredentialsRepository(
            dataStore = dataStore,
            context = mock<Context>(),
        )

        assertEquals("imei-secure" to "secret-secure", repository.getCredentials.first())
        assertNull(readPlaintextValue(dataStore, "master_imei"))
        assertNull(readPlaintextValue(dataStore, "secret_key"))
    }

    @Test
    fun `getCredentials returns nulls when neither datastore nor secure store has values`() = runTest {
        MasterCredentialSecureStoreFactory.create = { FakeSecureStore() }

        val repository = MasterCredentialsRepository(
            dataStore = createDataStore("emptyCredentials"),
            context = mock<Context>(),
        )

        val credentials = repository.getCredentials.first()
        assertNull(credentials.first)
        assertNull(credentials.second)
    }

    private fun createDataStore(name: String) = PreferenceDataStoreFactory.create(
        produceFile = {
            File(System.getProperty("java.io.tmpdir"), "minimaster-$name.preferences_pb").apply {
                parentFile?.mkdirs()
            }
        }
    )

    private suspend fun readPlaintextValue(dataStore: androidx.datastore.core.DataStore<androidx.datastore.preferences.core.Preferences>, key: String): String? {
        return dataStore.data.first()[stringPreferencesKey(key)]
    }

    private class FakeSecureStore(
        val values: MutableMap<String, String> = mutableMapOf()
    ) : MasterCredentialSecureStore {
        override fun getString(key: String): String? = values[key]

        override fun putCredentials(imei: String, secretKey: String) {
            values["master_imei"] = imei
            values["secret_key"] = secretKey
        }
    }
}
