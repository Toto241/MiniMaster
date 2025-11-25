package com.google.pairing

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Receives the BOOT_COMPLETED broadcast to restart necessary services
 * when the device is rebooted.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            Log.d("BootReceiver", "Device booted. Initializing MiniMaster services.")

            // Start the main activity to ensure the app is alive and can prompt for permissions if needed.
            // In a real app, we might start a foreground service instead.
            val i = Intent(context, MainActivity::class.java)
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)

            // Trigger a rule sync just in case
            // Ideally we would start a WorkManager job here, but for now we rely on the Activity/Service startup.
        }
    }
}
