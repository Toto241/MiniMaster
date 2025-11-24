package com.google.pairing

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast

/**
 * DeviceAdminReceiver implementation to prevent uninstallation and enforce policies.
 */
class MiniMasterDeviceAdminReceiver : DeviceAdminReceiver() {

    companion object {
        private const val TAG = "MiniMasterDeviceAdmin"
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.d(TAG, "Device Admin Enabled")
        Toast.makeText(context, "MiniMaster protection enabled", Toast.LENGTH_SHORT).show()
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.d(TAG, "Device Admin Disabled")
        Toast.makeText(context, "MiniMaster protection disabled", Toast.LENGTH_SHORT).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        Log.d(TAG, "Device Admin disable requested")
        return "Disabling this will remove parental controls. Are you sure?"
    }
}
