package com.minimaster.masterapp

import android.Manifest
import android.annotation.SuppressLint
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
import androidx.compose.material.CircularProgressIndicator
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
import androidx.hilt.navigation.compose.hiltViewModel
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
fun MasterAppScreen(viewModel: MasterViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val registrationState by viewModel.registrationState.collectAsState()
    var permissionStatus by remember { mutableStateOf("App needs permission to read device state.") }

    val requestPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            permissionStatus = "Permission granted. Ready to register."
            val imei = getImei(context)
            if (imei != null) {
                viewModel.registerDevice(imei)
            } else {
                permissionStatus = "Permission granted, but failed to retrieve IMEI."
            }
        } else {
            permissionStatus = "Permission denied. Cannot retrieve IMEI."
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

            // Display content based on the registration state
            when (val state = registrationState) {
                is RegistrationState.Idle -> {
                    Text(
                        text = permissionStatus,
                        style = MaterialTheme.typography.body1,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 24.dp)
                    )
                    Button(onClick = {
                        when (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)) {
                            PackageManager.PERMISSION_GRANTED -> {
                                val imei = getImei(context)
                                if (imei != null) {
                                    viewModel.registerDevice(imei)
                                } else {
                                    permissionStatus = "Permission granted, but failed to retrieve IMEI."
                                }
                            }
                            else -> {
                                requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                            }
                        }
                    }) {
                        Text("Register This Device")
                    }
                }
                is RegistrationState.Loading -> {
                    CircularProgressIndicator()
                    Text(
                        text = "Registering device...",
                        modifier = Modifier.padding(top = 16.dp)
                    )
                }
                is RegistrationState.Success -> {
                    Text(
                        text = state.secretKey,
                        style = MaterialTheme.typography.body1,
                        textAlign = TextAlign.Center
                    )
                }
                is RegistrationState.Error -> {
                    Text(
                        text = state.message,
                        color = MaterialTheme.colors.error,
                        style = MaterialTheme.typography.body1,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@SuppressLint("HardwareIds")
private fun getImei(context: Context): String? {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
        Log.w("MasterApp", "READ_PHONE_STATE permission not granted.")
        return null
    }

    return try {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // This will likely fail for non-system apps and throw a SecurityException.
            telephonyManager.imei
        } else {
            @Suppress("DEPRECATION")
            telephonyManager.deviceId
        }
    } catch (e: SecurityException) {
        Log.e("MasterApp", "Failed to get IMEI due to security exception on this Android version.", e)
        null
    } catch (e: Exception) {
        Log.e("MasterApp", "An unexpected error occurred while getting IMEI.", e)
        null
    }
}
