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
    fun `saveMasterId persists master id to secure store`() = runTest {
        val secureStore = FakeSecureStore()
        val dataStore = createDataStore("saveMasterId")
        MasterCredentialSecureStoreFactory.create = { secureStore }

        val repository = MasterCredentialsRepository(
            dataStore = dataStore,
            context = mock<Context>(),
        )

        repository.saveMasterId("master-123")

        assertEquals("master-123", secureStore.values["master_imei"])
        assertNull(secureStore.values["secret_key"])
        assertEquals("master-123", repository.getMasterId.first())
        assertNull(readPlaintextValue(dataStore, "master_imei"))
    }

    @Test
    fun `getMasterId falls back to secure store when datastore is empty`() = runTest {
        val secureStore = FakeSecureStore(
            mutableMapOf(
                "master_imei" to "master-fallback",
            )
        )
        MasterCredentialSecureStoreFactory.create = { secureStore }

        val repository = MasterCredentialsRepository(
            dataStore = createDataStore("fallbackMasterId"),
            context = mock<Context>(),
        )

        assertEquals("master-fallback", repository.getMasterId.first())
    }

    @Test
    fun `getMasterId reads legacy plaintext master id until save migrates it`() = runTest {
        val secureStore = FakeSecureStore()
        val dataStore = createDataStore("legacyMasterId")
        MasterCredentialSecureStoreFactory.create = { secureStore }

        dataStore.edit { preferences ->
            preferences[stringPreferencesKey("master_imei")] = "master-legacy"
        }

        val repository = MasterCredentialsRepository(
            dataStore = dataStore,
            context = mock<Context>(),
        )

        assertEquals("master-legacy", repository.getMasterId.first())
    }

    @Test
    fun `getMasterId purges legacy secret key from secure store`() = runTest {
        val secureStore = FakeSecureStore(
            mutableMapOf(
                "master_imei" to "master-secure",
                "secret_key" to "legacy-secret",
            )
        )
        MasterCredentialSecureStoreFactory.create = { secureStore }

        val repository = MasterCredentialsRepository(
            dataStore = createDataStore("purgeSecretKey"),
            context = mock<Context>(),
        )

        assertEquals("master-secure", repository.getMasterId.first())
        assertNull(secureStore.values["secret_key"])
    }

    @Test
    fun `getMasterId returns null when neither datastore nor secure store has values`() = runTest {
        MasterCredentialSecureStoreFactory.create = { FakeSecureStore() }

        val repository = MasterCredentialsRepository(
            dataStore = createDataStore("emptyMasterId"),
            context = mock<Context>(),
        )

        assertNull(repository.getMasterId.first())
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

        override fun putMasterId(masterId: String) {
            values["master_imei"] = masterId
        }

        override fun purgeLegacySecretKey() {
            values.remove("secret_key")
        }
    }
}
