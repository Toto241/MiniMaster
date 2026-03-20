package com.minimaster.masterapp

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.layout.*
import androidx.compose.material.Button
import androidx.compose.material.Checkbox
import androidx.compose.material.CircularProgressIndicator
import androidx.compose.material.OutlinedButton
import androidx.compose.material.MaterialTheme
import androidx.compose.material.RadioButton
import androidx.compose.material.Surface
import androidx.compose.material.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import dagger.hilt.android.AndroidEntryPoint
import java.util.UUID
import java.util.Locale

/**
 * The main and only activity for the Master App.
 * It serves as the entry point and hosts the Jetpack Compose navigation graph.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        applySavedMasterLocale(this)
        super.onCreate(savedInstanceState)
        setContent {
            val viewModel: MasterViewModel = hiltViewModel()
            val registrationState by viewModel.registrationState.collectAsState()
            val legalConsentState by viewModel.legalConsentState.collectAsState()

            var languageSelected by remember { mutableStateOf(hasMasterLanguageSelection(this)) }
            val context = LocalContext.current
            val appLocale = remember {
                val configured = context.resources.configuration.locales
                if (configured.isEmpty) Locale.getDefault() else configured[0]
            }
            val legalCountry = remember(appLocale) { appLocale.country.ifBlank { "US" }.uppercase(Locale.ROOT) }
            val legalLocale = remember(appLocale) { appLocale.toLanguageTag().ifBlank { "en-US" } }

            LaunchedEffect(languageSelected, legalCountry, legalLocale) {
                if (languageSelected) {
                    viewModel.refreshLegalConsentStatus(legalCountry, legalLocale)
                }
            }

            when {
                !languageSelected -> {
                    LanguageSelectionScreen(
                        onLanguageSelected = { languageTag ->
                            saveMasterLanguageSelection(this, languageTag)
                            languageSelected = true
                            recreate()
                        }
                    )
                }

                legalConsentState is LegalConsentState.Unknown ||
                    legalConsentState is LegalConsentState.Checking -> {
                    LegalConsentLoadingScreen()
                }

                legalConsentState is LegalConsentState.Required -> {
                    val state = legalConsentState as LegalConsentState.Required
                    LegalConsentScreen(
                        policies = state.policies,
                        onAccept = {
                            viewModel.acceptLegalPolicies(
                                country = legalCountry,
                                locale = legalLocale,
                                policies = state.policies,
                                appVersion = BuildConfig.VERSION_NAME
                            )
                        },
                        onOpenUrl = { url ->
                            try {
                                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                                context.startActivity(intent)
                            } catch (e: Exception) {
                                Log.w("MainActivity", "Failed to open legal URL: $url", e)
                            }
                        }
                    )
                }

                legalConsentState is LegalConsentState.Error -> {
                    val state = legalConsentState as LegalConsentState.Error
                    LegalConsentErrorScreen(
                        message = state.message,
                        onRetry = { viewModel.refreshLegalConsentStatus(legalCountry, legalLocale) }
                    )
                }

                registrationState !is RegistrationState.Success -> {
                    RegistrationScreen(
                        viewModel = viewModel,
                        onRegistrationSuccess = {}
                    )
                }

                else -> {
                    MasterAppNavigation(viewModel = viewModel)
                }
            }
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
            val dashboardEntry = remember(backStackEntry) { navController.getBackStackEntry("dashboard") }
            val dashboardViewModel: DashboardViewModel = hiltViewModel(dashboardEntry)
            CreateTaskScreen(
                onTaskCreate = { description, deadline ->
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
 * It derives a stable app-scoped device identifier and registers the master device.
 *
 * @param viewModel The [MasterViewModel] to handle the registration logic.
 * @param onRegistrationSuccess A callback invoked upon successful registration to trigger navigation.
 */
