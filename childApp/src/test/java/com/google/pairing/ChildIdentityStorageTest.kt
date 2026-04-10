package com.google.pairing

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class ChildIdentityStorageTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        runBlocking {
            context = ApplicationProvider.getApplicationContext()
            context.getSharedPreferences("MiniMasterPrefs", Context.MODE_PRIVATE).edit().clear().commit()
            context.getSharedPreferences("child_prefs", Context.MODE_PRIVATE).edit().clear().commit()
            context.getSharedPreferences("child_identity", Context.MODE_PRIVATE).edit().clear().commit()
            context.childIdentityDataStore.edit { preferences -> preferences.clear() }
        }
    }

    @Test
    fun migrateLegacyMiniMasterPrefs_movesChildIdIntoDataStoreAndClearsLegacyPrefs() = runTest {
        context.getSharedPreferences("MiniMasterPrefs", Context.MODE_PRIVATE)
            .edit()
            .putString("child_id", "child-legacy")
            .commit()

        val migrated = ChildIdentityStorage.readChildId(context)

        assertEquals("child-legacy", migrated)
        assertEquals("child-legacy", ChildIdentityStorage.readChildId(context))
        assertFalse(context.getSharedPreferences("MiniMasterPrefs", Context.MODE_PRIVATE).contains("child_id"))
    }

    @Test
    fun migrateLegacyChildPrefs_movesRuntimeChildIdIntoDataStoreAndClearsLegacyPrefs() = runTest {
        context.getSharedPreferences("child_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("child_id", "child-runtime")
            .commit()

        val migrated = ChildIdentityStorage.readChildId(context)

        assertEquals("child-runtime", migrated)
        assertFalse(context.getSharedPreferences("child_prefs", Context.MODE_PRIVATE).contains("child_id"))
    }

    @Test
    fun stableChildId_isGeneratedOnceAndPersisted() {
        val stableId = ChildIdentityStorage.getOrCreateStableChildId(context)
        val stableIdAgain = ChildIdentityStorage.getOrCreateStableChildId(context)

        assertTrue(stableId.isNotBlank())
        assertEquals(stableId, stableIdAgain)
        assertNotEquals("9774d56d682e549c", stableId)
    }
}