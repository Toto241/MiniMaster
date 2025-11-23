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
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

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

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        serviceScope.launch {
            taskRepository.observeCurrentTask().collectLatest { task ->
                // Hier wird die Logik zur Steuerung der Sperre implementiert
                // Wir senden einen Broadcast oder aktualisieren einen SharedPreference-Wert,
                // den der AccessibilityService lesen kann.
                val intent = Intent("com.google.pairing.TASK_STATUS_UPDATE")
                intent.putExtra("task_status", task?.status)
                intent.putExtra("unlock_duration", task?.unlockDuration)
                sendBroadcast(intent)
            }
        }
        return START_STICKY
    }

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
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel!!)

        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("MiniMaster Schutz ist aktiv")
            .setContentText("Überwacht zugewiesene Aufgaben.")
            .setSmallIcon(R.mipmap.ic_launcher) // Ersetzen Sie dies mit einem passenden Icon
            .build()

        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onBind(intent: Intent?): IBinder? {
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.coroutineContext.cancel()
    }
}
