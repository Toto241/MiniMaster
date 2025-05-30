package com.google.pairing // Package stimmt mit der Struktur überein

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner
import dagger.hilt.android.testing.HiltTestApplication

// Ein benutzerdefinierter Runner wird benötigt, um Hilt in Android-Tests zu verwenden.
class HiltTestRunner : AndroidJUnitRunner() {
    override fun newApplication(
        cl: ClassLoader?,
        className: String?,
        context: Context?
    ): Application {
        // HiltTestApplication wird anstelle deiner echten Application-Klasse in Tests verwendet.
        return super.newApplication(cl, HiltTestApplication::class.java.name, context)
    }
}
