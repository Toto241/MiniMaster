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
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.Button
import androidx.compose.material.MaterialTheme
import androidx.compose.material.RadioButton
import androidx.compose.material.Surface
import androidx.compose.material.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
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
        applySavedChildLocale(this)
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
                    AppNavigation(
                        childId = childId,
                        onboardingComplete = onboardingComplete,
                        languageSelected = hasChildLanguageSelection(this@MainActivity),
                        onLanguageSelected = { languageTag ->
                            saveChildLanguageSelection(this@MainActivity, languageTag)
                            recreate()
                        }
                    )
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
    fun AppNavigation(
        childId: String?,
        onboardingComplete: Boolean,
        languageSelected: Boolean,
        onLanguageSelected: (String) -> Unit
    ) {
        val navController = rememberNavController()
        // Determine the appropriate start destination based on application state.
        val startDestination = when {
            !languageSelected -> "language"     // App language must be selected first
            childId.isNullOrEmpty() -> "pairing" // Not paired yet
            !onboardingComplete -> "permission"  // Paired but needs permissions
            else -> "lock"                       // Paired and onboarded
        }

        NavHost(navController = navController, startDestination = startDestination) {
            composable("language") {
                LanguageSelectionScreen(onLanguageSelected = onLanguageSelected)
            }
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

private data class LanguageOption(val tag: String, val label: String)

@Composable
private fun LanguageSelectionScreen(onLanguageSelected: (String) -> Unit) {
    val options = remember {
        listOf(
            LanguageOption("en", "English"),
            LanguageOption("de", "Deutsch"),
            LanguageOption("fr", "Francais"),
            LanguageOption("zh-CN", "Chinese (Simplified)"),
            LanguageOption("es", "Espanol"),
            LanguageOption("pt-BR", "Portugues (Brasil)"),
            LanguageOption("hi", "Hindi"),
            LanguageOption("ar", "Arabic"),
            LanguageOption("id", "Indonesian"),
            LanguageOption("ja", "Japanese"),
            LanguageOption("ru", "Russian"),
            LanguageOption("tr", "Turkish"),
            LanguageOption("it", "Italian"),
            LanguageOption("ko", "Korean"),
            LanguageOption("vi", "Vietnamese"),
            LanguageOption("pl", "Polish"),
            LanguageOption("nl", "Dutch"),
            LanguageOption("th", "Thai"),
            LanguageOption("uk", "Ukrainian"),
            LanguageOption("fa", "Persian"),
            LanguageOption("bn", "Bengali"),
            LanguageOption("ur", "Urdu"),
            LanguageOption("sw", "Swahili"),
            LanguageOption("he", "Hebrew"),
            LanguageOption("ro", "Romanian"),
            LanguageOption("cs", "Czech"),
            LanguageOption("sv", "Swedish"),
            LanguageOption("no", "Norwegian"),
            LanguageOption("da", "Danish"),
            LanguageOption("fi", "Finnish"),
            LanguageOption("el", "Greek"),
            LanguageOption("hu", "Hungarian")
        )
    }
    var selectedTag by remember { mutableStateOf("en") }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colors.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = stringResource(R.string.language_setup_title),
                style = MaterialTheme.typography.h5,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            Text(
                text = stringResource(R.string.language_setup_description),
                style = MaterialTheme.typography.body1,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            LazyColumn(modifier = Modifier.weight(1f)) {
                items(options) { option ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { selectedTag = option.tag }
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = selectedTag == option.tag,
                            onClick = { selectedTag = option.tag }
                        )
                        Text(text = option.label, modifier = Modifier.padding(start = 8.dp))
                    }
                }
            }

            Button(
                onClick = { onLanguageSelected(selectedTag) },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.language_continue))
            }
        }
    }
}
