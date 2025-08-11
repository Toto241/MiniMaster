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
    val linkState by viewModel.linkGenerationState.collectAsState()
    val debugState by viewModel.debugState.collectAsState()
    var permissionStatus by remember { mutableStateOf("App needs permission to read device state.") }
    var showDebugInfo by remember { mutableStateOf(false) }
    val requestPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            val imei = getImei(context)
            if (imei != null) {
                permissionStatus = "Permission granted. Ready to register."
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

            when (val state = registrationState) {
                is RegistrationState.Idle -> {
                    Text(
                        text = permissionStatus,
                        style = MaterialTheme.typography.body1,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 24.dp)
                    )
                    Button(onClick = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                            val imei = getImei(context)
                            if (imei != null) viewModel.registerDevice(imei) else permissionStatus = "Failed to retrieve IMEI."
                        } else {
                            requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                        }
                    }) {
                        Text("Register This Device")
                    }
                }
                is RegistrationState.Loading -> {
                    CircularProgressIndicator()
                    Text(text = "Registering device...", modifier = Modifier.padding(top = 16.dp))
                }
                is RegistrationState.Success -> {
                    Text(
                        text = state.successMessage,
                        style = MaterialTheme.typography.body1,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(bottom = 16.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    LinkGenerationSection(linkState = linkState, onGenerateClick = { viewModel.generateLink() })
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

            // Spacer and Debug section at the bottom
            Spacer(modifier = Modifier.weight(1f))
            Button(onClick = { showDebugInfo = !showDebugInfo }) {
                Text(if (showDebugInfo) "Hide Debug Info" else "Show Debug Info")
            }
            if (showDebugInfo) {
                DebugInfoView(debugState = debugState, linkState = linkState)
            }
        }
    }
}

@Composable
fun DebugInfoView(debugState: DebugState, linkState: LinkGenerationState) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text("---- DEBUG INFO ----", style = MaterialTheme.typography.caption)
        Text("IMEI: ${debugState.imei ?: "Not set"}", style = MaterialTheme.typography.caption)
        Text("Secret Key: ${debugState.secretKey ?: "Not set"}", style = MaterialTheme.typography.caption)
        val linkStatus = when(linkState) {
            is LinkGenerationState.Idle -> "Idle"
            is LinkGenerationState.Loading -> "Loading..."
            is LinkGenerationState.Success -> "Success: ${linkState.pairingToken}"
            is LinkGenerationState.Error -> "Error: ${linkState.message}"
        }
        Text("Link Status: $linkStatus", style = MaterialTheme.typography.caption, modifier = Modifier.testTag("debug_link_status"))
    }
}

@Composable
fun LinkGenerationSection(linkState: LinkGenerationState, onGenerateClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        when (linkState) {
            is LinkGenerationState.Idle -> {
                Button(onClick = onGenerateClick) {
                    Text("Generate Pairing Link")
                }
            }
            is LinkGenerationState.Loading -> {
                CircularProgressIndicator()
                Text(text = "Generating link...", modifier = Modifier.padding(top = 16.dp))
            }
            is LinkGenerationState.Success -> {
                Text(
                    text = "Link generated successfully!",
                    style = MaterialTheme.typography.h6
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = linkState.pairingToken,
                    style = MaterialTheme.typography.body2
                )
            }
            is LinkGenerationState.Error -> {
                Text(
                    text = linkState.message,
                    color = MaterialTheme.colors.error,
                    style = MaterialTheme.typography.body1,
                    textAlign = TextAlign.Center
                )
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onGenerateClick) {
                    Text("Retry Link Generation")
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
