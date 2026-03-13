package com.minimaster.masterapp

import android.util.Log
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await

/**
 * Utility class for managing FCM token registration.
 *
 * This class provides a method to explicitly retrieve the current FCM token
 * and register it with the backend. It should be called:
 * - After successful device registration.
 * - On app startup (to ensure the token is always up-to-date).
 */
object FcmTokenManager {

    private const val TAG = "FcmTokenManager"

    /**
     * Retrieves the current FCM token and sends it to the backend.
     * This is an explicit registration call that complements the automatic
     * token refresh handled by [MasterFcmService.onNewToken].
     *
     * @param functions The [FirebaseFunctions] instance to use for the backend call.
     */
    suspend fun registerFcmToken(functions: FirebaseFunctions) {
        try {
            val token = FirebaseMessaging.getInstance().token.await()
            Log.d(TAG, "Current FCM token: ${token.take(10)}...")

            val data = hashMapOf("fcmToken" to token)
            functions.getHttpsCallable("updateFcmToken").call(data).await()
            Log.i(TAG, "FCM token successfully registered with backend.")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register FCM token.", e)
        }
    }
}
