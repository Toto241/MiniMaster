package com.google.pairing.child

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.usage.UsageStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.google.firebase.functions.FirebaseFunctions
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import androidx.core.content.ContextCompat
import com.google.pairing.LockScreen
import com.google.pairing.MainActivity
import com.google.pairing.R
import com.google.pairing.AppLogger
import com.google.pairing.TaskStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.util.Calendar
import java.util.Date
import java.util.Locale

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

    private var currentTaskStatus: TaskStatus = TaskStatus.PENDING
    private var unlockEndTime: Long = 0 // System.currentTimeMillis() + unlockDuration in ms

    /**
     * BroadcastReceiver to receive task status updates from TaskMonitoringService.
     * This allows the service to know if the device should be locked due to a pending task.
     */
    private val taskStatusReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == "com.google.pairing.TASK_STATUS_UPDATE") {
                val statusString = intent.getStringExtra("task_status")
                val unlockDuration = intent.getLongExtra("unlock_duration", 0)

                currentTaskStatus = TaskStatus.fromString(statusString ?: TaskStatus.PENDING.value)

                if (currentTaskStatus == TaskStatus.APPROVED && unlockDuration > 0) {
                    // Start the timer for unlocking
                    unlockEndTime = System.currentTimeMillis() + unlockDuration * 60 * 1000 // minutes to milliseconds
                    Log.d(TAG, "Task approved. Unlocking for $unlockDuration minutes. End time: $unlockEndTime")
                } else if (currentTaskStatus != TaskStatus.APPROVED) {
                    // Reset the timer if status is not APPROVED
                    unlockEndTime = 0
                }
            }
        }
    }

    companion object {
        private const val TAG = "MiniMasterAccessService"
        private const val CHECK_INTERVAL = 1000L // 1 second
        // Settings package names that could be used to disable the service
        private val SETTINGS_PACKAGES = setOf(
            "com.android.settings",
            "com.samsung.android.app.settings",
            "com.miui.securitycenter",
            "com.huawei.systemmanager",
            "com.coloros.safecenter",
            "com.oppo.safe"
        )
    }

    private lateinit var serviceScope: CoroutineScope
    private val handler = Handler(Looper.getMainLooper())
    private var currentForegroundApp: String? = null
    private var isServiceInitialized = false
    private val blockedApps = mutableSetOf<String>()
    private var lastRulesUpdateTimestamp = 0L
    private var usageRules: org.json.JSONObject? = null
    private var dailyLimitMillis: Long = -1L
    private var currentDayUsageMillis: Long = 0L
    private var lastUsageCheckTime: Long = 0L
    private var currentDayStart: Long = 0L
    private var lastStorageWriteTime: Long = 0L
    private var lastBackendReportTime: Long = 0L
    private var allowedStartMinutes: Int? = null
    private var allowedEndMinutes: Int? = null

    // Per-app usage tracking
    private val perAppUsageMillis = mutableMapOf<String, Long>()
    private val perAppLimitsMillis = mutableMapOf<String, Long>()

    // Time window enforcement (allowed hours)
    private var allowedStartHour: Int = -1  // -1 = no restriction
    private var allowedEndHour: Int = -1
    private var allowedStartMinute: Int = 0
    private var allowedEndMinute: Int = 0

    // Self-protection: detect if user navigates to settings to disable service
    private var settingsAccessCount: Int = 0
    private var lastSettingsAccessTime: Long = 0L

    // Injected in a real app, but for PoC we instantiate lazily or get from entry point
    private val functions by lazy { FirebaseFunctions.getInstance() }
    /**
     * A [Runnable] that periodically checks the foreground app and for rule updates.
     */
    private val checkAppRunnable = object : Runnable {
        override fun run() {
            checkCurrentForegroundApp()
            checkForRuleUpdates()
            updateUsageStats()
            checkUsageLimits()
            checkTimeWindow()
            handler.postDelayed(this, CHECK_INTERVAL)
        }
    }

    override fun onCreate() {
        super.onCreate()
        serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
        // Register as not exported since only in-app broadcasts are expected.
        val filter = IntentFilter("com.google.pairing.TASK_STATUS_UPDATE")
        ContextCompat.registerReceiver(
            this,
            taskStatusReceiver,
            filter,
            ContextCompat.RECEIVER_NOT_EXPORTED
        )
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
        loadUsageData()
        loadPerAppUsageData()
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

        // 0. Self-protection: detect if user accesses device settings to disable service
        if (SETTINGS_PACKAGES.contains(packageName)) {
            handleSettingsAccess(packageName)
        } else {
            settingsAccessCount = 0
        }

        // 1. Task-based blocking logic (Highest Priority)
        if (isTaskLockActive()) {
            // If a task is pending or rejected AND the timer has expired (or never started),
            // launch the MainActivity with lock screen intent.
            val lockIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                putExtra("lock_reason", "task_lock")
            }
            startActivity(lockIntent)
            return // Task lock takes precedence
        }

        // 2. Standard blocking logic (Blacklist / Time Limits)
        if (blockedApps.contains(packageName)) {
            blockApplication(packageName)
        }
        // Force immediate check when app changes
        checkUsageLimits()
        logAppUsage(packageName)
    }

    /**
     * Blocks a given application by launching the [BlockingOverlayService] over it
     * and attempting to send a "back" action to close the blocked app.
     * @param packageName The package name of the app to block.
     */
    private fun blockApplication(packageName: String) {
        Log.i(TAG, "Blocking app: $packageName")
        try {
            // Attempt to trigger global back to close the app naturally
            performGlobalAction(GLOBAL_ACTION_BACK)

            // Show system overlay
            val intent = Intent(this, com.google.pairing.BlockingOverlayService::class.java).apply {
                action = com.google.pairing.BlockingOverlayService.ACTION_SHOW_OVERLAY
                putExtra(com.google.pairing.BlockingOverlayService.EXTRA_BLOCKED_PACKAGE, packageName)
            }
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }

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
     * Checks whether the device should be task-locked.
     * Returns true if there is a pending or rejected task and no active unlock period.
     */
    private fun isTaskLockActive(): Boolean {
        // If the task is approved and we're within the unlock window, not locked
        if (currentTaskStatus == TaskStatus.APPROVED && unlockEndTime > System.currentTimeMillis()) {
            return false
        }
        // If the task is pending or rejected, the device should be locked
        return currentTaskStatus == TaskStatus.PENDING || currentTaskStatus == TaskStatus.REJECTED
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

                val usageRulesJson = sharedPrefs.getString("usage_rules", null)
                if (usageRulesJson != null) {
                    parseUsageRules(usageRulesJson)
                }

                lastRulesUpdateTimestamp = lastUpdate
                Log.d(TAG, "Rules updated from SharedPreferences: $newBlockedApps")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking for rule updates", e)
        }
    }

    private fun parseUsageRules(json: String) {
        try {
            usageRules = org.json.JSONObject(json)

            val parsedRules = ChildProtectionPolicy.parseUsageRules(json)
            dailyLimitMillis = parsedRules.dailyLimitMillis
            perAppLimitsMillis.clear()
            perAppLimitsMillis.putAll(parsedRules.perAppLimitsMillis)
            allowedStartMinutes = parsedRules.allowedStartMinutes
            allowedEndMinutes = parsedRules.allowedEndMinutes
            if (allowedStartMinutes != null && allowedEndMinutes != null) {
                allowedStartHour = allowedStartMinutes!! / 60
                allowedStartMinute = allowedStartMinutes!! % 60
                allowedEndHour = allowedEndMinutes!! / 60
                allowedEndMinute = allowedEndMinutes!! % 60
                Log.d(TAG, "Parsed time window: $allowedStartHour:$allowedStartMinute - $allowedEndHour:$allowedEndMinute")
            } else {
                allowedStartHour = -1
                allowedEndHour = -1
                allowedStartMinute = 0
                allowedEndMinute = 0
            }

            Log.d(TAG, "Parsed per-app limits: ${perAppLimitsMillis.size} apps")

            Log.d(TAG, "Parsed usage rules: dailyLimitMillis=$dailyLimitMillis")
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing usage rules", e)
        }
    }

    private fun loadUsageData() {
        val sharedPrefs = getSharedPreferences("usage_stats", Context.MODE_PRIVATE)
        currentDayStart = sharedPrefs.getLong("current_day_start", 0L)

        // Reset if it's a new day
        val calendar = Calendar.getInstance()
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        val todayStart = calendar.timeInMillis

        if (currentDayStart != todayStart) {
            currentDayStart = todayStart
            currentDayUsageMillis = 0L
            sharedPrefs.edit()
                .putLong("current_day_start", currentDayStart)
                .putLong("current_day_usage", 0L)
                .apply()
        } else {
            currentDayUsageMillis = sharedPrefs.getLong("current_day_usage", 0L)
        }
        lastUsageCheckTime = System.currentTimeMillis()
    }

    private fun updateUsageStats() {
        val now = System.currentTimeMillis()

        // Only track usage if we have a valid foreground app that is not system
        if (currentForegroundApp != null &&
            !currentForegroundApp!!.startsWith("com.android") &&
            currentForegroundApp != packageName) {

            val delta = now - lastUsageCheckTime
            if (delta > 0 && delta < 5000) { // Sanity check for large jumps
                currentDayUsageMillis += delta

                // Per-app tracking
                val currentUsage = perAppUsageMillis[currentForegroundApp] ?: 0L
                perAppUsageMillis[currentForegroundApp!!] = currentUsage + delta

                // Persist occasionally (every 30 seconds) to save battery/IO
                if (now - lastStorageWriteTime > 30000) {
                    getSharedPreferences("usage_stats", Context.MODE_PRIVATE)
                        .edit()
                        .putLong("current_day_usage", currentDayUsageMillis)
                        .apply()
                    savePerAppUsageData()
                    lastStorageWriteTime = now
                    // Report to backend occasionally (e.g., every 5 minutes to avoid spamming)
                    if (now - lastBackendReportTime > 300000) {
                        reportUsageToBackend()
                    }
                }
            }
        }
        lastUsageCheckTime = now
    }
    /**
     * Called when the accessibility service is being unbound (disabled).
     * Reports this to the parent as a potential tamper attempt.
     */
    override fun onUnbind(intent: Intent?): Boolean {
        Log.w(TAG, "AccessibilityService is being disabled (tamper detection)")
        reportTamperEvent("accessibility_service_disabled")
        return super.onUnbind(intent)
    }

    /**
     * Reports a tamper attempt to the backend so that the parent is notified.
     */
    private fun reportTamperEvent(eventType: String) {
        val childId = getSharedPreferences("child_prefs", Context.MODE_PRIVATE)
            .getString("child_id", null) ?: return

        val data = hashMapOf(
            "childId" to childId,
            "eventType" to eventType,
            "timestamp" to System.currentTimeMillis()
        )

        serviceScope.launch(Dispatchers.IO) {
            try {
                functions.getHttpsCallable("reportTamperEvent").call(data)
                Log.d(TAG, "Tamper event reported: $eventType")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to report tamper event", e)
            }
        }

        AppLogger.logWarning(TAG, "Tamper detected: $eventType", mapOf(
            "event_type" to eventType,
            "child_id" to childId
        ))
    }

    /**
     * Detects repeated access to device settings, which may indicate an attempt
     * to disable the accessibility service or device admin.
     */
    private fun handleSettingsAccess(packageName: String) {
        val now = System.currentTimeMillis()
        if (now - lastSettingsAccessTime < 60_000) {
            settingsAccessCount++
        } else {
            settingsAccessCount = 1
        }
        lastSettingsAccessTime = now

        Log.d(TAG, "Settings access detected: $packageName (count: $settingsAccessCount)")

        // After 3 accesses within 60 seconds, report suspicious activity
        if (settingsAccessCount >= 3) {
            reportTamperEvent("repeated_settings_access")
            settingsAccessCount = 0
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(taskStatusReceiver)
        // Save final stats on destroy
        getSharedPreferences("usage_stats", Context.MODE_PRIVATE)
            .edit()
            .putLong("current_day_usage", currentDayUsageMillis)
            .apply()
        savePerAppUsageData()

        // Attempt final report
        reportUsageToBackend()

        // Report service destruction as potential tamper
        reportTamperEvent("accessibility_service_destroyed")

        stopAppMonitoring()
        serviceScope.cancel()
        Log.d(TAG, "MiniMasterAccessibilityService destroyed.")
    }

    private fun reportUsageToBackend() {
        val childId = getSharedPreferences("child_prefs", Context.MODE_PRIVATE).getString("child_id", null)
        if (childId == null) return

        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val today = sdf.format(Date())

        val data = hashMapOf(
            "childId" to childId,
            "date" to today,
            "usageMillis" to currentDayUsageMillis
        )

        serviceScope.launch(Dispatchers.IO) {
            try {
                // Using call() without waiting for result to be fire-and-forget in this context
                functions.getHttpsCallable("reportDailyUsage").call(data)
                lastBackendReportTime = System.currentTimeMillis()
                Log.d(TAG, "Usage reported to backend: $currentDayUsageMillis")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to report usage", e)
            }
        }
    }

    private fun checkUsageLimits() {
        if (ChildProtectionPolicy.shouldBlockForUsage(
                packageName = currentForegroundApp,
                ownPackageName = packageName,
                dailyLimitMillis = dailyLimitMillis,
                currentDayUsageMillis = currentDayUsageMillis,
                perAppLimitsMillis = perAppLimitsMillis,
                perAppUsageMillis = perAppUsageMillis,
            )) {
            Log.i(TAG, "Usage limit exceeded for $currentForegroundApp")
            blockApplication(currentForegroundApp!!)
        }
    }

    /**
     * Checks if the current time is within the allowed usage window.
     * Blocks all non-system apps if outside allowed hours.
     */
    private fun checkTimeWindow() {
        val calendar = Calendar.getInstance()
        val currentHour = calendar.get(Calendar.HOUR_OF_DAY)
        val currentMinute = calendar.get(Calendar.MINUTE)
        val currentMinutes = currentHour * 60 + currentMinute

        if (ChildProtectionPolicy.isOutsideAllowedWindow(
                currentMinutes = currentMinutes,
                allowedStartMinutes = allowedStartMinutes,
                allowedEndMinutes = allowedEndMinutes,
            ) && ChildProtectionPolicy.isManagedUserApp(currentForegroundApp, packageName)) {
            Log.i(TAG, "Outside allowed time window ($allowedStartHour:$allowedStartMinute - $allowedEndHour:$allowedEndMinute)")
            blockApplication(currentForegroundApp!!)
        }
    }

    /**
     * Loads per-app usage data from SharedPreferences.
     */
    private fun loadPerAppUsageData() {
        try {
            val sharedPrefs = getSharedPreferences("per_app_usage", Context.MODE_PRIVATE)
            val todayStart = getTodayStartMillis()
            val savedDayStart = sharedPrefs.getLong("day_start", 0L)

            if (savedDayStart != todayStart) {
                // New day: reset all per-app usage
                sharedPrefs.edit().clear().putLong("day_start", todayStart).apply()
                perAppUsageMillis.clear()
            } else {
                val usageJson = sharedPrefs.getString("app_usage_map", null)
                if (usageJson != null) {
                    val jsonObj = org.json.JSONObject(usageJson)
                    jsonObj.keys().forEach { key ->
                        perAppUsageMillis[key] = jsonObj.getLong(key)
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading per-app usage data", e)
        }
    }

    /**
     * Saves per-app usage data to SharedPreferences.
     */
    private fun savePerAppUsageData() {
        try {
            val jsonObj = org.json.JSONObject()
            perAppUsageMillis.forEach { (pkg, millis) ->
                jsonObj.put(pkg, millis)
            }
            getSharedPreferences("per_app_usage", Context.MODE_PRIVATE)
                .edit()
                .putString("app_usage_map", jsonObj.toString())
                .putLong("day_start", getTodayStartMillis())
                .apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving per-app usage data", e)
        }
    }

    private fun getTodayStartMillis(): Long {
        val calendar = Calendar.getInstance()
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        calendar.set(Calendar.MILLISECOND, 0)
        return calendar.timeInMillis
    }
}

