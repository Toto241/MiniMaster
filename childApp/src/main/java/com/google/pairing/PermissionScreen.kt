package com.google.pairing

import android.content.Context
import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.Checkbox
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.pairing.child.MiniMasterAccessibilityService

/**
 * A Composable screen that informs the user about the need for the Accessibility Service
 * permission and provides a button to open the relevant system settings.
 *
 * This screen is a critical part of the onboarding flow after the device has been paired.
 * The Accessibility Service is essential for the app's core functionality of monitoring
 * and blocking other applications.
 *
 * @param onPermissionGranted A callback function invoked only after the user confirms
 * they enabled the accessibility service and the app can verify it is enabled.
 */
@Composable
fun PermissionScreen(onPermissionGranted: () -> Unit) {
    val context = LocalContext.current
    var disclosureAccepted by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = stringResource(R.string.permission_title),
            style = MaterialTheme.typography.h4,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = stringResource(R.string.permission_disclosure_body),
            style = MaterialTheme.typography.body1,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(24.dp))

        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Checkbox(
                checked = disclosureAccepted,
                onCheckedChange = { disclosureAccepted = it }
            )
            Text(
                text = stringResource(R.string.permission_disclosure_consent),
                style = MaterialTheme.typography.body2
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = {
            openAccessibilitySettings(context)
            statusMessage = context.getString(R.string.permission_status_opened_settings)
        }, enabled = disclosureAccepted) {
            Text(stringResource(R.string.permission_open_settings))
        }

        Spacer(modifier = Modifier.height(12.dp))

        Button(onClick = {
            if (isAccessibilityServiceEnabled(context)) {
                onPermissionGranted()
            } else {
                statusMessage = context.getString(R.string.permission_status_not_enabled)
            }
        }, enabled = disclosureAccepted) {
            Text(stringResource(R.string.permission_confirm_enabled))
        }

        statusMessage?.let {
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = it,
                style = MaterialTheme.typography.body2,
                textAlign = TextAlign.Center
            )
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

/**
 * Checks whether MiniMaster accessibility service is enabled in system settings.
 */
private fun isAccessibilityServiceEnabled(context: Context): Boolean {
    val enabledServices = Settings.Secure.getString(
        context.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false

    val expectedService = "${context.packageName}/${MiniMasterAccessibilityService::class.java.name}"
    return enabledServices
        .split(':')
        .any { it.equals(expectedService, ignoreCase = true) }
}
