package com.google.pairing

import android.util.Log
import com.google.firebase.crashlytics.FirebaseCrashlytics
import com.google.firebase.perf.FirebasePerformance
import com.google.firebase.perf.metrics.Trace

/**
 * Utility class for structured logging with Firebase integration
 */
object AppLogger {
    
    private const val APP_TAG = "MiniMaster"
    
    /**
     * Log info messages with structured data
     */
    fun logInfo(tag: String, message: String, data: Map<String, String>? = null) {
        Log.i("$APP_TAG-$tag", message)
        
        // Add custom keys to Crashlytics for better debugging
        data?.forEach { (key, value) ->
            FirebaseCrashlytics.getInstance().setCustomKey(key, value)
        }
    }
    
    /**
     * Log warning messages with structured data
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
     * Log error messages with structured data and exception tracking
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
     * Log accessibility service events for monitoring
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
     * Log app blocking events for parental monitoring
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
     * Log FCM rule sync events
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
     * Create a performance trace for monitoring key operations
     */
    fun startPerformanceTrace(traceName: String): Trace {
        return FirebasePerformance.getInstance().newTrace(traceName).apply {
            start()
        }
    }
    
    /**
     * Log pairing events
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