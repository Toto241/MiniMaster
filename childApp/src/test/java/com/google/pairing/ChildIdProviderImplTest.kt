package com.google.pairing

import androidx.test.core.app.ApplicationProvider
import androidx.datastore.preferences.core.edit
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ChildIdProviderImplTest {

    private lateinit var provider: ChildIdProviderImpl

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.getSharedPreferences("MiniMasterPrefs", android.content.Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        context.getSharedPreferences("child_prefs", android.content.Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        runBlocking {
            context.childIdentityDataStore.edit { preferences -> preferences.clear() }
        }
        provider = ChildIdProviderImpl(context)
    }

    @Test
    fun setChildId_persists_and_reports_presence() {
        provider.setChildId("child-123")

        assertTrue(provider.hasChildId())
        assertEquals("child-123", provider.getChildId())
    }

    @Test
    fun clearChildId_removes_saved_value() {
        provider.setChildId("child-123")

        provider.clearChildId()

        assertFalse(provider.hasChildId())
        assertEquals("", provider.getChildId())
    }
}
