package com.google.pairing

import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import com.google.firebase.functions.FirebaseFunctions
import com.google.pairing.child.MiniMasterAccessibilityService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Periodically checks critical protection components and reports tamper attempts.
 *
 * Checks every 30 seconds while the owning service is running:
 * - Accessibility Service enabled
 * - Device Admin active
 * - Battery optimization disabled
 * - TaskMonitoringService running
 *
 * When a check fails a `tamper_detected` event is published to the backend.
 * Auto-restart actions are attempted where possible.
 */
class TamperDetectionManager(
    private val context: Context,
    private val functions: FirebaseFunctions,
    private val childIdRepository: ChildIdRepository
) {

    companion object {
        private const val TAG = "TamperDetectionManager"
        private const val CHECK_INTERVAL_MS = 30_000L // 30 seconds
    }

    private val handler = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var isRunning = false

    private val checkRunnable = object : Runnable {
        override fun run() {
            performChecks()
            if (isRunning) {
                handler.postDelayed(this, CHECK_INTERVAL_MS)
            }
        }
    }

    fun start() {
        if (isRunning) return
        isRunning = true
        handler.post(checkRunnable)
        Log.d(TAG, "Tamper detection started")
    }

    fun stop() {
        isRunning = false
        handler.removeCallbacks(checkRunnable)
        scope.cancel()
        Log.d(TAG, "Tamper detection stopped")
    }

    private fun performChecks() {
        val failures = mutableListOf<String>()

        if (!isAccessibilityServiceEnabled(context)) {
            failures.add("accessibility_service_disabled")
        }

        if (!isDeviceAdminActive(context)) {
            failures.add("device_admin_disabled")
            tryReactivateDeviceAdmin()
        }

        if (!BatteryOptimizationHelper.isIgnoringBatteryOptimizations(context)) {
            failures.add("battery_optimization_enabled")
        }

        if (!isServiceRunning(context, TaskMonitoringService::class.java.name)) {
            failures.add("task_monitoring_service_not_running")
            tryRestartTaskMonitoringService()
        }

        if (failures.isNotEmpty()) {
            val payload = failures.joinToString(",")
            publishDeviceEvent("tamper_detected", mapOf("details" to payload))
            Log.w(TAG, "Tamper detected: $payload")
        }
    }

    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val enabledServices = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false

        val expectedService = "${context.packageName}/${MiniMasterAccessibilityService::class.java.name}"
        return enabledServices.split(':').any {
            it.equals(expectedService, ignoreCase = true)
        }
    }

    private fun isDeviceAdminActive(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager
            ?: return false
        val admin = ComponentName(context, MiniMasterDeviceAdminReceiver::class.java)
        return dpm.isAdminActive(admin)
    }

    private fun isServiceRunning(context: Context, serviceClassName: String): Boolean {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            ?: return false
        return manager.getRunningServices(Integer.MAX_VALUE)
            ?.any { it.service.className == serviceClassName } ?: false
    }

    private fun tryReactivateDeviceAdmin() {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(
                DevicePolicyManager.EXTRA_DEVICE_ADMIN,
                ComponentName(context, MiniMasterDeviceAdminReceiver::class.java)
            )
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                "MiniMaster Schutz muss aktiv bleiben."
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        try {
            context.startActivity(intent)
            Log.d(TAG, "Triggered device admin reactivation intent")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to trigger device admin reactivation", e)
        }
    }

    private fun tryRestartTaskMonitoringService() {
        val intent = Intent(context, TaskMonitoringService::class.java)
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            Log.d(TAG, "Restarted TaskMonitoringService from tamper detection")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart TaskMonitoringService", e)
        }
    }

    /**
     * Publishes a device event to the backend via the `reportTamperEvent` cloud function.
     */
    private fun publishDeviceEvent(eventType: String, payload: Map<String, String>) {
        scope.launch {
            try {
                val childId = childIdRepository.getChildId().first()
                if (childId.isNullOrEmpty()) {
                    Log.w(TAG, "Cannot publish event $eventType: child ID not available")
                    return@launch
                }

                val data = hashMapOf(
                    "childId" to childId,
                    "eventType" to eventType,
                    "timestamp" to System.currentTimeMillis()
                )
                payload.forEach { (k, v) -> data[k] = v }

                functions.getHttpsCallable("reportTamperEvent").call(data)
                Log.d(TAG, "Device event published: $eventType")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to publish device event: $eventType", e)
            }
        }

        AppLogger.logWarning(TAG, "Device event published: $eventType", payload)
    }
}
