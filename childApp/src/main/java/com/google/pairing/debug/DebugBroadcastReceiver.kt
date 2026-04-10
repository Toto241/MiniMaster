package com.google.pairing.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.pairing.BuildConfig
import com.google.pairing.ChildIdentityStorage
import kotlinx.coroutines.runBlocking

/**
 * Receives diagnostic broadcasts from the debug-only manifest receiver.
 *
 * Available actions:
 *  com.google.pairing.DEBUG_GET_CHALLENGE  – issues a one-time HMAC nonce
 *  com.google.pairing.DEBUG_ACTIVATE       – activates a session (extra: "response")
 *  com.google.pairing.DEBUG_DEACTIVATE     – terminates the active session
 *  com.google.pairing.DEBUG_DUMP_STATE     – dumps app state to logcat
 *
 * The receiver exists only in debug builds and is registered with android:exported="false".
 */
class DebugBroadcastReceiver : BroadcastReceiver() {

    private val tag = "MINIMASTER_DEBUG_CHILD"

    override fun onReceive(context: Context, intent: Intent) {
        if (!BuildConfig.DEBUG) {
            Log.w(tag, "Debug broadcast rejected in non-debug build.")
            return
        }

        when (intent.action) {

            ACTION_GET_CHALLENGE -> {
                val challenge = DebugSessionManager.generateChallenge()
                if (challenge == null) {
                    setResultCode(2)
                    setResultData("DEBUG_INTERFACE_DISABLED")
                    Log.w(tag, "Challenge generation failed: debug interface disabled.")
                } else {
                    setResultCode(0)
                    setResultData(challenge)
                    Log.i(tag, "Challenge generated. Read with: adb logcat -s MINIMASTER_DEBUG_CHALLENGE_CHILD -d")
                }
            }

            ACTION_ACTIVATE -> {
                val response = intent.getStringExtra("response") ?: run {
                    Log.w(tag, "DEBUG_ACTIVATE: missing extra 'response'.")
                    return
                }
                val success = DebugSessionManager.activateSession(response)
                Log.i(tag, if (success) "Session activated." else "Activation FAILED – wrong token.")
            }

            ACTION_DEACTIVATE -> {
                DebugSessionManager.deactivateSession()
            }

            ACTION_DUMP_STATE -> {
                if (!DebugSessionManager.isSessionActive()) {
                    Log.w(tag, "DUMP_STATE rejected: no active debug session.")
                    return
                }

                val lockPrefs = context.getSharedPreferences("device_lock", Context.MODE_PRIVATE)
                val isLocked = lockPrefs.getBoolean("is_locked", false)

                val rulesPrefs = context.getSharedPreferences("accessibility_rules", Context.MODE_PRIVATE)
                val blockedApps = rulesPrefs.getStringSet("blocked_apps", emptySet()) ?: emptySet()

                val childId = runBlocking { ChildIdentityStorage.readChildId(context) }
                val pairingState = if (childId != null) "PAIRED(last4:${childId.takeLast(4)})" else "UNPAIRED"

                val json = DebugSessionManager.dumpStateJson(
                    pairingState = pairingState,
                    isLocked = isLocked,
                    // AccessibilityService running status is checked via system service API
                    accessibilityServiceRunning = isAccessibilityServiceRunning(context),
                    blockedAppsCount = blockedApps.size,
                    pendingTasksCount = -1, // requires Firestore query – not safe in BroadcastReceiver
                    settingsAccessCount = -1, // in-memory only within AccessibilityService
                    lastRulesSyncEpoch = rulesPrefs.getLong("last_sync_epoch", 0L),
                    heartbeatLastSentEpoch = context
                        .getSharedPreferences("heartbeat_prefs", Context.MODE_PRIVATE)
                        .getLong("last_sent_epoch", 0L)
                )
                Log.i(TAG_STATE, json)
            }

            else -> Log.w(tag, "Unknown debug action: ${intent.action}")
        }
    }

    private fun isAccessibilityServiceRunning(context: Context): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as android.view.accessibility.AccessibilityManager
        val enabledServices = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        val packageName = context.packageName
        return enabledServices.contains("$packageName/")
    }

    companion object {
        const val ACTION_GET_CHALLENGE = "com.google.pairing.DEBUG_GET_CHALLENGE"
        const val ACTION_ACTIVATE      = "com.google.pairing.DEBUG_ACTIVATE"
        const val ACTION_DEACTIVATE    = "com.google.pairing.DEBUG_DEACTIVATE"
        const val ACTION_DUMP_STATE    = "com.google.pairing.DEBUG_DUMP_STATE"
        const val TAG_STATE            = "MINIMASTER_DEBUG_STATE_CHILD"
    }
}
