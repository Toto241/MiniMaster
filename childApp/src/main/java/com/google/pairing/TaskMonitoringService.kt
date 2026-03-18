package com.google.pairing

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * A foreground service that actively monitors the current task status.
 *
 * This service ensures that the app remains active and aware of the latest task state
 * (e.g., if a task is assigned or approved), even when the app is in the background.
 * It communicates updates to the [MiniMasterAccessibilityService] via broadcasts.
 */
@AndroidEntryPoint
class TaskMonitoringService : Service() {

    @Inject
    lateinit var taskRepository: TaskRepository

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    companion object {
        const val NOTIFICATION_CHANNEL_ID = "TaskMonitoringServiceChannel"
        const val NOTIFICATION_ID = 12345
    }

    override fun onCreate() {
        super.onCreate()
        startForegroundService()
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
                broadcastIntent.putExtra("task_status", task?.status)
                sendBroadcast(broadcastIntent)
            }
        }
        return START_STICKY
    }

    /**
     * Initializes and starts the foreground service with a persistent notification.
     * This is required for the service to keep running in the background on modern Android versions.
     */
    private fun startForegroundService() {
        val channel = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Task Monitoring",
                NotificationManager.IMPORTANCE_LOW
            )
        } else {
            null
        }

        if (channel != null) {
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }

        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("MiniMaster Protection Active")
            .setContentText("Monitoring assigned tasks.")
            .setSmallIcon(R.mipmap.ic_launcher) // Replace with actual resource
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }
}
