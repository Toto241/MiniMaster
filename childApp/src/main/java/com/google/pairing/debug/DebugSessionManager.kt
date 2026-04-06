package com.google.pairing.debug

import android.util.Log
import com.google.pairing.BuildConfig
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Manages a time-limited debug session for the child app, activated via ADB broadcast.
 *
 * Security model:
 *  1. ADB physical gate (USB + USB-debugging enabled)
 *  2. Challenge-Response with HMAC-SHA256 (one-time nonce per activation attempt)
 *  3. Session auto-expires after SESSION_DURATION_MS (30 min)
 *  4. Explicit deactivation clears all state immediately
 *  5. Secret separate from masterApp – both embedded at build time from local.properties
 *
 *  ADB usage:
 *    # Request challenge
 *    adb shell am broadcast -a com.google.pairing.DEBUG_GET_CHALLENGE
 *    adb logcat -s MINIMASTER_DEBUG_CHALLENGE_CHILD -d | tail -1
 *
 *    # Generate token (scripts/generate-debug-token.ps1 -AppId child -Challenge <nonce>)
 *
 *    # Activate session
 *    adb shell am broadcast -a com.google.pairing.DEBUG_ACTIVATE \
 *        -e response <token>
 *
 *    # Deactivate session
 *    adb shell am broadcast -a com.google.pairing.DEBUG_DEACTIVATE
 */
object DebugSessionManager {

    private const val TAG = "MINIMASTER_DEBUG_CHILD"
    private const val TAG_CHALLENGE = "MINIMASTER_DEBUG_CHALLENGE_CHILD"
    private const val TAG_STATE = "MINIMASTER_DEBUG_STATE_CHILD"

    private const val SESSION_DURATION_MS = 30L * 60 * 1000 // 30 minutes
    private const val HMAC_SUFFIX = "_ACTIVATE_CHILD"
    private const val HMAC_ALGORITHM = "HmacSHA256"

    @Volatile private var sessionActive = false
    @Volatile private var sessionExpiresAt = 0L
    @Volatile private var pendingChallenge: String? = null

    // ──────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────

    /** Returns true while an authenticated, non-expired session is active. */
    fun isSessionActive(): Boolean {
        if (sessionActive && System.currentTimeMillis() > sessionExpiresAt) {
            deactivateSession()
        }
        return sessionActive
    }

    /**
     * Generates a one-time nonce and logs it to logcat.
     * The previous pending challenge is invalidated.
     */
    fun generateChallenge(): String? {
        if (isSecretDisabled()) {
            Log.w(TAG, "Debug interface is DISABLED (secret not configured in local.properties).")
            return null
        }
        val nonce = UUID.randomUUID().toString().replace("-", "")
        pendingChallenge = nonce
        Log.i(TAG_CHALLENGE, "CHALLENGE:$nonce")
        Log.i(TAG, "Debug challenge issued. Expires after first activation attempt.")
        return nonce
    }

    /**
     * Validates [response] against the pending challenge.
     * On success: starts a 30-min session, invalidates the challenge.
     * On failure: invalidates the challenge (no retry with same nonce).
     *
     * @return true if activation succeeded
     */
    fun activateSession(response: String): Boolean {
        if (isSecretDisabled()) {
            Log.w(TAG, "Activation rejected: secret is DISABLED.")
            return false
        }
        val challenge = pendingChallenge
        pendingChallenge = null // one-time use – consumed regardless of outcome

        if (challenge == null) {
            Log.w(TAG, "Activation rejected: no pending challenge (call DEBUG_GET_CHALLENGE first).")
            return false
        }

        val expected = computeHmac(challenge + HMAC_SUFFIX)
        return if (constantTimeEquals(expected, response)) {
            sessionActive = true
            sessionExpiresAt = System.currentTimeMillis() + SESSION_DURATION_MS
            Log.i(TAG, "Debug session ACTIVATED. Expires in 30 min.")
            true
        } else {
            Log.w(TAG, "Activation rejected: invalid response token.")
            false
        }
    }

    /** Immediately terminates the active debug session and clears all state. */
    fun deactivateSession() {
        sessionActive = false
        sessionExpiresAt = 0L
        pendingChallenge = null
        Log.i(TAG, "Debug session DEACTIVATED.")
    }

    /**
     * Returns a JSON string with non-sensitive diagnostic state.
     * Only callable while an active session exists.
     */
    fun dumpStateJson(
        pairingState: String,
        isLocked: Boolean,
        accessibilityServiceRunning: Boolean,
        blockedAppsCount: Int,
        pendingTasksCount: Int,
        settingsAccessCount: Int,
        lastRulesSyncEpoch: Long,
        heartbeatLastSentEpoch: Long
    ): String {
        if (!isSessionActive()) {
            return """{"error":"no_active_debug_session"}"""
        }
        val remaining = ((sessionExpiresAt - System.currentTimeMillis()) / 1000 / 60).coerceAtLeast(0)
        return """
{
  "app": "childApp",
  "sessionActive": true,
  "sessionRemainingMin": $remaining,
  "pairingState": "$pairingState",
  "isLocked": $isLocked,
  "accessibilityServiceRunning": $accessibilityServiceRunning,
  "blockedAppsCount": $blockedAppsCount,
  "pendingTasksCount": $pendingTasksCount,
  "settingsAccessCount": $settingsAccessCount,
  "lastRulesSyncEpoch": $lastRulesSyncEpoch,
  "heartbeatLastSentEpoch": $heartbeatLastSentEpoch
}""".trimIndent()
    }

    // ──────────────────────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────────────────────

    private fun isSecretDisabled(): Boolean =
        BuildConfig.DEBUG_SESSION_SECRET_CHILD == "DISABLED"

    private fun computeHmac(data: String): String {
        val key = BuildConfig.DEBUG_SESSION_SECRET_CHILD.toByteArray(Charsets.UTF_8)
        val mac = Mac.getInstance(HMAC_ALGORITHM)
        mac.init(SecretKeySpec(key, HMAC_ALGORITHM))
        return mac.doFinal(data.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    /** Constant-time string comparison to mitigate timing attacks. */
    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }
}
