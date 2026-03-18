package com.google.pairing

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class ChildIdProviderImplTest {

    private lateinit var provider: ChildIdProviderImpl

    @Before
    fun setUp() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        context.getSharedPreferences("MiniMasterPrefs", android.content.Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
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
