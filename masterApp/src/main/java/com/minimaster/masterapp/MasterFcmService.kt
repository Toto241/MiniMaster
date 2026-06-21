package com.minimaster.masterapp

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

/**
 * Firebase Cloud Messaging service for the Master (parent) app.
 *
 * This service handles:
 * - Receiving push notifications when a child submits a task for approval.
 * - Receiving push notifications for other events (e.g., child device status changes).
 * - Automatically registering/updating the FCM token with the backend.
 */
class MasterFcmService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "MasterFcmService"
        private const val CHANNEL_NAME_TASKS = "Task Notifications"
        private const val CHANNEL_NAME_DEVICE = "Device Notifications"
    }

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    /**
     * Called when a new FCM token is generated or refreshed.
     * This token must be sent to the backend so the server can target this device
     * for push notifications.
     *
     * @param token The new FCM registration token.
     */
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token received: ${token.take(10)}...")
        sendTokenToServer(token)
    }

    /**
     * Sends the FCM token to the backend via the `updateFCMToken` Cloud Function.
     * This ensures the backend always has the latest token for this device.
     *
     * @param token The FCM token to register.
     */
    private fun sendTokenToServer(token: String) {
        serviceScope.launch {
            try {
                val data = hashMapOf("fcmToken" to token)
                FirebaseFunctions.getInstance()
                    .getHttpsCallable("updateFCMToken")
                    .call(data)
                    .await()
                Log.i(TAG, "FCM token successfully registered with backend.")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to register FCM token with backend.", e)
            }
        }
    }

    /**
     * Called when a message is received from FCM.
     * Handles both notification messages (when app is in foreground) and data messages.
     *
     * @param remoteMessage The message received from Firebase Cloud Messaging.
     */
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "Message received from: ${remoteMessage.from}")

        // Create notification channels (required for Android 8.0+)
        createNotificationChannels()

        // Handle data payload
        if (remoteMessage.data.isNotEmpty()) {
            Log.d(TAG, "Message data payload: ${remoteMessage.data}")
            handleDataMessage(remoteMessage.data)
        }

        // Handle notification payload (when app is in foreground)
        remoteMessage.notification?.let { notification ->
            showNotification(
                title = notification.title ?: "MiniMaster",
                body = notification.body ?: "",
                channelId = MasterFcmMessageRouter.CHANNEL_ID_TASKS
            )
        }
    }

    /**
     * Processes data messages and shows appropriate notifications.
     * Supports different message types for various events.
     *
     * @param data The data payload from the FCM message.
     */
    private fun handleDataMessage(data: Map<String, String>) {
        val command = MasterFcmMessageRouter.route(data)
        showNotification(
            title = command.title,
            body = command.body,
            channelId = command.channelId,
            extras = command.extras,
        )
    }

    /**
     * Creates the notification channels required for Android 8.0 (API 26) and above.
     * Two channels are created:
     * - Task Notifications: For task-related events (high importance).
     * - Device Notifications: For device status changes (default importance).
     */
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            val taskChannel = NotificationChannel(
                MasterFcmMessageRouter.CHANNEL_ID_TASKS,
                CHANNEL_NAME_TASKS,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for task submissions and approvals"
                enableVibration(true)
            }

            val deviceChannel = NotificationChannel(
                MasterFcmMessageRouter.CHANNEL_ID_DEVICE,
                CHANNEL_NAME_DEVICE,
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Notifications for device status changes"
            }

            notificationManager.createNotificationChannel(taskChannel)
            notificationManager.createNotificationChannel(deviceChannel)
        }
    }

    /**
     * Displays a local notification to the user.
     *
     * @param title The notification title.
     * @param body The notification body text.
     * @param channelId The notification channel to use.
     * @param extras Optional extra data to attach to the notification intent.
     */
    private fun showNotification(
        title: String,
        body: String,
        channelId: String,
        extras: Map<String, String> = emptyMap()
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            extras.forEach { (key, value) -> putExtra(key, value) }
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
