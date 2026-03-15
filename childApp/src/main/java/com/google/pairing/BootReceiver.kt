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
 * Receives the BOOT_COMPLETED broadcast to restart necessary services
 * when the device is rebooted.
 */
class BootReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "BootReceiver"
        private const val HEARTBEAT_WORK_NAME = "heartbeat_worker"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d(TAG, "Device booted. Initializing MiniMaster services.")

            // 1. Start TaskMonitoringService to resume task state observation
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

            // 2. Schedule periodic heartbeat via WorkManager
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

            // 3. Start main activity to ensure permissions are checked
            val i = Intent(context, MainActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
        }
    }
}
