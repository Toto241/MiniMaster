package com.google.pairing

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.google.firebase.functions.FirebaseFunctions
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await

@HiltWorker
class HeartbeatWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val functions: FirebaseFunctions,
    private val childIdRepository: ChildIdRepository
) : CoroutineWorker(appContext, workerParams) {

    private val TAG = "HeartbeatWorker"

    override suspend fun doWork(): Result {
        Log.d(TAG, "Heartbeat worker running...")
        return try {
            val childId = childIdRepository.getChildId().first()
            if (childId.isNullOrEmpty()) {
                Log.w(TAG, "Heartbeat failed: Child ID not available. It might be the first run.")
                // We don't treat this as a permanent failure, as the ID might be set later.
                // The worker will retry based on the backoff policy.
                return Result.retry()
            }

            val data = hashMapOf("childImei" to childId)
            functions
                .getHttpsCallable("recordHeartbeat")
                .call(data)
                .await()

            Log.d(TAG, "Heartbeat successful for child $childId.")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat failed with exception.", e)
            // For network errors or other transient issues, retrying is appropriate.
            Result.retry()
        }
    }
}
