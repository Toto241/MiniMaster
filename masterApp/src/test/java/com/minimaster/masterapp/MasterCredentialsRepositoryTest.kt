package com.minimaster.masterapp

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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
        MasterCredentialSecureStoreFactory.create = { secureStore }

        val repository = MasterCredentialsRepository(
            dataStore = createDataStore("saveCredentials"),
            context = mock<Context>(),
        )

        repository.saveCredentials("imei-123", "secret-456")

        assertEquals("imei-123", secureStore.values["master_imei"])
        assertEquals("secret-456", secureStore.values["secret_key"])
        assertEquals("imei-123" to "secret-456", repository.getCredentials.first())
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
