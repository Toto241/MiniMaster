package com.google.pairing

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.flow.first
import javax.inject.Inject

@AndroidEntryPoint
class RuleSyncService : FirebaseMessagingService() {

    @Inject
    lateinit var functions: FirebaseFunctions
    @Inject
    lateinit var childIdRepository: ChildIdRepository

    private val TAG = "RuleSyncService"

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        Log.d(TAG, "From: ${remoteMessage.from}")

        // Check if message contains a data payload.
        remoteMessage.data.isNotEmpty().let {
            Log.d(TAG, "Message data payload: " + remoteMessage.data)

            // Handle SYNC_RULES command
            if (remoteMessage.data["command"] == "SYNC_RULES") {
                Log.d(TAG, "SYNC_RULES command received. Triggering rule sync logic.")
                // In a real application, you would trigger a background job here
                // using WorkManager to fetch the latest rules from Firestore and apply them.
                // For this implementation step, logging is sufficient to prove receipt.
                // Example:
                // val workRequest = OneTimeWorkRequestBuilder<RuleSyncWorker>().build()
                // WorkManager.getInstance(this).enqueue(workRequest)
            }
        }
    }

    /**
     * Called if the FCM registration token is updated. This may occur if the security of
     * the previous token had been compromised. Note that this is called when the
     * FCM registration token is initially generated so this is where you would retrieve the token.
     */
    override fun onNewToken(token: String) {
        Log.d(TAG, "Refreshed FCM token: $token")
        // A coroutine is used to call suspend functions from the service context.
        CoroutineScope(Dispatchers.IO).launch {
            sendRegistrationToServer(token)
        }
    }

    private suspend fun sendRegistrationToServer(token: String?) {
        if (token == null) {
            Log.w(TAG, "Cannot send null token to server.")
            return
        }
        try {
            val childId = childIdRepository.getChildId().first()
            if (childId.isNullOrEmpty()) {
                Log.w(TAG, "Cannot register FCM token, childId is not yet available.")
                return
            }

            val data = hashMapOf(
                "childImei" to childId,
                "token" to token
            )

            functions
                .getHttpsCallable("registerFcmToken")
                .call(data)
                .await()

            Log.d(TAG, "FCM token registered successfully for child $childId.")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register FCM token", e)
        }
    }
}
