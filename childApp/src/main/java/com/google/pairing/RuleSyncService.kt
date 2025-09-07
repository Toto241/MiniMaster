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

@AndroidEntryPoint
class RuleSyncService : FirebaseMessagingService() {

    @Inject
    lateinit var functions: FirebaseFunctions
    @Inject
    lateinit var childIdRepository: ChildIdRepository

    private val TAG = "RuleSyncService"

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")

        // Check if message contains a data payload.
        remoteMessage.data.isNotEmpty().let {
            Log.d(TAG, "Message data payload: " + remoteMessage.data)
            
            // Handle different types of messages
            when (remoteMessage.data["type"]) {
                "device_lock" -> handleDeviceLockMessage(remoteMessage.data)
                "app_rules" -> handleAppRulesUpdate(remoteMessage.data)
                "sync_request" -> handleSyncRequest()
                else -> {
                    // Handle legacy SYNC_RULES command
                    if (remoteMessage.data["command"] == "SYNC_RULES") {
                        Log.d(TAG, "SYNC_RULES command received. Triggering rule sync logic.")
                        handleSyncRequest()
                    } else {
                        Log.w(TAG, "Unknown message type or command: ${remoteMessage.data}")
                    }
                }
            }
        }
    }

    private fun handleDeviceLockMessage(data: Map<String, String>) {
        Log.d(TAG, "Handling device lock message")
        val isLocked = data["locked"]?.toBoolean() ?: false
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (childId.isNotEmpty()) {
                    // Update device lock status
                    Log.d(TAG, "Device lock status updated: $isLocked for child: $childId")
                    
                    // Implement device locking logic
                    val context = this@RuleSyncService.applicationContext
                    val sharedPrefs = context.getSharedPreferences("device_lock", Context.MODE_PRIVATE)
                    with(sharedPrefs.edit()) {
                        putBoolean("is_locked", isLocked)
                        putLong("lock_timestamp", System.currentTimeMillis())
                        apply()
                    }
                    
                    Log.d(TAG, "Device lock state persisted: locked=$isLocked")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error handling device lock message", e)
            }
        }
    }

    private fun handleAppRulesUpdate(data: Map<String, String>) {
        Log.d(TAG, "Handling app rules update")
        val blockedAppsJson = data["blocked_apps"]
        
        if (!blockedAppsJson.isNullOrEmpty()) {
            try {
                // Parse blocked apps (assuming comma-separated list)
                val blockedApps = blockedAppsJson.split(",").toSet()
                
                // Update AccessibilityService with new rules
                updateAccessibilityServiceRules(blockedApps)
                
                AppLogger.logRuleSyncEvent("app_blocking", "success", "Updated ${blockedApps.size} blocked apps")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error parsing blocked apps", e)
                AppLogger.logRuleSyncEvent("app_blocking", "error", "Failed to parse blocked apps: ${e.message}")
            }
        }
    }

    private fun handleSyncRequest() {
        Log.d(TAG, "Handling sync request")
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (childId.isNotEmpty()) {
                    // Trigger sync with backend
                    Log.d(TAG, "Syncing rules for child: $childId")
                    
                    // Implement rule sync logic with Firebase Functions
                    syncRulesWithBackend(childId)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error during sync request", e)
            }
        }
    }

    private suspend fun syncRulesWithBackend(childId: String) {
        try {
            // Call Firebase Function to get latest rules for this child
            val data = hashMapOf("childId" to childId)
            
            functions.getHttpsCallable("getRulesForChild")
                .call(data)
                .await()
                .let { result ->
                    val rulesData = result.data as? Map<String, Any>
                    rulesData?.let { rules ->
                        Log.d(TAG, "Retrieved rules from backend: $rules")
                        
                        // Process and apply rules
                        val blockedApps = (rules["blockedApps"] as? List<String>)?.toSet() ?: emptySet()
                        if (blockedApps.isNotEmpty()) {
                            updateAccessibilityServiceRules(blockedApps)
                            AppLogger.logRuleSyncEvent("rule_sync", "success", "Rules synchronized: ${blockedApps.size} blocked apps")
                        }
                    }
                }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync rules with backend", e)
            AppLogger.logRuleSyncEvent("rule_sync", "error", "Failed to sync with backend: ${e.message}")
            
            // Implement exponential backoff for retry logic
            scheduleRetrySync()
        }
    }

    private fun scheduleRetrySync() {
        // Simple retry mechanism - could be enhanced with WorkManager for more robust scheduling
        CoroutineScope(Dispatchers.IO).launch {
            kotlinx.coroutines.delay(30000) // Wait 30 seconds before retry
            Log.d(TAG, "Retrying rule sync...")
            val childId = childIdRepository.getChildId().first()
            if (childId.isNotEmpty()) {
                syncRulesWithBackend(childId)
            }
        }
    }

    private fun updateAccessibilityServiceRules(blockedApps: Set<String>) {
        try {
            // Try to communicate with AccessibilityService
            val context = this.applicationContext
            
            // Use shared preferences to communicate with AccessibilityService
            val sharedPrefs = context.getSharedPreferences("accessibility_rules", Context.MODE_PRIVATE)
            with(sharedPrefs.edit()) {
                putStringSet("blocked_apps", blockedApps)
                putLong("last_update", System.currentTimeMillis())
                apply()
            }
            
            Log.d(TAG, "Updated accessibility rules in shared preferences")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error updating accessibility service rules", e)
        }
    }

    /**
     * Called if the FCM registration token is updated. This may occur if the security of
     * the previous token had been compromised. Note that this is called when the
     * FCM registration token is initially generated so this is where you would retrieve the token.
     */
    override fun onNewToken(token: String) {
        Log.d(TAG, "Refreshed token: $token")

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (childId.isNotEmpty()) {
                    // Update the token in the backend
                    val data = hashMapOf(
                        "childImei" to childId,
                        "token" to token
                    )

                    functions
                        .getHttpsCallable("registerFcmToken")
                        .call(data)
                        .await()

                    Log.d(TAG, "FCM token updated for child: $childId")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error updating FCM token", e)
            }
        }
    }
}