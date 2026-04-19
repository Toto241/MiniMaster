package com.google.pairing

import android.content.Context
import com.google.pairing.child.CachedPolicy
import com.google.pairing.child.OfflinePolicyCache

/**
 * Thin wrapper around the two SharedPreferences stores used by [MiniMasterAccessibilityService]
 * and [RuleSyncService] to persist the device policy.
 *
 * Keys are kept identical to the existing code so all readers (AccessibilityService,
 * DebugBroadcastReceiver, …) continue to work without modification.
 */
object PolicyPreferences {

    private const val PREFS_LOCK = "device_lock"
    private const val KEY_IS_LOCKED = "is_locked"

    private const val PREFS_RULES = "accessibility_rules"
    private const val KEY_BLOCKED_APPS = "blocked_apps"
    private const val KEY_USAGE_RULES = "usage_rules"
    private const val KEY_LAST_UPDATE = "last_update"

    private const val PREFS_OFFLINE = "offline_policy_cache"
    private const val KEY_CACHED_POLICY = "cached_policy_v1"
    private const val KEY_SAFE_MODE = "safe_mode_payload_v1"

    fun setLocked(context: Context, isLocked: Boolean) {
        context.getSharedPreferences(PREFS_LOCK, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_IS_LOCKED, isLocked).apply()
    }

    fun isLocked(context: Context): Boolean =
        context.getSharedPreferences(PREFS_LOCK, Context.MODE_PRIVATE)
            .getBoolean(KEY_IS_LOCKED, false)

    fun setBlockedApps(context: Context, apps: Set<String>) {
        context.getSharedPreferences(PREFS_RULES, Context.MODE_PRIVATE).edit()
            .putStringSet(KEY_BLOCKED_APPS, apps)
            .putLong(KEY_LAST_UPDATE, System.currentTimeMillis())
            .apply()
    }

    fun getBlockedApps(context: Context): Set<String> =
        context.getSharedPreferences(PREFS_RULES, Context.MODE_PRIVATE)
            .getStringSet(KEY_BLOCKED_APPS, emptySet()) ?: emptySet()

    fun setUsageRules(context: Context, usageRulesJson: String) {
        context.getSharedPreferences(PREFS_RULES, Context.MODE_PRIVATE).edit()
            .putString(KEY_USAGE_RULES, usageRulesJson)
            .putLong(KEY_LAST_UPDATE, System.currentTimeMillis())
            .apply()
    }

    fun getUsageRules(context: Context): String? =
        context.getSharedPreferences(PREFS_RULES, Context.MODE_PRIVATE)
            .getString(KEY_USAGE_RULES, null)

    // ── Offline-Policy-Cache ──────────────────────────────────────────────

    /**
     * Persists the most recently applied policy as a `CachedPolicy` snapshot so
     * [com.google.pairing.child.OfflinePolicyCache] can later decide whether to
     * keep enforcing it after a long offline period.
     */
    fun setCachedPolicy(context: Context, cache: CachedPolicy) {
        context.getSharedPreferences(PREFS_OFFLINE, Context.MODE_PRIVATE).edit()
            .putString(KEY_CACHED_POLICY, OfflinePolicyCache.toJson(cache))
            .apply()
    }

    fun getCachedPolicy(context: Context): CachedPolicy? {
        val raw = context.getSharedPreferences(PREFS_OFFLINE, Context.MODE_PRIVATE)
            .getString(KEY_CACHED_POLICY, null)
        return OfflinePolicyCache.fromJson(raw)
    }

    /**
     * Persists the safe-mode payload that should be enforced once the cache is
     * older than [OfflinePolicyCache.DEFAULT_HARD_EXPIRE_MS]. Set during pairing.
     */
    fun setSafeModePayload(context: Context, payloadJson: String) {
        context.getSharedPreferences(PREFS_OFFLINE, Context.MODE_PRIVATE).edit()
            .putString(KEY_SAFE_MODE, payloadJson)
            .apply()
    }

    fun getSafeModePayload(context: Context): String =
        context.getSharedPreferences(PREFS_OFFLINE, Context.MODE_PRIVATE)
            .getString(KEY_SAFE_MODE, null)
            ?: OfflinePolicyCache.SAFE_MODE_DEFAULT_JSON
}
