package com.google.pairing.testing

import android.os.Build

/**
 * Zentrale Android-Versions-Matrix fuer kombinatorische JVM-Tests.
 *
 * Spiegelt qa/catalog/android-version-matrix.json (API 29-36) und ergaenzt die
 * aelteren Schwellen-Level (API 24-28), an denen versionsabhaengige Features
 * ihr Verhalten wechseln. Test-Klassen nutzen diese Listen als @Parameters
 * (reine JVM-Tests) oder als @Config(sdk = [...]) (Robolectric), damit alle
 * versionsabhaengigen Pfade ueber eine *einzige* gepflegte Quelle laufen.
 *
 * Wenn die Katalog-Matrix waechst, hier mitpflegen – dann erweitern sich alle
 * parametrisierten Tests automatisch.
 */
object AndroidVersionMatrix {

    /** API-Level der QA-Katalog-Matrix (Android 10-16). */
    val CATALOG_API_LEVELS: List<Int> = listOf(29, 30, 31, 33, 34, 35, 36)

    /**
     * Schwellen-Level, an denen sicherheitskritische Features ihr Verhalten
     * wechseln. Enthaelt bewusst die Grenzen O (26), O_MR1 (27), P (28) sowie
     * die Katalog-Level, damit Pre/Post-Boundary-Verhalten getestet wird.
     */
    val POLICY_BOUNDARY_API_LEVELS: List<Int> =
        (listOf(24, 26, 27, 28) + CATALOG_API_LEVELS).distinct().sorted()

    /**
     * Hoechstes von Robolectric 4.13 unterstuetztes API-Level. SDKs darueber
     * koennen nicht im JVM-Framework simuliert werden und werden fuer
     * @Config-basierte Tests herausgefiltert.
     */
    const val MAX_ROBOLECTRIC_SDK: Int = Build.VERSION_CODES.UPSIDE_DOWN_CAKE // 34

    /** Robolectric-fahige Teilmenge der Schwellen-Level. */
    fun robolectricBoundaryLevels(): IntArray =
        POLICY_BOUNDARY_API_LEVELS.filter { it <= MAX_ROBOLECTRIC_SDK }.toIntArray()
}
