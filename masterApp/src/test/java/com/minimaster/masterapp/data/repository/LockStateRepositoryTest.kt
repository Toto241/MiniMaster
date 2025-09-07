package com.minimaster.masterapp.data.repository

import org.junit.Assert.assertEquals
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import kotlinx.coroutines.test.runTest

class LockStateRepositoryTest {
    private val api: DeviceApi = mock()
    private val repo = LockStateRepository(api)

    @Test
    fun `setLocked returns true on success`() = runTest {
        whenever(api.setLocked("IMEI", true)).thenReturn(true)
        val result = repo.setLocked("IMEI", true)
        assertEquals(true, result)
    }

    @Test
    fun `setLocked returns false on failure`() = runTest {
        whenever(api.setLocked("IMEI", false)).thenReturn(false)
        val result = repo.setLocked("IMEI", false)
        assertEquals(false, result)
    }
}

// Mock classes for testing
class DeviceApi {
    suspend fun setLocked(imei: String, locked: Boolean): Boolean {
        // This would be implemented in the actual repository
        return true
    }
}

class LockStateRepository(private val api: DeviceApi) {
    suspend fun setLocked(imei: String, locked: Boolean): Boolean {
        return api.setLocked(imei, locked)
    }
}