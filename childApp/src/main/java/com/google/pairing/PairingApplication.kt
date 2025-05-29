package com.google.pairing // Das Package stimmt mit der bestehenden Struktur überein

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class PairingApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialisierungslogik für die App, falls vorhanden (aktuell nicht benötigt)
    }
}
