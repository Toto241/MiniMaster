package com.google.pairing

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.os.Build
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

class MiniMasterDeviceAdminReceiverTest {

    private val admin = ComponentName("com.google.pairing", "MiniMasterDeviceAdminReceiver")

    @Test
    fun `apply enables uninstall protection when admin is active and package is not blocked`() {
        val dpm: DevicePolicyManager = mock()
        whenever(dpm.isAdminActive(admin)).thenReturn(true)
        whenever(dpm.isUninstallBlocked(admin, "com.google.pairing")).thenReturn(false)

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = "com.google.pairing",
            sdkInt = Build.VERSION_CODES.P,
        )

        assertTrue(result)
        verify(dpm).setUninstallBlocked(admin, "com.google.pairing", true)
    }

    @Test
    fun `apply skips when uninstall protection is already active`() {
        val dpm: DevicePolicyManager = mock()
        whenever(dpm.isAdminActive(admin)).thenReturn(true)
        whenever(dpm.isUninstallBlocked(admin, "com.google.pairing")).thenReturn(true)

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = "com.google.pairing",
            sdkInt = Build.VERSION_CODES.P,
        )

        assertFalse(result)
        verify(dpm, never()).setUninstallBlocked(any(), any(), any())
    }

    @Test
    fun `apply skips below Android P`() {
        val dpm: DevicePolicyManager = mock()

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = "com.google.pairing",
            sdkInt = Build.VERSION_CODES.O_MR1,
        )

        assertFalse(result)
        verify(dpm, never()).isAdminActive(any())
    }

    @Test
    fun `apply swallows security exception when owner privileges are missing`() {
        val dpm: DevicePolicyManager = mock()
        whenever(dpm.isAdminActive(admin)).thenReturn(true)
        whenever(dpm.isUninstallBlocked(admin, "com.google.pairing")).thenReturn(false)
        whenever(dpm.setUninstallBlocked(eq(admin), eq("com.google.pairing"), eq(true)))
            .thenThrow(SecurityException("not owner"))

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = "com.google.pairing",
            sdkInt = Build.VERSION_CODES.P,
        )

        assertFalse(result)
    }
}
