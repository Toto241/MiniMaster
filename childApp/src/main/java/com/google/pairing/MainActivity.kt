package com.google.pairing

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telephony.TelephonyManager
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.core.content.FileProvider
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import java.io.File
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The main and only activity for the Child App.
 *
 * This activity is the main entry point and handles the navigation logic between different
 * screens of the application using Jetpack Compose Navigation. It is responsible for:
 * - Observing the pairing and onboarding status to display the correct screen.
 * - Handling deep links for device pairing.
 * - Managing runtime permissions for device identifiers.
 * - Coordinating camera actions for task photo proofs.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var childIdProvider: ChildIdProvider
    @Inject
    lateinit var onboardingRepository: OnboardingRepository
    private val viewModel: PairingViewModel by viewModels()
    private val tasksViewModel: TasksViewModel by viewModels()

    private var photoUri: Uri? = null
    private var completingTaskId: String? = null

    /**
     * Activity result launcher for taking a picture. When the picture is successfully taken,
     * it calls the [TasksViewModel] to upload the photo and complete the task.
     */
    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            photoUri?.let { uri ->
                completingTaskId?.let { taskId ->
                    tasksViewModel.completeTaskWithPhoto(taskId, uri)
                }
            }
        }
    }

    /**
     * Activity result launcher for requesting the `READ_PHONE_STATE` permission.
     * If the permission is granted, it proceeds with handling the pairing intent.
     * If denied, it logs a warning.
     */
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            // Permission granted, re-process the intent to continue pairing.
            handleIntent(intent)
        } else {
            Log.w("MainActivity", "READ_PHONE_STATE permission was denied by the user.")
        }
    }

    /**
     * Sets up the initial content of the activity. It observes the child's pairing and
     * onboarding state and sets the appropriate Composable content via [AppNavigation].
     * @param savedInstanceState The previously saved instance state, if any.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            // Combine flows to react to changes in either childId or onboarding status.
            childIdProvider.childIdFlow.combine(onboardingRepository.onboardingCompleteFlow) { childId, onboardingComplete ->
                childId to onboardingComplete
            }.collect { (childId, onboardingComplete) ->
                setContent {
                    AppNavigation(childId, onboardingComplete)
                }
            }
        }
    }

    /**
     * Defines the navigation graph for the application.
     *
     * It determines the starting screen based on whether the device is paired and
     * whether the initial onboarding (permission granting) is complete.
     *
     * @param childId The unique ID of the child device. Null if not yet paired.
     * @param onboardingComplete True if the user has completed the initial permission setup.
     */
    @Composable
    fun AppNavigation(childId: String?, onboardingComplete: Boolean) {
        val navController = rememberNavController()
        // Determine the appropriate start destination based on application state.
        val startDestination = when {
            childId.isNullOrEmpty() -> "pairing" // Not paired yet
            !onboardingComplete -> "permission"  // Paired but needs permissions
            else -> "lock"                       // Paired and onboarded
        }

        NavHost(navController = navController, startDestination = startDestination) {
            composable("pairing") {
                PairingScreen(viewModel = viewModel)
            }
            composable("permission") {
                PermissionScreen(onPermissionGranted = {
                    lifecycleScope.launch {
                        onboardingRepository.setOnboardingComplete()
                        // Navigate to lock screen, clearing the permission screen from back stack.
                        navController.navigate("lock") {
                            popUpTo("permission") { inclusive = true }
                        }
                    }
                })
            }
            composable("lock") {
                LockScreen(
                    childId = childId ?: "Error: ID is null",
                    onNavigateToTasks = { navController.navigate("tasks") }
                )
            }
            composable("tasks") {
                TasksScreen(
                    viewModel = tasksViewModel,
                    onCompleteTaskClick = { taskId ->
                        // Create a temporary file to store the photo proof.
                        val (uri, _) = createTempImageFile()
                        photoUri = uri
                        completingTaskId = taskId
                        takePictureLauncher.launch(uri)
                    }
                )
            }
        }
        // Handle initial deep link intent if the app was launched with one.
        handleIntent(intent)
    }

    /**
     * Creates a temporary image file in the app's cache directory.
     * @return A [Pair] containing the [Uri] for the file (via FileProvider) and the [File] object itself.
     */
    private fun createTempImageFile(): Pair<Uri, File> {
        val file = File.createTempFile("proof_", ".jpg", cacheDir)
        val uri = FileProvider.getUriForFile(this, "${applicationContext.packageName}.provider", file)
        return uri to file
    }

    /**
     * Called when the activity is re-launched while already running. This is crucial for
     * handling deep links that are clicked when the app is in the background.
     * @param intent The new intent that started the activity.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent) // Update the activity's intent
        handleIntent(intent)
    }

    /**
     * Parses an incoming [Intent] to check for a deep link with a pairing token.
     * If a token is found, it initiates the permission check and token validation process.
     * @param intent The intent to handle.
     */
    private fun handleIntent(intent: Intent?) {
        if (intent?.action == Intent.ACTION_VIEW && intent.data != null) {
            val token = intent.data?.lastPathSegment
            if (token != null) {
                Log.d("MainActivity", "Deep link received with token: $token")
                // Check for phone state permission before trying to get the IMEI.
                when (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)) {
                    PackageManager.PERMISSION_GRANTED -> {
                        val imei = getImei(this)
                        if (imei != null) {
                            viewModel.validateToken(token, imei)
                        } else {
                            Log.e("MainActivity", "IMEI is null even with permission.")
                        }
                    }
                    else -> {
                        // Request the permission. The result is handled by the requestPermissionLauncher.
                        requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                    }
                }
            }
        }
    }

    /**
     * Retrieves the device's IMEI. This is a sensitive operation that requires
     * the `READ_PHONE_STATE` permission.
     *
     * Note: Accessing IMEI is restricted in modern Android versions and is used here
     * as a stable, unique device identifier for this specific proof-of-concept.
     * In a production app, a non-resettable hardware ID should be avoided in favor of
     * alternatives like `ANDROID_ID` or Firebase Installation ID.
     *
     * @param context The application context.
     * @return The device's IMEI as a [String], or null if permission is denied or an error occurs.
     */
    @SuppressLint("HardwareIds")
    private fun getImei(context: Context): String? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            Log.w("MainActivity", "Attempted to get IMEI without permission.")
            return null
        }
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            // Use the appropriate method based on the Android API level.
            val imei = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                telephonyManager.imei
            } else {
                @Suppress("DEPRECATION")
                telephonyManager.deviceId
            }
            if (imei == null) {
                Log.w("MainActivity", "IMEI is null, even with permission.")
            }
            imei
        } catch (e: SecurityException) {
            Log.e("MainActivity", "Failed to get IMEI due to SecurityException.", e)
            null
        } catch (e: Exception) {
            Log.e("MainActivity", "An unexpected error occurred while getting IMEI.", e)
            null
        }
    }
}