@Composable
fun RegistrationScreen(viewModel: MasterViewModel, onRegistrationSuccess: () -> Unit) {
    val context = LocalContext.current
    val registrationState by viewModel.registrationState.collectAsState()
    var registrationHint by remember { mutableStateOf("Ready to register this device.") }

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
                    val message = if (state is RegistrationState.Error) state.message else registrationHint
                    Text(text = message, style = MaterialTheme.typography.body2, textAlign = TextAlign.Center, modifier = Modifier.padding(bottom = 24.dp))
                    Button(onClick = {
                        val deviceId = getStableMasterId(context)
                        registrationHint = "Registering with app-scoped device ID."
                        viewModel.registerDevice(deviceId)
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
 * Returns a stable app-scoped identifier for master registration.
 *
 * Preference order:
 * 1. Cached identifier from SharedPreferences
 * 2. ANDROID_ID if available
 * 3. Random UUID fallback persisted for future runs
 *
 * @param context The application context.
 * @return A non-empty stable identifier for this app install.
 */
private fun getStableMasterId(context: Context): String {
    val prefs = context.getSharedPreferences("master_identity", Context.MODE_PRIVATE)
    val cachedId = prefs.getString("stable_master_id", null)
    if (!cachedId.isNullOrBlank()) {
        return cachedId
    }

    val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
    val stableId = if (androidId.isNullOrBlank() || androidId == "9774d56d682e549c") {
        "master-${UUID.randomUUID()}"
    } else {
        "android-$androidId"
    }

    prefs.edit().putString("stable_master_id", stableId).apply()
    Log.d("MasterApp", "Generated and persisted stable master device ID.")
    return stableId
}

private data class LanguageOption(val tag: String, val label: String)

@Composable
private fun LegalConsentLoadingScreen() {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colors.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator()
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = stringResource(R.string.legal_loading_message),
                style = MaterialTheme.typography.body1,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun LegalConsentErrorScreen(message: String, onRetry: () -> Unit) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colors.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = stringResource(R.string.legal_error_title),
                style = MaterialTheme.typography.h6,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colors.error
            )
            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.body2,
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(20.dp))
            Button(onClick = onRetry) {
                Text(stringResource(R.string.legal_retry))
            }
        }
    }
}

@Composable
private fun LegalConsentScreen(
    policies: ActiveLegalPolicies,
    onAccept: () -> Unit,
    onOpenUrl: (String) -> Unit
) {
    var termsAccepted by remember { mutableStateOf(false) }
    var privacyAccepted by remember { mutableStateOf(false) }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colors.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp)
        ) {
            Text(
                text = stringResource(R.string.legal_consent_title),
                style = MaterialTheme.typography.h5,
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.Center
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.legal_consent_description),
                style = MaterialTheme.typography.body1,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(16.dp))

            OutlinedButton(
                onClick = { onOpenUrl(policies.termsUrl) },
                border = BorderStroke(1.dp, MaterialTheme.colors.primary),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.legal_open_terms, policies.termsVersion))
            }
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = { onOpenUrl(policies.privacyUrl) },
                border = BorderStroke(1.dp, MaterialTheme.colors.primary),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.legal_open_privacy, policies.privacyVersion))
            }

            Spacer(modifier = Modifier.height(16.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Checkbox(checked = termsAccepted, onCheckedChange = { termsAccepted = it })
                Text(
                    text = stringResource(R.string.legal_accept_terms),
                    style = MaterialTheme.typography.body2,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Checkbox(checked = privacyAccepted, onCheckedChange = { privacyAccepted = it })
                Text(
                    text = stringResource(R.string.legal_accept_privacy),
                    style = MaterialTheme.typography.body2,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Button(
                onClick = onAccept,
                enabled = termsAccepted && privacyAccepted,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(stringResource(R.string.legal_accept_continue))
            }

            Spacer(modifier = Modifier.height(12.dp))
            Text(
                text = stringResource(R.string.legal_country_locale, policies.country, policies.locale),
                style = MaterialTheme.typography.caption,
                color = Color.Gray
            )
        }
    }
}

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
