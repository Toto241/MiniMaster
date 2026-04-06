package com.minimaster.masterapp.debug

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Receives diagnostic broadcasts sent exclusively via ADB (android:exported="false").
 *
 * Available actions:
 *  com.minimaster.masterapp.DEBUG_GET_CHALLENGE  – issues a one-time HMAC nonce
 *  com.minimaster.masterapp.DEBUG_ACTIVATE       – activates a session (extra: "response")
 *  com.minimaster.masterapp.DEBUG_DEACTIVATE     – terminates the active session
 *  com.minimaster.masterapp.DEBUG_DUMP_STATE     – dumps app state to logcat
 *
 * The receiver is registered in the manifest with android:exported="false"
 * so it is only reachable via ADB on a connected, unlocked device.
 */
class DebugBroadcastReceiver : BroadcastReceiver() {

    private val tag = "MINIMASTER_DEBUG"

    override fun onReceive(context: Context, intent: Intent) {
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
                    Log.i(tag, "Challenge generated. Read with: adb logcat -s MINIMASTER_DEBUG_CHALLENGE -d")
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
                val prefs = context.getSharedPreferences("master_prefs", Context.MODE_PRIVATE)
                val imei = prefs.getString("imei", "") ?: ""
                val secretKey = prefs.getString("secret_key", "") ?: ""
                val legalConsent = prefs.getBoolean("legal_consent_accepted", false)
                val fcmToken = prefs.getString("fcm_token", "") ?: ""
                val registrationState = prefs.getString("registration_state", "UNREGISTERED") ?: "UNREGISTERED"

                val json = DebugSessionManager.dumpStateJson(
                    registrationState = registrationState,
                    imeiLast4 = imei.takeLast(4).ifEmpty { "----" },
                    secretKeyLast4 = secretKey.takeLast(4).ifEmpty { "----" },
                    legalConsentAccepted = legalConsent,
                    fcmTokenLast8 = fcmToken.takeLast(8).ifEmpty { "--------" }
                )
                Log.i(TAG_STATE, json)
            }

            else -> Log.w(tag, "Unknown debug action: ${intent.action}")
        }
    }

    companion object {
        const val ACTION_GET_CHALLENGE = "com.minimaster.masterapp.DEBUG_GET_CHALLENGE"
        const val ACTION_ACTIVATE      = "com.minimaster.masterapp.DEBUG_ACTIVATE"
        const val ACTION_DEACTIVATE    = "com.minimaster.masterapp.DEBUG_DEACTIVATE"
        const val ACTION_DUMP_STATE    = "com.minimaster.masterapp.DEBUG_DUMP_STATE"
        const val TAG_STATE            = "MINIMASTER_DEBUG_STATE"
    }
}
