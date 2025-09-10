package com.google.pairing

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * A Composable screen that informs the user about the need for the Accessibility Service
 * permission and provides a button to open the relevant system settings.
 *
 * This screen is a critical part of the onboarding flow after the device has been paired.
 * The Accessibility Service is essential for the app's core functionality of monitoring
 * and blocking other applications.
 *
 * @param onPermissionGranted A callback function that is invoked when the user clicks the
 * button to open settings. In the current implementation, this optimistically assumes
 * the user will grant the permission and proceeds with the onboarding flow. A more robust
 * solution would involve checking the permission status after returning from settings.
 */
@Composable
fun PermissionScreen(onPermissionGranted: () -> Unit) {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "Important Permission Needed",
            style = MaterialTheme.typography.h4,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "To protect you and enforce the rules set by your parents, this app needs special 'Accessibility' access. This allows the app to see which apps you are using and block them if necessary.",
            style = MaterialTheme.typography.body1,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(32.dp))
        Button(onClick = {
            openAccessibilitySettings(context)
            // This callback proceeds with the onboarding flow. A better implementation
            // would listen for the service being enabled before calling this.
            onPermissionGranted()
        }) {
            Text("Open Settings")
        }
    }
}

/**
 * Opens the system's Accessibility settings screen.
 * @param context The context from which to launch the intent.
 */
private fun openAccessibilitySettings(context: Context) {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    context.startActivity(intent)
}
