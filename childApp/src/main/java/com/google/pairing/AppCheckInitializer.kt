package com.google.pairing

import android.app.Application
import com.google.firebase.FirebaseApp
import com.google.firebase.appcheck.FirebaseAppCheck
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory

/**
 * Firebase App Check Initializer
 * 
 * This class initializes Firebase App Check to protect backend resources from abuse.
 * 
 * To enable App Check:
 * 1. Add the dependency to build.gradle:
 *    implementation 'com.google.firebase:firebase-appcheck-playintegrity:17.1.1'
 * 
 * 2. Call this function in your Application class or MainActivity:
 *    AppCheckInitializer.initialize(this)
 * 
 * 3. Enable App Check in Firebase Console:
 *    - Go to Build > App Check
 *    - Register your app
 *    - Select Play Integrity as the provider
 * 
 * For more details, see docs/FIREBASE_APP_CHECK_SETUP.md
 */
object AppCheckInitializer {
    
    fun initialize(application: Application) {
        // Initialize Firebase
        FirebaseApp.initializeApp(application)
        
        // Get Firebase App Check instance
        val firebaseAppCheck = FirebaseAppCheck.getInstance()
        
        // Install Play Integrity provider
        firebaseAppCheck.installAppCheckProviderFactory(
            PlayIntegrityAppCheckProviderFactory.getInstance()
        )
        
        // For debug builds, you can use the debug provider:
        // if (BuildConfig.DEBUG) {
        //     firebaseAppCheck.installAppCheckProviderFactory(
        //         DebugAppCheckProviderFactory.getInstance()
        //     )
        // }
    }
}
