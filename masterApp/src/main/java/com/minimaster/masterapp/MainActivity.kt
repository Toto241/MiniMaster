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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint

/**
 * The main and only activity for the Master App.
 * It serves as the entry point and hosts the Jetpack Compose navigation graph.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MasterAppNavigation()
        }
    }
}

/**
 * Sets up the navigation graph for the entire Master App.
 *
 * It uses a [NavHost] to define all possible navigation routes, such as registration,
 * the main dashboard, task creation, and subscription management. The starting destination
 * is determined by the device's registration status.
 *
 * @param viewModel The [MasterViewModel] used to check the initial registration state.
 */
@Composable
fun MasterAppNavigation(viewModel: MasterViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val registrationState by viewModel.registrationState.collectAsState()

    // Determine the start destination based on whether the device is already registered.
    val startDestination = if (registrationState is RegistrationState.Success) "dashboard" else "registration"

    NavHost(navController = navController, startDestination = startDestination) {
        composable("registration") {
            RegistrationScreen(
                viewModel = viewModel,
                onRegistrationSuccess = {
                    // Navigate to dashboard and clear the registration screen from the back stack.
                    navController.navigate("dashboard") { popUpTo("registration") { inclusive = true } }
                }
            )
        }
        composable("dashboard") {
            DashboardScreen(
                onNavigateToCreateTask = { childId -> navController.navigate("createTask/$childId") },
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
                    // Retrieve the ViewModel scoped to the dashboard to call its method.
                    val dashboardViewModel: DashboardViewModel = hiltViewModel(navController.getBackStackEntry("dashboard"))
                    dashboardViewModel.createTask(childId, description, deadline)
                    navController.popBackStack()
                },
                onBack = { navController.popBackStack() }
            )
        }
    }
}

/**
 * A screen that handles the initial registration of the master device.
 *
 * It prompts the user for necessary permissions (`READ_PHONE_STATE`) to get a unique
 * device ID, then calls the [MasterViewModel] to register the device with the backend.
 *
 * @param viewModel The [MasterViewModel] to handle the registration logic.
 * @param onRegistrationSuccess A callback invoked upon successful registration to trigger navigation.
 */
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

    // A side effect that triggers navigation once the registration state becomes Success.
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

            // Display UI based on the current registration state
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
                    // Navigation is handled by the LaunchedEffect
                }
            }
        }
    }
}

/**
 * A Composable for displaying debug information, including the device's credentials
 * and the status of the last pairing link generation attempt.
 *
 * @param debugState The state containing the IMEI and secret key.
 * @param linkState The state of the link generation process.
 */
@Composable
fun DebugInfoView(debugState: DebugState, linkState: LinkGenerationState) {
    Column(modifier = Modifier.padding(top = 16.dp)) {
        Text(stringResource(R.string.debug_info), style = MaterialTheme.typography.caption)
        Text(stringResource(R.string.debug_imei, debugState.imei ?: "Not set"), style = MaterialTheme.typography.caption)
        Text(stringResource(R.string.debug_secret_key, debugState.secretKey ?: "Not set"), style = MaterialTheme.typography.caption)
        val linkStatus = when(linkState) {
            is LinkGenerationState.Idle -> "Idle"
            is LinkGenerationState.Loading -> "Loading..."
            is LinkGenerationState.Success -> "Success: ${linkState.pairingToken}"
            is LinkGenerationState.Error -> "Error: ${linkState.message}"
        }
        Text(stringResource(R.string.link_status, linkStatus), style = MaterialTheme.typography.caption, modifier = Modifier.testTag("debug_link_status"))
    }
}

/**
 * A section of the UI dedicated to generating a pairing link.
 * It shows a button, a loading indicator, or the result (success/error) based on the [linkState].
 *
 * @param linkState The current state of the link generation process.
 * @param onGenerateClick A callback to be invoked when the "Generate" or "Retry" button is clicked.
 */
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
                Text(text = stringResource(R.string.link_generated_success), style = MaterialTheme.typography.h6)
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = linkState.pairingToken, style = MaterialTheme.typography.body2)
            }
            is LinkGenerationState.Error -> {
                Text(text = linkState.message, color = MaterialTheme.colors.error, style = MaterialTheme.typography.body1, textAlign = TextAlign.Center)
                Spacer(modifier = Modifier.height(8.dp))
                Button(onClick = onGenerateClick) {
                    Text(stringResource(R.string.retry_link_generation))
                }
            }
        }
    }
}

/**
 * Retrieves the device's IMEI. This is a sensitive operation that requires the `READ_PHONE_STATE` permission.
 *
 * Note: Accessing IMEI is restricted on modern Android versions and is used here for simplicity
 * as a unique identifier. Production apps should prefer less invasive, privacy-friendly identifiers.
 *
 * @param context The application context.
 * @return The device's IMEI as a [String], or null if permission is not granted or an error occurs.
 */
@SuppressLint("HardwareIds")
private fun getImei(context: Context): String? {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
        Log.w("MasterApp", "READ_PHONE_STATE permission not granted.")
        return null
    }
    return try {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // This will likely fail for non-system apps on Android 10+ and throw a SecurityException.
            telephonyManager.imei
        } else {
            @Suppress("DEPRECATION")
            telephonyManager.deviceId
        }
    } catch (e: SecurityException) {
        Log.e("MasterApp", "Failed to get IMEI due to security exception.", e)
        null
    } catch (e: Exception) {
        Log.e("MasterApp", "An unexpected error occurred while getting IMEI.", e)
        null
    }
}
