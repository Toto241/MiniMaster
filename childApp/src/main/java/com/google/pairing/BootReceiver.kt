package com.google.pairing

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Receives boot-related broadcasts to restart necessary services after a reboot.
 *
 * Handles standard boot completion as well as OEM-specific reboot actions.
 * Samsung, Xiaomi, Huawei and OnePlus devices aggressively optimise battery
 * usage; the comments below point out the extra steps users may have to take
 * on those ROMs.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
        private const val HEARTBEAT_WORK_NAME = "heartbeat_worker"
        private const val RESTART_ALARM_REQUEST_CODE = 9001
        private const val RESTART_DELAY_MS = 5_000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            Log.d(TAG, "Boot event received: $action. Initializing MiniMaster services.")

            // OEM-specific battery-optimisation notes:
            // Samsung: Device Care > Battery > Background usage limits > Auto start
            // Xiaomi:  Settings > Apps > Permissions > Auto-start
            // Huawei:  Phone Manager > App launch > set to "Manual" and enable all switches
            // OnePlus: App info > Battery > Battery optimisation > "Don't optimise"

            startTaskMonitoringService(context)
            scheduleRestartAlarm(context)
            scheduleHeartbeatWorker(context)
            launchMainActivity(context)
        }
    }

    private fun startTaskMonitoringService(context: Context) {
        try {
            val monitorIntent = Intent(context, TaskMonitoringService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(monitorIntent)
            } else {
                context.startService(monitorIntent)
            }
            Log.d(TAG, "TaskMonitoringService started on boot")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start TaskMonitoringService on boot", e)
        }
    }

    /**
     * Schedules an AlarmManager alarm that starts [TaskMonitoringService] again
     * after a short delay. This works around aggressive OEM battery optimisers
     * that kill the service shortly after boot.
     */
    private fun scheduleRestartAlarm(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val restartIntent = Intent(context, TaskMonitoringService::class.java)
        val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PendingIntent.getForegroundService(
                context,
                RESTART_ALARM_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else {
            PendingIntent.getService(
                context,
                RESTART_ALARM_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        try {
            val triggerAtMillis = SystemClock.elapsedRealtime() + RESTART_DELAY_MS
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
                )
            } else {
                alarmManager.setExact(
                    AlarmManager.ELAPSED_REALTIME_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
                )
            }
            Log.d(TAG, "Restart alarm scheduled in ${RESTART_DELAY_MS}ms")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart alarm", e)
        }
    }

    private fun scheduleHeartbeatWorker(context: Context) {
        try {
            val heartbeatRequest = PeriodicWorkRequestBuilder<HeartbeatWorker>(
                15, TimeUnit.MINUTES
            ).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                HEARTBEAT_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                heartbeatRequest
            )
            Log.d(TAG, "HeartbeatWorker scheduled on boot")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule HeartbeatWorker on boot", e)
        }
    }

    private fun launchMainActivity(context: Context) {
        try {
            val i = Intent(context, MainActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch MainActivity on boot", e)
        }
    }
}
