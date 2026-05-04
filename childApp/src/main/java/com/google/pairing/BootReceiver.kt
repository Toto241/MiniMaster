package com.google.pairing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Ensures critical services restart after system events that would otherwise
 * silently disable app blocking (reboot, app update, OEM kill).
 *
 * Actions handled:
 * - BOOT_COMPLETED: Device restarted, all services killed by OS.
 * - PACKAGE_REPLACED / MY_PACKAGE_REPLACED: App updated via Play Store / sideload.
 * - LOCKED_BOOT_COMPLETED: Device restarted but still locked (direct boot mode).
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "MiniMasterBoot"
        private const val WORK_TAG = "minimaster_periodic_sync"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        Log.i(TAG, "BootReceiver triggered: $action")

        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_LOCKED_BOOT_COMPLETED,
            Intent.ACTION_PACKAGE_REPLACED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                schedulePeriodicSyncWork(context)
                // Attempt to re-bind AccessibilityService via settings intent
                // (User must have already granted permission; this just nudges the system)
                promptAccessibilityServiceIfNeeded(context)
            }
        }
    }

    private fun schedulePeriodicSyncWork(context: Context) {
        val workRequest = PeriodicWorkRequestBuilder<RuleSyncWorker>(15, TimeUnit.MINUTES)
            .addTag(WORK_TAG)
            .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_TAG,
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
        Log.i(TAG, "Scheduled periodic RuleSyncWorker (15 min)")
    }

    private fun promptAccessibilityServiceIfNeeded(context: Context) {
        // AccessibilityService must be enabled by user; we cannot force it.
        // Log a reminder that the service may need manual re-enable after update.
        Log.w(TAG, "If app blocking stopped working after reboot/update, " +
                "re-enable MiniMasterAccessibilityService in Settings → Accessibility.")
    }
}
