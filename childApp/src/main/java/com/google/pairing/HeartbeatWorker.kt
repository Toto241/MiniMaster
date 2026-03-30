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

/**
 * A [CoroutineWorker] responsible for periodically sending a heartbeat to the backend.
 *
 * This worker calls the `recordHeartbeat` Firebase Cloud Function to let the system
 * know that the child device is online and active. It is scheduled to run periodically
 * by the [PairingApplication] class.
 *
 * It uses Hilt for dependency injection, which requires the [@HiltWorker] annotation
 * and the use of [@AssistedInject] on the constructor.
 *
 * @property functions An instance of [FirebaseFunctions] for calling cloud functions.
 * @property childIdRepository The repository to retrieve the child's unique ID.
 */
@HiltWorker
class HeartbeatWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val functions: FirebaseFunctions,
    private val childIdRepository: ChildIdRepository,
    private val commandSyncRepository: CommandSyncRepository
) : CoroutineWorker(appContext, workerParams) {

    private val TAG = "HeartbeatWorker"

    /**
     * The main work to be performed by the worker.
     * It retrieves the child ID and calls the `recordHeartbeat` cloud function.
     * @return [Result.success] if the heartbeat is sent successfully.
     *         [Result.retry] if the child ID is not yet available or if a network error occurs.
     */
    override suspend fun doWork(): Result {
        Log.d(TAG, "Heartbeat worker running...")
        return try {
            val childId = childIdRepository.getChildId().first()
            if (childId.isNullOrEmpty()) {
                Log.w(TAG, "Heartbeat failed: Child ID not available. Worker will retry.")
                return Result.retry()
            }

            val data = hashMapOf("childImei" to childId)
            functions
                .getHttpsCallable("recordHeartbeat")
                .call(data)
                .await()
            Log.d(TAG, "Heartbeat successful for child $childId.")

            // After each heartbeat: check if local policy is in sync with the server.
            // Uses knownPolicyVersion=0 here so the server always answers;
            // the snapshot is only applied when upToDate==false.
            commandSyncRepository.syncPolicySnapshot(childId, knownPolicyVersion = 0)

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Heartbeat failed with exception. Retrying...", e)
            Result.retry()
        }
    }
}
