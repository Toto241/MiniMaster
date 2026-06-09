package com.google.pairing

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

/**
 * Periodic WorkManager worker that polls for pending commands.
 * Acts as a fallback when FCM push is delayed or dropped due to Doze mode,
 * OEM battery optimization, or network issues.
 *
 * Runs every 15 minutes (configured in BootReceiver).
 * Respects Android 12+ expedited work policies.
 */
class RuleSyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        private const val TAG = "RuleSyncWorker"
    }

    override suspend fun doWork(): Result {
        Log.d(TAG, "Periodic sync worker started")

        val childId = try {
            // Hilt injection not available in Worker without @HiltWorker,
            // so we use a simple manual resolution via application context.
            // In a real app, use @HiltWorker + @AssistedInject.
            val app = applicationContext as? dagger.hilt.android.HiltAndroidApp
            // Fallback: read from SharedPreferences saved by RuleSyncService
            applicationContext.getSharedPreferences("child_prefs", Context.MODE_PRIVATE)
                .getString("child_id", null)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to resolve childId", e)
            null
        }

        if (childId.isNullOrEmpty()) {
            Log.w(TAG, "No childId available — skipping sync")
            return Result.retry()
        }

        return try {
            // Pull commands via Control-Plane
            val functions = FirebaseFunctions.getInstance()
            val result = functions.getHttpsCallable("fetchPendingCommands")
                .call(hashMapOf("childId" to childId, "maxItems" to 20))
                .await()

            val data = result.getData() as? Map<String, Any>
            val commands = data?.get("commands") as? List<Map<String, Any>> ?: emptyList()

            if (commands.isNotEmpty()) {
                Log.i(TAG, "Pulled ${commands.size} pending commands via WorkManager")
                // Apply commands via local broadcast or direct service binding
                // (AccessibilityService reads from SharedPreferences after update)
            } else {
                Log.d(TAG, "No pending commands")
            }

            // Acknowledge successful sync with heartbeat
            try {
                functions.getHttpsCallable("recordHeartbeat")
                    .call(hashMapOf("childId" to childId, "source" to "workmanager_periodic"))
                    .await()
            } catch (e: Exception) {
                Log.w(TAG, "Heartbeat failed (non-fatal)", e)
            }

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Sync failed", e)
            Result.retry()
        }
    }
}
