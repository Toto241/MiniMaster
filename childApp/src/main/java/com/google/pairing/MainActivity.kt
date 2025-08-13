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

    private val takePictureLauncher = registerForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) {
            photoUri?.let { uri ->
                completingTaskId?.let { taskId ->
                    tasksViewModel.completeTaskWithPhoto(taskId, uri)
                }
            }
        }
    }

    // Launcher for the READ_PHONE_STATE permission request
    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted: Boolean ->
        if (isGranted) {
            // Permission is granted. Now we can proceed with the pairing token validation.
            // It's safer to re-handle the intent here to ensure we have the token.
            handleIntent(intent)
        } else {
            // Handle the case where the user denies the permission.
            // The ViewModel doesn't have an explicit state for this, but the UI will remain idle.

            Log.w("MainActivity", "READ_PHONE_STATE permission denied by user.")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            childIdProvider.childIdFlow.combine(onboardingRepository.onboardingCompleteFlow) { childId, onboardingComplete ->
                childId to onboardingComplete
            }.collect { (childId, onboardingComplete) ->
                setContent {
                    AppNavigation(childId, onboardingComplete)
                }
            }
        }

        // Handle the deep link intent when the activity is created
    }

    @Composable
    fun AppNavigation(childId: String?, onboardingComplete: Boolean) {
        val navController = rememberNavController()
        val startDestination = when {
            childId.isNullOrEmpty() -> "pairing"
            !onboardingComplete -> "permission"
            else -> "lock"
        }

        NavHost(navController = navController, startDestination = startDestination) {
            composable("pairing") {
                PairingScreen(viewModel = viewModel)
            }
            composable("permission") {
                PermissionScreen(onPermissionGranted = {
                    lifecycleScope.launch {
                        onboardingRepository.setOnboardingComplete()
                        // Navigate to lock screen after setting flag
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
                        val (uri, file) = createTempImageFile()
                        photoUri = uri
                        completingTaskId = taskId
                        takePictureLauncher.launch(uri)
                    }
                )
            }
        }
        handleIntent(intent)
    }

    private fun createTempImageFile(): Pair<Uri, File> {
        val file = File.createTempFile("proof_", ".jpg", cacheDir)
        val uri = FileProvider.getUriForFile(this, "${applicationContext.packageName}.provider", file)
        return uri to file
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Handle deep link if the activity is already running
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val action: String? = intent?.action
        val data: Uri? = intent?.data

        if (action == Intent.ACTION_VIEW && data != null) {
            val token = data.lastPathSegment
            if (token != null) {
                Log.d("MainActivity", "Deep link received with token: $token")
                // We have a token, now we need the IMEI. This requires permission.
                when (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)) {
                    PackageManager.PERMISSION_GRANTED -> {
                        val imei = getImei(this)
                        if (imei != null) {
                            viewModel.validateToken(token, imei)
                        }
                    }
                    else -> {
                        // Request the permission. The result is handled by the launcher.
                        requestPermissionLauncher.launch(Manifest.permission.READ_PHONE_STATE)
                    }
                }
            }
        }
    }

    @SuppressLint("HardwareIds")
    private fun getImei(context: Context): String? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            Log.w("MainActivity", "Attempted to get IMEI without permission.")
            return null
        }
        return try {
            val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
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
