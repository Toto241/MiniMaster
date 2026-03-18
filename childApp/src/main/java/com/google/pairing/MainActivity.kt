package com.google.pairing

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.core.content.FileProvider
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import java.io.File
import java.util.UUID
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
 * - Managing a stable app-scoped device identifier for pairing.
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
     * Sets up the initial content of the activity. It observes the child's pairing and
     * onboarding state and sets the appropriate Composable content via [AppNavigation].
     * @param savedInstanceState The previously saved instance state, if any.
     */
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Starte den TaskMonitoringService
        val serviceIntent = Intent(this, TaskMonitoringService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

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
                viewModel.validateToken(token, getStableChildId(this))
            }
        }
    }

    /**
     * Returns a stable app-scoped child identifier that does not depend on Telephony APIs.
     *
     * Preference order:
     * 1. Cached identifier from SharedPreferences
     * 2. ANDROID_ID if available
     * 3. Random UUID fallback persisted for future runs
     *
     * @param context The application context.
     * @return A non-empty stable identifier for this app install.
     */
    private fun getStableChildId(context: Context): String {
        val prefs = context.getSharedPreferences("child_identity", Context.MODE_PRIVATE)
        val cachedId = prefs.getString("stable_child_id", null)
        if (!cachedId.isNullOrBlank()) {
            return cachedId
        }

        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        val stableId = if (androidId.isNullOrBlank() || androidId == "9774d56d682e549c") {
            "child-${UUID.randomUUID()}"
        } else {
            "android-$androidId"
        }

        prefs.edit().putString("stable_child_id", stableId).apply()
        return stableId
    }
}
