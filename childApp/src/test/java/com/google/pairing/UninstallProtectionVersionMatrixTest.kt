package com.google.pairing

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import com.google.pairing.testing.AndroidVersionMatrix
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever

/**
 * Kombinatorischer Versions-Sweep fuer die Uninstall-Protection-Policy.
 *
 * Ergaenzt MiniMasterDeviceAdminReceiverTest (4 handgeschriebene Faelle) um
 * eine automatische Matrix ueber alle relevanten API-Level. Das API-28-Gate
 * (Build.VERSION_CODES.P) wird damit an *jeder* Grenze geprueft statt nur an
 * zwei handverlesenen Punkten.
 *
 * Reiner JVM-Test (returnDefaultValues = true) – kein Emulator, kein
 * Robolectric noetig, laeuft direkt in der bestehenden CI.
 */
@RunWith(Parameterized::class)
class UninstallProtectionVersionMatrixTest(
    private val sdkInt: Int,
) {

    private val admin = ComponentName("com.google.pairing", "MiniMasterDeviceAdminReceiver")
    private val pkg = "com.google.pairing"

    private val isSupported: Boolean
        get() = sdkInt >= 28 // Build.VERSION_CODES.P

    @Test
    fun `enables protection only at and above API 28 when package is unblocked`() {
        val dpm: DevicePolicyManager = mock()
        whenever(dpm.isAdminActive(admin)).thenReturn(true)
        whenever(dpm.isUninstallBlocked(admin, pkg)).thenReturn(false)

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = pkg,
            sdkInt = sdkInt,
        )

        assertEquals(
            "API $sdkInt: protection-applied erwartet=$isSupported",
            isSupported,
            result,
        )
        if (isSupported) {
            verify(dpm).setUninstallBlocked(admin, pkg, true)
        } else {
            // Unter API 28 darf die Policy den DevicePolicyManager nicht anfassen.
            verify(dpm, never()).isAdminActive(any())
            verify(dpm, never()).setUninstallBlocked(any(), any(), any())
        }
    }

    @Test
    fun `never re-applies when uninstall already blocked`() {
        val dpm: DevicePolicyManager = mock()
        whenever(dpm.isAdminActive(admin)).thenReturn(true)
        whenever(dpm.isUninstallBlocked(admin, pkg)).thenReturn(true)

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = pkg,
            sdkInt = sdkInt,
        )

        assertFalse("API $sdkInt: bereits blockiert -> kein erneutes Setzen", result)
        verify(dpm, never()).setUninstallBlocked(any(), any(), any())
    }

    @Test
    fun `swallows security exception on every supported level`() {
        if (!isSupported) {
            // Unterhalb des Gates wird die Policy ohnehin nie scharf – nichts zu pruefen.
            return
        }
        val dpm: DevicePolicyManager = mock()
        whenever(dpm.isAdminActive(admin)).thenReturn(true)
        whenever(dpm.isUninstallBlocked(admin, pkg)).thenReturn(false)
        whenever(dpm.setUninstallBlocked(admin, pkg, true))
            .thenThrow(SecurityException("not owner"))

        val result = UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = pkg,
            sdkInt = sdkInt,
        )

        assertFalse("API $sdkInt: SecurityException muss geschluckt werden", result)
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "API {0}")
        fun apiLevels(): List<Array<Any>> =
            AndroidVersionMatrix.POLICY_BOUNDARY_API_LEVELS.map { arrayOf<Any>(it) }
    }
}
