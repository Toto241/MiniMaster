package com.google.pairing

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A [CoroutineWorker] that ensures [TaskMonitoringService] is running.
 *
 * Scheduled every 15 minutes as a fallback in case the service is killed by the
 * system or the user. This worker is lightweight: it simply tries to start the
 * foreground service.
 */
class ServiceRestartWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "ServiceRestartWorker"
        const val WORK_NAME = "service_restart_worker"
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Log.d(TAG, "Running service restart check")
        try {
            val intent = Intent(applicationContext, TaskMonitoringService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                applicationContext.startForegroundService(intent)
            } else {
                applicationContext.startService(intent)
            }
            Log.d(TAG, "TaskMonitoringService ensured running by worker")
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to restart TaskMonitoringService from worker", e)
            Result.retry()
        }
    }
}
