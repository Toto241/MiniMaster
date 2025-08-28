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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MasterAppNavigation()
        }
    }
}

@Composable
fun MasterAppNavigation(viewModel: MasterViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val registrationState by viewModel.registrationState.collectAsState()

    // Decide the start destination based on the registration state.
    // This is a simplified approach. A more robust solution might use a dedicated "splash" screen
    // or check a local flag before deciding the route.
    val startDestination = when (registrationState) {
        is RegistrationState.Success -> "dashboard"
        else -> "registration"
    }

    NavHost(navController = navController, startDestination = startDestination) {
        composable("registration") {
            RegistrationScreen(
                viewModel = viewModel,
                onRegistrationSuccess = { navController.navigate("dashboard") { popUpTo("registration") { inclusive = true } } }
            )
        }
        composable("dashboard") {
            DashboardScreen(
                onNavigateToCreateTask = { childId ->
                    navController.navigate("createTask/$childId")
                },
                onNavigateToReview = { navController.navigate("taskReview") },
                onNavigateToSubscription = { navController.navigate("subscription") }
            )
        }
        composable("subscription") {
            SubscriptionScreen()
        }
        composable("taskReview") {
            TaskReviewScreen(onBack = { navController.popBackStack() })
        }
        composable("createTask/{childId}") { backStackEntry ->
            val childId = backStackEntry.arguments?.getString("childId") ?: ""
            CreateTaskScreen(
                onTaskCreate = { description, deadline ->
                    // Get the ViewModel instance scoped to the NavHost
                    val dashboardViewModel: DashboardViewModel = hiltViewModel(navController.getBackStackEntry("dashboard"))
                    dashboardViewModel.createTask(childId, description, deadline)
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() }
            )
        }
    }
}

@Composable
fun RegistrationScreen(viewModel: MasterViewModel, onRegistrationSuccess: () -> Unit) {
    val context = LocalContext.current
    val registrationState by viewModel.registrationState.collectAsState()
    var permissionStatus by remember { mutableStateOf("App needs permission to read device state.") }

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

    // Effect to navigate when registration succeeds
    LaunchedEffect(registrationState) {
        if (registrationState is RegistrationState.Success) {
            onRegistrationSuccess()
        }
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colors.background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(stringResource(R.string.parent_device_setup), style = MaterialTheme.typography.h4, modifier = Modifier.padding(bottom = 16.dp))
            Text(
                stringResource(R.string.setup_description),
                style = MaterialTheme.typography.body1,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 24.dp)
            )

            when (val state = registrationState) {
                is RegistrationState.Idle, is RegistrationState.Error -> {
                    val message = if (state is RegistrationState.Error) state.message else permissionStatus
                    Text(text = message, style = MaterialTheme.typography.body2, textAlign = TextAlign.Center, modifier = Modifier.padding(bottom = 24.dp))
                    Button(onClick = {
                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {
                            val imei = getImei(context)
                            if (imei != null) viewModel.registerDevice(imei) else permissionStatus = "Failed to retrieve IMEI."
                        } else {
                            requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                        }
                    }) {
                        Text(stringResource(R.string.register_device))
                    }
                }
                is RegistrationState.Loading -> {
                    CircularProgressIndicator()
                    Text(text = stringResource(R.string.registering_device), modifier = Modifier.padding(top = 16.dp))
                }
                is RegistrationState.Success -> {
                    // Handled by LaunchedEffect
                }
            }
        }
    }
}

@Composable
fun DebugInfoView(debugState: DebugState, linkState: LinkGenerationState) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(stringResource(R.string.debug_info), style = MaterialTheme.typography.caption)
        Text(stringResource(R.string.debug_imei, debugState.imei ?: stringResource(R.string.debug_not_set)), style = MaterialTheme.typography.caption)
        Text(stringResource(R.string.debug_secret_key, debugState.secretKey ?: stringResource(R.string.debug_not_set)), style = MaterialTheme.typography.caption)
        val linkStatus = when(linkState) {
            is LinkGenerationState.Idle -> "Idle"
            is LinkGenerationState.Loading -> "Loading..."
            is LinkGenerationState.Success -> "Success: ${linkState.pairingToken}"
            is LinkGenerationState.Error -> "Error: ${linkState.message}"
        }
        Text(stringResource(R.string.link_status, linkStatus), style = MaterialTheme.typography.caption, modifier = Modifier.testTag("debug_link_status"))
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
                    Text(stringResource(R.string.generate_pairing_link))
                }
            }
            is LinkGenerationState.Loading -> {
                CircularProgressIndicator()
                Text(text = stringResource(R.string.generating_link), modifier = Modifier.padding(top = 16.dp))
            }
            is LinkGenerationState.Success -> {
                Text(
                    text = stringResource(R.string.link_generated_success),
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
                    Text(stringResource(R.string.retry_link_generation))
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
