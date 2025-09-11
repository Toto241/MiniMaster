package com.google.pairing.child

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.*

/**
 * An [AccessibilityService] for monitoring foreground applications and implementing app blocking.
 *
 * This service is the core of the child app's parental control features. It performs two main duties:
 * 1.  It uses a periodic handler to check the foreground app and determine if it should be blocked.
 * 2.  It continuously checks for updated blocking rules from [SharedPreferences], which are
 *     written by [RuleSyncService] when an FCM message is received.
 *
 * This dual-check mechanism ensures that the app can block applications based on the latest rules
 * and can also detect if a user quickly switches to a blocked app.
 */
class MiniMasterAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "MiniMasterAccessService"
        private const val CHECK_INTERVAL = 1000L // 1 second
    }

    private lateinit var serviceScope: CoroutineScope
    private val handler = Handler(Looper.getMainLooper())
    private var currentForegroundApp: String? = null
    private var isServiceInitialized = false
    private val blockedApps = mutableSetOf<String>()
    private var lastRulesUpdateTimestamp = 0L
    
    /**
     * A [Runnable] that periodically checks the foreground app and for rule updates.
     */
    private val checkAppRunnable = object : Runnable {
        override fun run() {
            checkCurrentForegroundApp()
            checkForRuleUpdates()
            handler.postDelayed(this, CHECK_INTERVAL)
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    }

    /**
     * Called by the system when the service is first connected (i.e., when the user
     * enables it in settings). It sets up the service's configuration and starts monitoring.
     */
    override fun onServiceConnected() {
        super.onServiceConnected()
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
        }
        serviceInfo = info
        isServiceInitialized = true
        startAppMonitoring()
        Log.d(TAG, "AccessibilityService connected and monitoring started.")
    }

    /**
     * The primary callback for receiving accessibility events.
     * This implementation focuses on window state changes to detect app switches.
     * @param event The [AccessibilityEvent] that occurred.
     */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            handleWindowStateChanged(event)
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "AccessibilityService interrupted.")
        stopAppMonitoring()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAppMonitoring()
        serviceScope.cancel()
        Log.d(TAG, "MiniMasterAccessibilityService destroyed.")
    }

    /**
     * Starts the periodic check runnable.
     */
    private fun startAppMonitoring() {
        handler.post(checkAppRunnable)
    }

    /**
     * Stops the periodic check runnable.
     */
    private fun stopAppMonitoring() {
        handler.removeCallbacks(checkAppRunnable)
    }

    /**
     * Handles [AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED] events to identify
     * when the foreground app changes.
     * @param event The window state change event.
     */
    private fun handleWindowStateChanged(event: AccessibilityEvent) {
        val packageName = event.packageName?.toString() ?: return
        if (packageName.startsWith("com.android") || packageName == applicationInfo.packageName) {
            return
        }
        if (packageName != currentForegroundApp) {
            currentForegroundApp = packageName
            onForegroundAppChanged(packageName)
        }
    }

    /**
     * Uses [UsageStatsManager] to get the most recent foreground application.
     * This is a fallback mechanism to the event-driven approach.
     */
    private fun checkCurrentForegroundApp() {
        try {
            val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
            val currentTime = System.currentTimeMillis()
            val stats = usageStatsManager.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, currentTime - 1000 * 60, currentTime)
            val mostRecentApp = stats?.maxByOrNull { it.lastTimeUsed }
            val packageName = mostRecentApp?.packageName

            if (packageName != null && packageName != currentForegroundApp) {
                currentForegroundApp = packageName
                onForegroundAppChanged(packageName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking foreground app", e)
        }
    }

    /**
     * Called whenever a new application is detected in the foreground.
     * It checks if the app is in the blocklist and takes action if necessary.
     * @param packageName The package name of the new foreground app.
     */
    private fun onForegroundAppChanged(packageName: String) {
        Log.d(TAG, "Foreground app changed to: $packageName")
        if (blockedApps.contains(packageName)) {
            blockApplication(packageName)
        }
        logAppUsage(packageName)
    }

    /**
     * Blocks a given application by launching the [MainActivity] over it
     * and attempting to send a "back" action to close the blocked app.
     * @param packageName The package name of the app to block.
     */
    private fun blockApplication(packageName: String) {
        Log.i(TAG, "Blocking app: $packageName")
        try {
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("blocked_app", packageName)
            }
            startActivity(intent)
            performGlobalAction(GLOBAL_ACTION_BACK)
            AppLogger.logAppBlockingEvent(packageName, "parental_control_rule", true)
        } catch (e: Exception) {
            Log.e(TAG, "Error blocking app $packageName", e)
            AppLogger.logAppBlockingEvent(packageName, "blocking_error", false)
        }
    }

    /**
     * Logs the usage of an application. In a full implementation, this would send
     * data to the backend for parental review.
     * @param packageName The package name of the app being used.
     */
    private fun logAppUsage(packageName: String) {
        serviceScope.launch {
            Log.i(TAG, "App usage logged: $packageName")
            // In a real app, this would call a function to send data to a backend.
        }
    }

    /**
     * Updates the internal set of blocked application package names.
     * @param newBlockedApps The new set of apps to block.
     */
    private fun updateBlockedApps(newBlockedApps: Set<String>) {
        blockedApps.clear()
        blockedApps.addAll(newBlockedApps)
        Log.d(TAG, "Updated blocked apps list: $blockedApps")
    }

    /**
     * Checks [SharedPreferences] to see if a newer set of rules has been persisted
     * by the [RuleSyncService]. If so, updates the local `blockedApps` set.
     */
    private fun checkForRuleUpdates() {
        try {
            val sharedPrefs = getSharedPreferences("accessibility_rules", Context.MODE_PRIVATE)
            val lastUpdate = sharedPrefs.getLong("last_update", 0L)
            if (lastUpdate > lastRulesUpdateTimestamp) {
                val newBlockedApps = sharedPrefs.getStringSet("blocked_apps", emptySet()) ?: emptySet()
                updateBlockedApps(newBlockedApps)
                lastRulesUpdateTimestamp = lastUpdate
                Log.d(TAG, "Rules updated from SharedPreferences: $newBlockedApps")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for rule updates", e)
        }
    }
}