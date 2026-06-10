package com.google.pairing

import android.os.Build
import android.view.WindowManager
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Kombinatorischer Versions-Sweep fuer die Blocking-Overlay-Fenstertyp-Auswahl.
 *
 * BlockingOverlayService.createOverlayLayoutParams() liest Build.VERSION.SDK_INT
 * direkt: ab API 26 (O) muss TYPE_APPLICATION_OVERLAY (2038) verwendet werden,
 * darunter der veraltete TYPE_PHONE (2002). Robolectric fuehrt jede @Test-Methode
 * einmal pro @Config(sdk = ...) aus und setzt dabei das echte Framework-SDK_INT.
 *
 * Die sdk-Liste spiegelt AndroidVersionMatrix.robolectricBoundaryLevels()
 * (Annotationen brauchen Compile-Konstanten, daher hier dupliziert). Robolectric
 * 4.13 unterstuetzt maximal API 34 – hoehere Katalog-Level (35/36) werden auf
 * Emulatoren in der CI-Matrix (E3) abgedeckt.
 */
@RunWith(RobolectricTestRunner::class)
class BlockingOverlayVersionMatrixTest {

    @Test
    @Config(sdk = [24, 26, 27, 28, 29, 30, 31, 33, 34])
    fun `overlay window type switches at API 26`() {
        val params = BlockingOverlayService.createOverlayLayoutParams()

        // Konkrete Oracle-Werte statt Spiegelung der Implementierung:
        // TYPE_APPLICATION_OVERLAY = 2038, TYPE_PHONE = 2002.
        val expectedType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            2038
        } else {
            2002
        }

        assertEquals(
            "API ${Build.VERSION.SDK_INT}: falscher Overlay-Fenstertyp",
            expectedType,
            params.type,
        )
        assertEquals(WindowManager.LayoutParams.MATCH_PARENT, params.width)
        assertEquals(WindowManager.LayoutParams.MATCH_PARENT, params.height)
    }
}
