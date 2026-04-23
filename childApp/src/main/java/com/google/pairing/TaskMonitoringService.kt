package com.google.pairing

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.functions.FirebaseFunctions
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * A foreground service that actively monitors the current task status.
 *
 * This service ensures that the app remains active and aware of the latest task state
 * (e.g., if a task is assigned or approved), even when the app is in the background.
 * It communicates updates to the [MiniMasterAccessibilityService] via broadcasts.
 *
 * Anti-tamper features:
 * - Returns [START_STICKY] so the system restarts it if killed.
 * - Schedules an AlarmManager alarm in [onTaskRemoved] to survive task-manager kills.
 * - Enqueues a periodic [ServiceRestartWorker] as a fallback every 15 minutes.
 * - Integrates [TamperDetectionManager] to detect and report protection degradation.
 */
@AndroidEntryPoint
class TaskMonitoringService : Service() {

    @Inject
    lateinit var taskRepository: TaskRepository

    @Inject
    lateinit var functions: FirebaseFunctions

    @Inject
    lateinit var childIdRepository: ChildIdRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var tamperDetectionManager: TamperDetectionManager? = null

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "TaskMonitoringServiceChannel"
        const val NOTIFICATION_ID = 12345
        private const val TAG = "TaskMonitoringService"
        private const val RESTART_ALARM_REQUEST_CODE = 9003
    }

    override fun onCreate() {
        super.onCreate()
        startForegroundService()
        scheduleServiceRestartWorker()
        startTamperDetection()
    }

    /**
     * Starts monitoring the current task upon service start.
     * It observes the task flow from [TaskRepository] and broadcasts updates.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        serviceScope.launch {
            taskRepository.observeCurrentTask().collectLatest { task ->
                // Broadcast the task status so the AccessibilityService can enforce locks
                // or unlock the device.
                val broadcastIntent = Intent("com.google.pairing.TASK_STATUS_UPDATE")
                broadcastIntent.setPackage(packageName)
                broadcastIntent.putExtra("task_status", task?.status)
                sendBroadcast(broadcastIntent)
            }
        }
        return START_STICKY
    }

    /**
     * Called when the user swipes the app away from recent tasks.
     * We schedule an AlarmManager alarm to restart the service before the
     * system has a chance to fully clean it up.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.w(TAG, "TaskMonitoringService removed by task manager — scheduling restart")
        scheduleServiceRestartAlarm()
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        tamperDetectionManager?.stop()
        serviceScope.cancel()
    }

    /**
     * Initializes and starts the foreground service with a persistent notification.
     * This is required for the service to keep running in the background on modern Android versions.
     */
    private fun startForegroundService() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Task Monitoring",
                NotificationManager.IMPORTANCE_LOW
            )
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("MiniMaster Protection Active")
            .setContentText("Monitoring assigned tasks.")
            .setSmallIcon(R.mipmap.ic_launcher) // Replace with actual resource
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    /**
     * Schedules an exact AlarmManager alarm that starts this service again
     * after a short delay. Used as a defence against task-manager kills.
     */
    private fun scheduleServiceRestartAlarm() {
        val alarmManager = getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val restartIntent = Intent(this, TaskMonitoringService::class.java)
        val pendingIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            PendingIntent.getForegroundService(
                this,
                RESTART_ALARM_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        } else {
            PendingIntent.getService(
                this,
                RESTART_ALARM_REQUEST_CODE,
                restartIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }

        try {
            val triggerAtMillis = SystemClock.elapsedRealtime() + 3_000L // 3 seconds
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
            Log.d(TAG, "Service restart alarm scheduled after task removal")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule restart alarm after task removal", e)
        }
    }

    /**
     * Enqueues a unique periodic [ServiceRestartWorker] that tries to start this
     * service every 15 minutes. This acts as a last-resort fallback when AlarmManager
     * is also blocked by aggressive OEM battery optimisers.
     */
    private fun scheduleServiceRestartWorker() {
        try {
            val workRequest = PeriodicWorkRequestBuilder<ServiceRestartWorker>(
                15, TimeUnit.MINUTES
            ).build()
            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                ServiceRestartWorker.WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
            Log.d(TAG, "ServiceRestartWorker scheduled")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule ServiceRestartWorker", e)
        }
    }

    /**
     * Starts the [TamperDetectionManager] to periodically verify that the
     * Accessibility Service, Device Admin, and battery optimisation state are intact.
     */
    private fun startTamperDetection() {
        tamperDetectionManager = TamperDetectionManager(this, functions, childIdRepository)
        tamperDetectionManager?.start()
    }
}
