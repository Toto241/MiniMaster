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
                    // TODO: Implement device locking logic if needed
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
                
                Log.d(TAG, "App rules updated: $blockedApps")
            } catch (e: Exception) {
                Log.e(TAG, "Error parsing blocked apps", e)
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
                    // TODO: Implement rule sync logic with Firebase Functions
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error during sync request", e)
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