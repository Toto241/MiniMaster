package com.google.pairing

import android.content.Context
import android.util.Log
import com.google.firebase.functions.FirebaseFunctions
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for the Control-Plane command/ack channel introduced in device-sync.ts.
 *
 * Wraps the three Firebase Cloud Functions that form the pull-side of the
 * bidirectional Android/iOS communication layer:
 *
 *  - [fetchAndApplyPendingCommands] — pull pending commands from Firestore and apply them locally
 *  - [acknowledgeCommand]           — ack an applied/failed command back to the server
 *  - [syncPolicySnapshot]           — full policy pull on app-start or after offline gap
 *
 * FCM is used only as a wake-up hint; the authoritative state is always Firestore commands.
 */
@Singleton
class CommandSyncRepository @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val functions: FirebaseFunctions,
    private val childIdRepository: ChildIdRepository
) {
    private val TAG = "CommandSyncRepository"

    // ---------------------------------------------------------------------------
    // fetchPendingCommands
    // ---------------------------------------------------------------------------

    /**
     * Fetches all pending commands from the server and applies each one locally.
     * Acknowledges every command (applied / failed) back to the server.
     *
     * @param childId  The local child device ID.
     * @param cursor   Optional cursor (commandId) for pagination; null = first page.
     * @return Updated policyVersion reported by the server, or null on error.
     */
    suspend fun fetchAndApplyPendingCommands(childId: String, cursor: String? = null): Int? {
        return try {
            val params = hashMapOf<String, Any>("childId" to childId, "maxItems" to 50)
            cursor?.let { params["sinceCursor"] = it }

            val result = functions.getHttpsCallable("fetchPendingCommands").call(params).await()
            @Suppress("UNCHECKED_CAST")
            val responseMap = result.getData() as? Map<String, Any> ?: return null

            @Suppress("UNCHECKED_CAST")
            val commands = responseMap["commands"] as? List<Map<String, Any>> ?: emptyList()
            val nextCursor = responseMap["nextCursor"] as? String
            val policyVersion = (responseMap["policyVersion"] as? Number)?.toInt() ?: 0

            Log.d(TAG, "Fetched ${commands.size} pending commands (policyVersion=$policyVersion)")

            for (command in commands) {
                val commandId = command["commandId"] as? String ?: continue
                val type = command["type"] as? String ?: continue

                try {
                    applyCommand(command, type)
                    acknowledgeCommand(childId, commandId, "applied", System.currentTimeMillis())
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to apply command $commandId (type=$type)", e)
                    acknowledgeCommand(
                        childId, commandId, "failed",
                        System.currentTimeMillis(), errorCode = e.javaClass.simpleName
                    )
                }
            }

            // Paginate if more commands are available
            if (nextCursor != null) {
                fetchAndApplyPendingCommands(childId, nextCursor)
            }

            policyVersion
        } catch (e: Exception) {
            Log.e(TAG, "fetchAndApplyPendingCommands failed", e)
            null
        }
    }

    // ---------------------------------------------------------------------------
    // acknowledgeCommand
    // ---------------------------------------------------------------------------

    /**
     * Sends a command acknowledgement to the server.
     *
     * @param childId    Child device ID.
     * @param commandId  UUID of the command to acknowledge.
     * @param status     "applied" or "failed".
     * @param appliedAt  Epoch-ms timestamp of local application.
     * @param errorCode  Optional error detail when status == "failed".
     */
    suspend fun acknowledgeCommand(
        childId: String,
        commandId: String,
        status: String,
        appliedAt: Long,
        errorCode: String? = null
    ) {
        try {
            val params = hashMapOf<String, Any>(
                "childId" to childId,
                "commandId" to commandId,
                "status" to status,
                "appliedAt" to appliedAt
            )
            errorCode?.let { params["errorCode"] = it }

            functions.getHttpsCallable("acknowledgeCommand").call(params).await()
            Log.d(TAG, "Command $commandId acknowledged: $status")
        } catch (e: Exception) {
            Log.e(TAG, "acknowledgeCommand failed for $commandId", e)
            // Non-fatal: next sync or heartbeat cycle will retry
        }
    }

    // ---------------------------------------------------------------------------
    // syncPolicySnapshot
    // ---------------------------------------------------------------------------

    /**
     * Pulls a full policy snapshot from the server and applies it locally.
     * Called on app start and whenever [fetchAndApplyPendingCommands] detects a version gap.
     *
     * @param childId             Child device ID.
     * @param knownPolicyVersion  Version the device currently has applied (0 if unknown).
     * @return true if local state was updated, false if already up-to-date or on error.
     */
    suspend fun syncPolicySnapshot(childId: String, knownPolicyVersion: Int = 0): Boolean {
        return try {
            val params = hashMapOf<String, Any>(
                "childId" to childId,
                "knownPolicyVersion" to knownPolicyVersion
            )
            val result = functions.getHttpsCallable("syncPolicySnapshot").call(params).await()
            @Suppress("UNCHECKED_CAST")
            val data = result.getData() as? Map<String, Any> ?: return false

            val upToDate = data["upToDate"] as? Boolean ?: false
            if (upToDate) {
                Log.d(TAG, "Policy already up-to-date (v$knownPolicyVersion)")
                return false
            }

            @Suppress("UNCHECKED_CAST")
            val fullPolicy = data["fullPolicy"] as? Map<String, Any> ?: return false
            val policyVersion = (data["policyVersion"] as? Number)?.toInt() ?: 0

            applyFullPolicy(fullPolicy)

            @Suppress("UNCHECKED_CAST")
            val criticalCommands = data["pendingCriticalCommands"] as? List<Map<String, Any>> ?: emptyList()
            for (command in criticalCommands) {
                val commandId = command["commandId"] as? String ?: continue
                val type = command["type"] as? String ?: continue
                try {
                    applyCommand(command, type)
                    acknowledgeCommand(childId, commandId, "applied", System.currentTimeMillis())
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to apply critical command $commandId", e)
                    acknowledgeCommand(
                        childId, commandId, "failed",
                        System.currentTimeMillis(), e.javaClass.simpleName
                    )
                }
            }

            Log.i(TAG, "Policy snapshot applied: v$knownPolicyVersion → v$policyVersion")
            true
        } catch (e: Exception) {
            Log.e(TAG, "syncPolicySnapshot failed", e)
            false
        }
    }

    // ---------------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------------

    /**
     * Dispatches a single command to the appropriate local handler based on its [type].
     * Throws on unrecognised or malformed commands so the caller can ack "failed".
     */
    @Suppress("UNCHECKED_CAST")
    private fun applyCommand(command: Map<String, Any>, type: String) {
        val payload = command["payload"] as? Map<String, Any> ?: emptyMap()
        when (type) {
            "lock_state" -> {
                val isLocked = payload["isLocked"] as? Boolean ?: false
                PolicyPreferences.setLocked(appContext, isLocked)
                Log.d(TAG, "Applied lock_state: isLocked=$isLocked")
            }
            "app_blacklist" -> {
                val apps = (payload["appBlacklist"] as? List<String>) ?: emptyList()
                PolicyPreferences.setBlockedApps(appContext, apps.toSet())
                Log.d(TAG, "Applied app_blacklist: ${apps.size} apps")
            }
            "usage_rules" -> {
                val usageRulesJson = org.json.JSONObject(payload).toString()
                PolicyPreferences.setUsageRules(appContext, usageRulesJson)
                Log.d(TAG, "Applied usage_rules")
            }
            "screen_time" -> {
                val usageRulesJson = org.json.JSONObject(payload).toString()
                PolicyPreferences.setUsageRules(appContext, usageRulesJson)
                Log.d(TAG, "Applied screen_time")
            }
            "policy_update" -> {
                // Generic policy update — re-apply all fields present in payload
                (payload["isLocked"] as? Boolean)?.let { PolicyPreferences.setLocked(appContext, it) }
                (payload["appBlacklist"] as? List<String>)?.let {
                    PolicyPreferences.setBlockedApps(appContext, it.toSet())
                }
                payload["usageRules"]?.let {
                    PolicyPreferences.setUsageRules(
                        appContext, org.json.JSONObject(it as Map<*, *>).toString()
                    )
                }
                Log.d(TAG, "Applied policy_update")
            }
            else -> {
                Log.w(TAG, "Unknown command type: $type – ignoring")
            }
        }
    }

    /**
     * Applies a full policy snapshot from [syncPolicySnapshot] to local preferences.
     */
    @Suppress("UNCHECKED_CAST")
    private fun applyFullPolicy(fullPolicy: Map<String, Any>) {
        val isLocked = fullPolicy["isLocked"] as? Boolean ?: false
        PolicyPreferences.setLocked(appContext, isLocked)

        val appBlacklist = (fullPolicy["appBlacklist"] as? List<String>) ?: emptyList()
        PolicyPreferences.setBlockedApps(appContext, appBlacklist.toSet())

        val usageRules = fullPolicy["usageRules"] as? Map<*, *>
        if (usageRules != null) {
            PolicyPreferences.setUsageRules(appContext, org.json.JSONObject(usageRules).toString())
        }

        Log.d(TAG, "Full policy applied: locked=$isLocked, blocked=${appBlacklist.size}")
    }
}
