package com.google.pairing

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
 * AccessibilityService for monitoring foreground applications and implementing app blocking
 * functionality. This service is the core component for parental control features.
 */
class MiniMasterAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "MiniMasterAccessService"
        private const val CHECK_INTERVAL = 1000L // Check every second
    }

    private lateinit var serviceScope: CoroutineScope
    private val handler = Handler(Looper.getMainLooper())
    private var currentForegroundApp: String? = null
    private var isServiceInitialized = false
    private val blockedApps = mutableSetOf<String>()
    private var lastRulesUpdate = 0L
    
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
        Log.d(TAG, "MiniMasterAccessibilityService created")
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        Log.d(TAG, "AccessibilityService connected")
        
        // Configure service info
        val info = AccessibilityServiceInfo().apply {
            eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                        AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                   AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            notificationTimeout = 100
        }
        serviceInfo = info
        
        isServiceInitialized = true
        startAppMonitoring()
        Log.d(TAG, "AccessibilityService initialized and monitoring started")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event?.let {
            when (it.eventType) {
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                    handleWindowStateChanged(it)
                }
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                    // Can be used for more granular monitoring if needed
                    Log.v(TAG, "Window content changed in ${it.packageName}")
                }
            }
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "AccessibilityService interrupted")
        stopAppMonitoring()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAppMonitoring()
        serviceScope.cancel()
        Log.d(TAG, "MiniMasterAccessibilityService destroyed")
    }

    private fun startAppMonitoring() {
        handler.post(checkAppRunnable)
        Log.d(TAG, "App monitoring started")
    }

    private fun stopAppMonitoring() {
        handler.removeCallbacks(checkAppRunnable)
        Log.d(TAG, "App monitoring stopped")
    }

    private fun handleWindowStateChanged(event: AccessibilityEvent) {
        val packageName = event.packageName?.toString() ?: return
        
        // Skip system apps and our own app
        if (packageName.startsWith("com.android") || 
            packageName == "com.google.pairing.child") {
            return
        }

        Log.d(TAG, "Window state changed: $packageName")
        
        if (packageName != currentForegroundApp) {
            currentForegroundApp = packageName
            onForegroundAppChanged(packageName)
        }
    }

    private fun checkCurrentForegroundApp() {
        try {
            val usageStatsManager = getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            if (usageStatsManager == null) {
                Log.w(TAG, "UsageStatsManager not available")
                return
            }

            val currentTime = System.currentTimeMillis()
            val stats = usageStatsManager.queryUsageStats(
                UsageStatsManager.INTERVAL_DAILY,
                currentTime - 1000 * 60, // Last minute
                currentTime
            )

            if (stats.isNullOrEmpty()) {
                return
            }

            // Find the most recently used app
            val mostRecentApp = stats.maxByOrNull { it.lastTimeUsed }
            val packageName = mostRecentApp?.packageName

            if (packageName != null && packageName != currentForegroundApp) {
                currentForegroundApp = packageName
                onForegroundAppChanged(packageName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking foreground app", e)
        }
    }

    private fun onForegroundAppChanged(packageName: String) {
        Log.d(TAG, "Foreground app changed to: $packageName")
        
        // Check if app should be blocked
        if (blockedApps.contains(packageName)) {
            blockApplication(packageName)
        }
        
        // Log usage for monitoring
        logAppUsage(packageName)
    }

    private fun blockApplication(packageName: String) {
        Log.d(TAG, "Blocking app: $packageName")
        
        try {
            // Force user back to our app
            val intent = Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or 
                       Intent.FLAG_ACTIVITY_CLEAR_TOP or
                       Intent.FLAG_ACTIVITY_SINGLE_TOP
                putExtra("blocked_app", packageName)
                putExtra("reason", "app_blocked")
            }
            startActivity(intent)
            
            // Also try to close the blocked app if possible
            performGlobalAction(GLOBAL_ACTION_BACK)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error blocking app $packageName", e)
        }
    }

    private fun logAppUsage(packageName: String) {
        serviceScope.launch {
            try {
                // This could be expanded to send usage data to Firebase
                Log.i(TAG, "App usage logged: $packageName at ${System.currentTimeMillis()}")
                
                // TODO: Send usage data to Firebase Functions for parental monitoring
                // This would integrate with the existing Firebase backend
                
            } catch (e: Exception) {
                Log.e(TAG, "Error logging app usage", e)
            }
        }
    }

    /**
     * Update the list of blocked applications
     * This method should be called when rules are updated via FCM
     */
    fun updateBlockedApps(newBlockedApps: Set<String>) {
        blockedApps.clear()
        blockedApps.addAll(newBlockedApps)
        Log.d(TAG, "Updated blocked apps list: $blockedApps")
    }

    private fun checkForRuleUpdates() {
        try {
            val sharedPrefs = getSharedPreferences("accessibility_rules", Context.MODE_PRIVATE)
            val lastUpdate = sharedPrefs.getLong("last_update", 0L)
            
            if (lastUpdate > lastRulesUpdate) {
                val blockedAppsSet = sharedPrefs.getStringSet("blocked_apps", emptySet()) ?: emptySet()
                updateBlockedApps(blockedAppsSet)
                lastRulesUpdate = lastUpdate
                Log.d(TAG, "Rules updated from shared preferences: $blockedAppsSet")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for rule updates", e)
        }
    }

    /**
     * Get current foreground application package name
     */
    fun getCurrentForegroundApp(): String? = currentForegroundApp

    /**
     * Check if the service is properly initialized and running
     */
    fun isRunning(): Boolean = isServiceInitialized

    /**
     * Force block a specific app immediately
     */
    fun forceBlockApp(packageName: String) {
        if (!blockedApps.contains(packageName)) {
            blockedApps.add(packageName)
        }
        
        if (currentForegroundApp == packageName) {
            blockApplication(packageName)
        }
    }
}