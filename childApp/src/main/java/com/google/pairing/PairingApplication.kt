package com.google.pairing

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.HiltAndroidApp
import java.util.concurrent.TimeUnit
import javax.inject.Inject

/**
 * The main [Application] class for the Child App.
 *
 * This class is annotated with [@HiltAndroidApp] to enable Hilt for dependency injection
 * throughout the application. It also implements [Configuration.Provider] to provide a
 * custom [WorkManager] configuration, which is necessary for injecting dependencies
 * into Workers.
 */
@HiltAndroidApp
class PairingApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    /**
     * Provides the custom WorkManager configuration with the Hilt WorkerFactory.
     * This allows Hilt to inject dependencies into [androidx.work.ListenableWorker]s.
     * @return The WorkManager [Configuration].
     */
    override fun getWorkManagerConfiguration() =
        Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    /**
     * Called when the application is starting. This is where we initialize
     * application-level components, such as the [HeartbeatWorker].
     */
    override fun onCreate() {
        super.onCreate()
        setupHeartbeatWorker()
    }

    /**
     * Enqueues a unique periodic [HeartbeatWorker] to run approximately every 15 minutes.
     * This worker is responsible for sending a heartbeat to the backend to indicate that
     * the device is online.
     *
     * Using [ExistingPeriodicWorkPolicy.KEEP] ensures that if a worker is already
     * scheduled, a new one will not be added.
     */
    private fun setupHeartbeatWorker() {
        val heartbeatWorkRequest =
            PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
                .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "HeartbeatWork",
            ExistingPeriodicWorkPolicy.KEEP,
            heartbeatWorkRequest
        )
    }
}
