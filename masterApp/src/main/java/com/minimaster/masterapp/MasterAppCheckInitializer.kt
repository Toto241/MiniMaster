package com.minimaster.masterapp

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

/**
 * Initializes Firebase App Check for the master app so authenticated callable
 * function traffic can be verified by backend App Check enforcement.
 */
object MasterAppCheckInitializer {

    fun initialize(application: Application) {
        FirebaseApp.initializeApp(application)

        val firebaseAppCheck = FirebaseAppCheck.getInstance()
        firebaseAppCheck.installAppCheckProviderFactory(
            PlayIntegrityAppCheckProviderFactory.getInstance()
        )
    }
}
