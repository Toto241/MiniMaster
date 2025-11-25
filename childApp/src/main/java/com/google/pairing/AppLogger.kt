package com.google.pairing

import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.perf.FirebasePerformance
import com.google.firebase.perf.metrics.Trace

/**
 * Utility class for structured logging with Firebase integration.
 * Provides methods to log info, warning, and error messages, as well as specific events
 * for accessibility, app blocking, rule syncing, and pairing.
 */
object AppLogger {
    
    private const val APP_TAG = "MiniMaster"
    
    /**
     * Logs informational messages with structured data.
     *
     * @param tag A string tag identifying the source of the log message.
     * @param message The main text of the log message.
     * @param data Optional key-value pairs to be logged as custom keys in Crashlytics.
     */
    fun logInfo(tag: String, message: String, data: Map<String, String>? = null) {
        Log.i("$APP_TAG-$tag", message)
        
        // Add custom keys to Crashlytics for better debugging
        data?.forEach { (key, value) ->
            FirebaseCrashlytics.getInstance().setCustomKey(key, value)
        }
    }
    
    /**
     * Logs warning messages with structured data.
     * Also logs a non-fatal issue to Crashlytics.
     *
     * @param tag A string tag identifying the source of the log message.
     * @param message The main text of the warning message.
     * @param data Optional key-value pairs to be logged as custom keys in Crashlytics.
     */
    fun logWarning(tag: String, message: String, data: Map<String, String>? = null) {
        Log.w("$APP_TAG-$tag", message)
        
        data?.forEach { (key, value) ->
            FirebaseCrashlytics.getInstance().setCustomKey(key, value)
        }
        
        // Log non-fatal issues to Crashlytics
        FirebaseCrashlytics.getInstance().log("WARNING [$tag]: $message")
    }
    
    /**
     * Logs error messages with structured data and exception tracking.
     * Records the exception in Crashlytics if provided.
     *
     * @param tag A string tag identifying the source of the log message.
     * @param message The main text of the error message.
     * @param throwable The optional exception or error to be recorded.
     * @param data Optional key-value pairs to be logged as custom keys in Crashlytics.
     */
    fun logError(tag: String, message: String, throwable: Throwable? = null, data: Map<String, String>? = null) {
        Log.e("$APP_TAG-$tag", message, throwable)
        
        data?.forEach { (key, value) ->
            FirebaseCrashlytics.getInstance().setCustomKey(key, value)
        }
        
        if (throwable != null) {
            FirebaseCrashlytics.getInstance().recordException(throwable)
        } else {
            FirebaseCrashlytics.getInstance().log("ERROR [$tag]: $message")
        }
    }
    
    /**
     * Logs accessibility service events for monitoring purposes.
     *
     * @param eventType The type of the accessibility event.
     * @param packageName The package name of the app associated with the event.
     * @param action The action taken or observed (default is "monitor").
     */
    fun logAccessibilityEvent(eventType: String, packageName: String, action: String = "monitor") {
        val data = mapOf(
            "event_type" to eventType,
            "package_name" to packageName,
            "action" to action,
            "timestamp" to System.currentTimeMillis().toString()
        )
        
        logInfo("AccessibilityService", "App event: $action on $packageName", data)
    }
    
    /**
     * Logs app blocking events for parental monitoring.
     *
     * @param packageName The package name of the app being blocked.
     * @param reason The reason for blocking the app.
     * @param success Boolean indicating if the blocking was successful.
     */
    fun logAppBlockingEvent(packageName: String, reason: String, success: Boolean) {
        val data = mapOf(
            "blocked_app" to packageName,
            "block_reason" to reason,
            "success" to success.toString(),
            "timestamp" to System.currentTimeMillis().toString()
        )
        
        if (success) {
            logInfo("AppBlocking", "Successfully blocked $packageName: $reason", data)
        } else {
            logWarning("AppBlocking", "Failed to block $packageName: $reason", data)
        }
    }
    
    /**
     * Logs FCM rule synchronization events.
     *
     * @param ruleType The type of rule being synced (e.g., "app_blocking", "usage_rules").
     * @param status The status of the sync operation (e.g., "success", "error").
     * @param details Optional additional details about the sync event.
     */
    fun logRuleSyncEvent(ruleType: String, status: String, details: String? = null) {
        val data = mutableMapOf(
            "rule_type" to ruleType,
            "sync_status" to status,
            "timestamp" to System.currentTimeMillis().toString()
        )
        
        details?.let { data["details"] = it }
        
        logInfo("RuleSync", "Rule sync $status for $ruleType", data)
    }
    
    /**
     * Creates and starts a Firebase Performance trace for monitoring key operations.
     *
     * @param traceName The name of the trace.
     * @return A started [Trace] instance.
     */
    fun startPerformanceTrace(traceName: String): Trace {
        return FirebasePerformance.getInstance().newTrace(traceName).apply {
            start()
        }
    }
    
    /**
     * Logs pairing events.
     *
     * @param event The name of the pairing event.
     * @param childId The ID of the child device involved, if available.
     * @param success Boolean indicating if the event was successful (default is true).
     */
    fun logPairingEvent(event: String, childId: String? = null, success: Boolean = true) {
        val data = mutableMapOf(
            "pairing_event" to event,
            "success" to success.toString(),
            "timestamp" to System.currentTimeMillis().toString()
        )
        
        childId?.let { data["child_id"] = it }
        
        if (success) {
            logInfo("Pairing", "Pairing event: $event", data)
        } else {
            logWarning("Pairing", "Pairing failed: $event", data)
        }
    }
}
