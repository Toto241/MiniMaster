package com.minimaster.masterapp

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.telephony.TelephonyManager
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.MaterialTheme
import androidx.compose.material.Surface
import androidx.compose.material.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MasterAppScreen()
        }
    }
}

@Composable
fun MasterAppScreen() {
    val context = LocalContext.current
    var imeiState by remember { mutableStateOf("Press button to request IMEI permission.") }

    val requestPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            imeiState = getImei(context)
        } else {
            imeiState = "Permission denied. Cannot retrieve IMEI."
        }
    }

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colors.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = "Master App",
                style = MaterialTheme.typography.h4,
                modifier = Modifier.padding(bottom = 24.dp)
            )
            Text(
                text = imeiState,
                style = MaterialTheme.typography.body1,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 24.dp)
            )
            Button(
                onClick = {
                    when (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)) {
                        PackageManager.PERMISSION_GRANTED -> {
                            imeiState = getImei(context)
                        }
                        else -> {
                            requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                        }
                    }
                }
            ) {
                Text("Get Device IMEI")
            }
        }
    }
}

private fun getImei(context: Context): String {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
        return "Permission not granted."
    }

    return try {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

        // Starting from Android 10 (API 29), getImei() is restricted for non-system apps.
        // It will throw a SecurityException if the app does not have privileged permissions.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
             // For Android 10 and above, this will likely fail.
             // The method getImei() is deprecated in API 26 and restricted in API 29.
             // A real-world app would use another unique identifier, but we follow the user's request.
             val imei = telephonyManager.imei
             if (imei == null) {
                "IMEI is null. (Likely due to Android 10+ restrictions)."
             } else {
                "IMEI: $imei"
             }
        } else {
            @Suppress("DEPRECATION")
            val imei = telephonyManager.deviceId
            if (imei == null) {
                "IMEI (legacy) is null."
            } else {
                "IMEI (legacy): $imei"
            }
        }
    } catch (e: SecurityException) {
        Log.e("MasterApp", "Failed to get IMEI due to security exception.", e)
        "Failed to get IMEI. App might lack necessary privileges on this Android version."
    } catch (e: Exception) {
        Log.e("MasterApp", "An unexpected error occurred while getting IMEI.", e)
        "An unexpected error occurred."
    }
}
