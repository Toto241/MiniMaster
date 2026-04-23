package com.google.pairing

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log

/**
 * Helper for checking and requesting battery optimization exemption.
 *
 * On Android 6.0+ (API 23), Doze mode and App Standby can aggressively kill background
 * services. This helper checks whether the app is already whitelisted and provides a
 * convenience method to open the system dialog that lets the user disable optimizations
 * for MiniMaster.
 */
object BatteryOptimizationHelper {

    private const val TAG = "BatteryOptimizationHelper"

    /**
     * Returns true if the app is already excluded from Doze / App Standby.
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            powerManager.isIgnoringBatteryOptimizations(context.packageName)
        } else {
            true // Pre-Marshmallow: no Doze mode exists.
        }
    }

    /**
     * Opens the system dialog that requests the user to disable battery optimizations
     * for this app. If the direct intent is not available, falls back to the general
     * app-info screen.
     */
    fun requestBatteryOptimizationExemption(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${context.packageName}")
            }
            try {
                if (context is Activity) {
                    context.startActivity(intent)
                } else {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    context.startActivity(intent)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to open battery optimization settings", e)
                val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(fallback)
            }
        }
    }
}
