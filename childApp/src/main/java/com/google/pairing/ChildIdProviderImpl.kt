package com.google.pairing

import android.content.Context
import kotlinx.coroutines.runBlocking

/**
 * Implementation of ChildIdProvider that stores and retrieves the child ID
 * from SharedPreferences.
 *
 * This class should be initialized once when the app starts and the child
 * device is paired with a master.
 */
class ChildIdProviderImpl(context: Context) {
    private val appContext = context.applicationContext

    /**
     * Stores the child ID in SharedPreferences.
     * This should be called during the pairing process.
     */
    fun setChildId(childId: String) {
        runBlocking {
            ChildIdentityStorage.persistChildId(appContext, childId)
        }
    }

    /**
     * Retrieves the stored child ID.
     * @return The child ID, or an empty string if not set.
     */
    fun getChildId(): String {
        return runBlocking {
            ChildIdentityStorage.readChildId(appContext).orEmpty()
        }
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
        runBlocking {
            ChildIdentityStorage.clearChildId(appContext)
        }
    }
}
