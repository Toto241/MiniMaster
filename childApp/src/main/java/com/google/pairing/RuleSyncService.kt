package com.google.pairing

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import android.content.pm.PackageManager

/**
 * A service that extends [FirebaseMessagingService] to handle incoming FCM messages.
 *
 * This service is the entry point for push notifications from the backend. It is responsible for
 * parsing incoming messages and triggering appropriate actions, such as syncing rules or
 * updating the device lock state. It operates on a background thread provided by the system.
 *
 * @property functions An instance of [FirebaseFunctions] for backend communication.
 * @property childIdRepository The repository for accessing the child device's ID.
 */
@AndroidEntryPoint
class RuleSyncService : FirebaseMessagingService() {

    @Inject
    lateinit var functions: FirebaseFunctions
    @Inject
    lateinit var childIdRepository: ChildIdRepository
    @Inject
    lateinit var commandSyncRepository: CommandSyncRepository

    private val TAG = "RuleSyncService"

    /**
     * Called when a new FCM message is received.
     *
     * It inspects the `data` payload of the [RemoteMessage] to determine the type of command
     * and delegates to the appropriate handler function. It supports a legacy `SYNC_RULES`
     * command for backward compatibility.
     *
     * @param remoteMessage The message received from Firebase Cloud Messaging.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")

        if (remoteMessage.data.isNotEmpty()) {
            Log.d(TAG, "Message data payload: " + remoteMessage.data)

            // If the payload contains a policyVersion hint, fetch the authoritative commands
            // from Firestore instead of trusting the FCM payload directly.
            val serverPolicyVersion = remoteMessage.data["policyVersion"]?.toIntOrNull()
            if (serverPolicyVersion != null) {
                Log.d(TAG, "Received policyVersion hint: $serverPolicyVersion – pulling commands")
                handleCommandSync()
                return
            }

            // Legacy: Handle payload-only messages (from onChildDeviceUpdateV2 without policyVersion)
            if (remoteMessage.data.containsKey("isLocked")) {
                handleDeviceLockMessage(remoteMessage.data)
            }
            if (remoteMessage.data.containsKey("appBlacklist") || remoteMessage.data.containsKey("blocked_apps")) {
                handleAppRulesUpdate(remoteMessage.data)
            }
            if (remoteMessage.data.containsKey("usageRules")) {
                handleUsageRulesUpdate(remoteMessage.data)
            }

            // Handle command-based messages
            when (remoteMessage.data["command"]) {
                "SYNC_RULES" -> {
                    Log.d(TAG, "SYNC_RULES command received. Triggering rule sync logic.")
                    handleSyncRequest()
                }
                else -> {
                    // Log warning only if no known keys were processed
                    if (serverPolicyVersion == null &&
                        !remoteMessage.data.containsKey("isLocked") &&
                        !remoteMessage.data.containsKey("appBlacklist") &&
                        !remoteMessage.data.containsKey("blocked_apps") &&
                        !remoteMessage.data.containsKey("usageRules")) {
                        Log.w(TAG, "Unknown command received: ${remoteMessage.data}")
                    }
                }
            }
        }
    }

    /**
     * Handles a direct command to update the device's lock state.
     * The new lock state is persisted in SharedPreferences to be read by the UI or other components.
     * @param data The data map from the FCM message.
     */
    private fun handleDeviceLockMessage(data: Map<String, String>) {
        Log.d(TAG, "Handling device lock message")
        // Support both "isLocked" (from onChildDeviceUpdateV2) and legacy "locked" key
        val isLocked = data["isLocked"]?.toBoolean() ?: data["locked"]?.toBoolean() ?: false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (!childId.isNullOrEmpty()) {
                    val context = applicationContext
                    val sharedPrefs = context.getSharedPreferences("device_lock", Context.MODE_PRIVATE)
                    sharedPrefs.edit().putBoolean("is_locked", isLocked).apply()
                    Log.d(TAG, "Device lock state persisted: locked=$isLocked")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling device lock message", e)
            }
        }
    }

    /**
     * Handles a direct command to update the app blocking rules.
     * The rules are parsed and passed to the [MiniMasterAccessibilityService] via SharedPreferences.
     * @param data The data map from the FCM message.
     */
    private fun handleAppRulesUpdate(data: Map<String, String>) {
        Log.d(TAG, "Handling app rules update")
        val blockedAppsJson = data["appBlacklist"] ?: data["blocked_apps"]

        if (!blockedAppsJson.isNullOrEmpty()) {
            try {
                val blockedApps = com.google.pairing.child.ChildProtectionPolicy.parseBlockedApps(blockedAppsJson)
                updateAccessibilityServiceRules(blockedApps)
                AppLogger.logRuleSyncEvent("app_blocking", "success", "Updated ${blockedApps.size} blocked apps")
            } catch (e: Exception) {
                Log.e(TAG, "Error parsing blocked apps", e)
                AppLogger.logRuleSyncEvent("app_blocking", "error", "Failed to parse blocked apps: ${e.message}")
            }
        }
    }

    /**
     * Handles a direct command to update the usage rules.
     * The rules are passed to the [MiniMasterAccessibilityService] via SharedPreferences.
     * @param data The data map from the FCM message.
     */
    private fun handleUsageRulesUpdate(data: Map<String, String>) {
        Log.d(TAG, "Handling usage rules update")
        val usageRulesJson = data["usageRules"]

        if (!usageRulesJson.isNullOrEmpty()) {
            updateUsageRules(usageRulesJson)
        }
    }

    /**
     * Handles a generic sync request, which triggers a call to the backend to fetch the latest rules.
     */
    private fun handleSyncRequest() {
        Log.d(TAG, "Handling sync request")

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (!childId.isNullOrEmpty()) {
                    Log.d(TAG, "Syncing rules for child: $childId")
                    syncRulesWithBackend(childId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error during sync request", e)
            }
        }
    }

    /**
     * Pulls and applies all pending commands via the Control-Plane.
     * Called when the FCM wake-up payload contains a [policyVersion] hint.
     */
    private fun handleCommandSync() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (!childId.isNullOrEmpty()) {
                    commandSyncRepository.fetchAndApplyPendingCommands(childId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error during command sync", e)
            }
        }
    }

    /**
     * Calls the `getRulesForChild` Firebase Function to fetch the latest rules for the device.
     * On success, it applies the new rules. On failure, it schedules a retry.
     * @param childId The unique ID of the child device.
     */
    private suspend fun syncRulesWithBackend(childId: String) {
        try {
            val data = hashMapOf("childId" to childId)
            val result = functions.getHttpsCallable("getRulesForChild").call(data).await()
            val rules = result.getData() as? Map<String, Any>

            if (rules != null) {
                Log.d(TAG, "Retrieved rules from backend: $rules")

                // Handle blocked apps
                val blockedAppsRaw = rules["appBlacklist"] ?: rules["blockedApps"]
                val blockedApps = (blockedAppsRaw as? List<String>)?.toSet() ?: emptySet()
                updateAccessibilityServiceRules(blockedApps)

                // Handle usage rules
                val usageRules = rules["usageRules"]
                if (usageRules != null) {
                    val json = org.json.JSONObject(usageRules as Map<*, *>).toString()
                    updateUsageRules(json)
                }

                // Handle lock state
                val isLocked = rules["isLocked"] as? Boolean ?: false
                val sharedPrefs = applicationContext.getSharedPreferences("device_lock", Context.MODE_PRIVATE)
                sharedPrefs.edit().putBoolean("is_locked", isLocked).apply()

                AppLogger.logRuleSyncEvent("rule_sync", "success", "Rules synchronized: ${blockedApps.size} blocked apps")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync rules with backend", e)
            AppLogger.logRuleSyncEvent("rule_sync", "error", "Failed to sync with backend: ${e.message}")
            scheduleRetrySync()
        }
    }

    /**
     * Schedules a simple, delayed retry of the sync process.
     * A more robust implementation would use WorkManager with an exponential backoff policy.
     */
    private fun scheduleRetrySync() {
        CoroutineScope(Dispatchers.IO).launch {
            kotlinx.coroutines.delay(30000) // Wait 30 seconds before retry
            Log.d(TAG, "Retrying rule sync...")
            val childId = childIdRepository.getChildId().first()
            if (!childId.isNullOrEmpty()) {
                syncRulesWithBackend(childId)
            }
        }
    }

    /**
     * Persists the set of blocked application package names to SharedPreferences.
     * The [MiniMasterAccessibilityService] reads from these preferences to enforce the rules.
     * @param blockedApps A [Set] of package names to be blocked.
     */
    private fun updateAccessibilityServiceRules(blockedApps: Set<String>) {
        try {
            val context = applicationContext
            val sharedPrefs = context.getSharedPreferences("accessibility_rules", Context.MODE_PRIVATE)
            sharedPrefs.edit()
                .putStringSet("blocked_apps", blockedApps)
                .putLong("last_update", System.currentTimeMillis())
                .apply()
            Log.d(TAG, "Updated accessibility rules in shared preferences")
        } catch (e: Exception) {
            Log.e(TAG, "Error updating accessibility service rules", e)
        }
    }

    /**
     * Persists the usage rules JSON string to SharedPreferences.
     * @param usageRulesJson The JSON string representing usage rules.
     */
    private fun updateUsageRules(usageRulesJson: String) {
        try {
            val context = applicationContext
            val sharedPrefs = context.getSharedPreferences("accessibility_rules", Context.MODE_PRIVATE)
            sharedPrefs.edit()
                .putString("usage_rules", usageRulesJson)
                .putLong("last_update", System.currentTimeMillis())
                .apply()
            Log.d(TAG, "Updated usage rules in shared preferences")
            AppLogger.logRuleSyncEvent("usage_rules", "success", "Updated usage rules")
        } catch (e: Exception) {
            Log.e(TAG, "Error updating usage rules", e)
            AppLogger.logRuleSyncEvent("usage_rules", "error", "Failed to update usage rules: ${e.message}")
        }
    }

    /**
     * Called when the FCM registration token is generated or refreshed.
     *
     * This function is responsible for sending the new token to the backend server so that
     * it can be associated with the current device. This ensures that the device can
     * continue to receive push notifications.
     *
     * @param token The new FCM registration token.
     */
    override fun onNewToken(token: String) {
        Log.d(TAG, "Refreshed token: $token")

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (childId.isNullOrEmpty()) return@launch

                // Legacy: keep sending to registerFcmToken for backward compat
                val legacyData = hashMapOf("childImei" to childId, "token" to token)
                try {
                    functions.getHttpsCallable("registerFcmToken").call(legacyData).await()
                    Log.d(TAG, "Legacy FCM token updated for child: $childId")
                } catch (e: Exception) {
                    Log.w(TAG, "Legacy registerFcmToken failed (non-fatal)", e)
                }

                // New Control-Plane: register full endpoint with capabilities
                val appVersion = runCatching {
                    applicationContext.packageManager
                        .getPackageInfo(applicationContext.packageName, 0)
                        .versionName ?: "unknown"
                }.getOrDefault("unknown")

                val endpointData = hashMapOf(
                    "childId" to childId,
                    "platform" to "android",
                    "provider" to "fcm",
                    "token" to token,
                    "appVersion" to appVersion,
                    "capabilities" to listOf(
                        "lock", "appBlacklist", "usageRules",
                        "tamperDetection", "heartbeat", "taskProof"
                    )
                )
                functions.getHttpsCallable("registerDeviceEndpoint").call(endpointData).await()
                Log.d(TAG, "Registered device endpoint for child: $childId (v$appVersion)")
            } catch (e: Exception) {
                Log.e(TAG, "Error in onNewToken", e)
            }
        }
    }
}
