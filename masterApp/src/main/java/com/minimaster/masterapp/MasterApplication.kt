package com.minimaster.masterapp

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

/**
 * The main [Application] class for the Master App.
 *
 * Its primary purpose is to be annotated with [@HiltAndroidApp] to enable
 * field injection in Android components and to set up the Hilt dependency graph.
 */
@HiltAndroidApp
class MasterApplication : Application() {
	override fun onCreate() {
		applySavedMasterLocale(this)
		super.onCreate()
		MasterAppCheckInitializer.initialize(this)
	}
}
