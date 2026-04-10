package com.google.pairing

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import android.widget.Toast
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * DeviceAdminReceiver implementation to prevent uninstallation and enforce policies.
 * Reports disable attempts to the backend so the parent is notified.
 */
class MiniMasterDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "MiniMasterDeviceAdmin"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device Admin Enabled")
        Toast.makeText(context, "MiniMaster protection enabled", Toast.LENGTH_SHORT).show()
        applyUninstallProtection(context)
        reportAdminEvent(context, "device_admin_enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d(TAG, "Device Admin Disabled")
        Toast.makeText(context, "MiniMaster protection disabled", Toast.LENGTH_SHORT).show()
        reportAdminEvent(context, "device_admin_disabled")
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.w(TAG, "Device Admin disable requested — potential tamper attempt")
        reportAdminEvent(context, "device_admin_disable_requested")
        return "Disabling this will remove parental controls. Your parents will be notified."
    }

    private fun applyUninstallProtection(context: Context) {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return
        val admin = ComponentName(context, MiniMasterDeviceAdminReceiver::class.java)
        UninstallProtectionPolicy.apply(
            devicePolicyManager = dpm,
            admin = admin,
            packageName = context.packageName,
            sdkInt = Build.VERSION.SDK_INT,
            logInfo = { Log.i(TAG, it) },
            logWarning = { message, error -> Log.w(TAG, message, error) },
        )
    }

    /**
     * Reports device admin state changes to the backend for parent notification.
     */
    private fun reportAdminEvent(context: Context, eventType: String) {
        val childId = runBlocking { ChildIdentityStorage.readChildId(context.applicationContext) } ?: return

        val data = hashMapOf(
            "childId" to childId,
            "eventType" to eventType,
            "timestamp" to System.currentTimeMillis()
        )

        CoroutineScope(Dispatchers.IO).launch {
            try {
                FirebaseFunctions.getInstance()
                    .getHttpsCallable("reportTamperEvent")
                    .call(data)
                Log.d(TAG, "Admin event reported: $eventType")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to report admin event: $eventType", e)
            }
        }

        AppLogger.logWarning(TAG, "Device admin event: $eventType", mapOf(
            "event_type" to eventType,
            "child_id" to childId
        ))
    }
}

internal object UninstallProtectionPolicy {
    fun apply(
        devicePolicyManager: DevicePolicyManager?,
        admin: ComponentName,
        packageName: String,
        sdkInt: Int = Build.VERSION.SDK_INT,
        logInfo: (String) -> Unit = {},
        logWarning: (String, Throwable?) -> Unit = { _, _ -> },
    ): Boolean {
        if (sdkInt < Build.VERSION_CODES.P || devicePolicyManager == null) {
            return false
        }

        if (!devicePolicyManager.isAdminActive(admin)) {
            return false
        }

        return try {
            val wasBlocked = devicePolicyManager.isUninstallBlocked(admin, packageName)
            if (!wasBlocked) {
                devicePolicyManager.setUninstallBlocked(admin, packageName, true)
                logInfo("Uninstall protection enabled via DevicePolicyManager")
                true
            } else {
                false
            }
        } catch (security: SecurityException) {
            logWarning("setUninstallBlocked requires device owner/profile owner; skipping", security)
            false
        } catch (error: Exception) {
            logWarning("Failed to apply uninstall protection", error)
            false
        }
    }
}
