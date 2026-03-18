package com.google.pairing

import android.content.Context
import android.content.SharedPreferences

/**
 * Implementation of ChildIdProvider that stores and retrieves the child ID
 * from SharedPreferences.
 *
 * This class should be initialized once when the app starts and the child
 * device is paired with a master.
 */
class ChildIdProviderImpl(context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences(
        "MiniMasterPrefs",
        Context.MODE_PRIVATE
    )

    companion object {
        private const val KEY_CHILD_ID = "child_id"
    }

    /**
     * Stores the child ID in SharedPreferences.
     * This should be called during the pairing process.
     */
    fun setChildId(childId: String) {
        prefs.edit().putString(KEY_CHILD_ID, childId).apply()
    }

    /**
     * Retrieves the stored child ID.
     * @return The child ID, or an empty string if not set.
     */
    fun getChildId(): String {
        return prefs.getString(KEY_CHILD_ID, "") ?: ""
    }

    /**
     * Checks if a child ID has been set.
     * @return True if a child ID exists, false otherwise.
     */
    fun hasChildId(): Boolean {
        return getChildId().isNotEmpty()
    }

    /**
     * Clears the stored child ID.
     * This should be called when unpairing the device.
     */
    fun clearChildId() {
        prefs.edit().remove(KEY_CHILD_ID).apply()
    }
}
