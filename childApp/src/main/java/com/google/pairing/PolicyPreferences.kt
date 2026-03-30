package com.google.pairing

import android.content.Context

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
}
