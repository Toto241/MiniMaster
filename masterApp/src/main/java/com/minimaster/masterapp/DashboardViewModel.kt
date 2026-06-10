package com.minimaster.masterapp

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.util.TimeZone
import javax.inject.Inject

/**
 * Represents a paired child device in the UI.
 * @property id The unique identifier of the child device.
 * @property isLocked The current lock state of the device.
 * @property lastSeen The timestamp (in seconds) when the device was last online. Null if never seen.
 */
data class ChildDevice(
    val id: String,
    val isLocked: Boolean,
    val lastSeen: Long?
)

/**
 * Represents a task that has been completed by a child and is awaiting parental approval.
 * @property taskId The unique ID of the task.
 * @property childId The ID of the child who completed the task.
 * @property description The description of the task.
 * @property photoUrl The URL of the photo proof submitted for the task.
 */
data class ReviewableTask(
    val taskId: String,
    val childId: String,
    val description: String,
    val photoUrl: String
)

/**
 * The primary [ViewModel] for the master app's dashboard.
 *
 * This ViewModel is responsible for:
 * - Loading and observing the list of paired child devices.
 * - Loading and observing the list of tasks that are pending review.
 * - Handling user actions such as locking/unlocking a device, creating a new task,
 *   and approving a completed task by calling the appropriate Firebase Functions.
 *
 * @property firestore The [FirebaseFirestore] instance for database operations.
 * @property functions The [FirebaseFunctions] instance for backend calls.
 * @property credentialsRepository The repository for accessing the master's credentials.
 */
@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val credentialsRepository: MasterCredentialsRepository
) : ViewModel() {

    private val _children = MutableStateFlow<List<ChildDevice>>(emptyList())
    /** A [StateFlow] emitting the current list of paired child devices. */
    val children: StateFlow<List<ChildDevice>> = _children.asStateFlow()

    private val _reviewableTasks = MutableStateFlow<List<ReviewableTask>>(emptyList())
    /** A [StateFlow] emitting the current list of tasks awaiting review. */
    val reviewableTasks: StateFlow<List<ReviewableTask>> = _reviewableTasks.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    /** A [StateFlow] for exposing errors to the UI. */
    val error: StateFlow<String?> = _error.asStateFlow()

    private val TAG = "DashboardViewModel"

    /**
     * Resets the error state, typically after the error has been shown to the user.
     */
    fun errorShown() {
        _error.value = null
    }

    init {
        // When the ViewModel is created, start observing the master credentials.
        // Once available, load the associated children and tasks.
        viewModelScope.launch {
            credentialsRepository.getMasterId.collect { masterId ->
                if (masterId != null) {
                    loadChildren(masterId)
                    loadTasksForReview(masterId)
                    // Register FCM token on startup to ensure notifications work
                    registerFcmToken()
                }
            }
        }
    }

    /**
     * Registers the FCM token with the backend to enable push notifications.
     * Called on startup and whenever credentials are refreshed.
     */
    private fun registerFcmToken() {
        viewModelScope.launch {
            try {
                FcmTokenManager.registerFcmToken(functions)
            } catch (e: Exception) {
                Log.w(TAG, "FCM token registration failed (non-critical)", e)
            }
        }
    }

    /**
     * Sets up a Firestore listener for tasks that are pending approval for the current master.
     * It uses a collection group query to find tasks across all children.
     * @param masterImei The IMEI of the master device.
     */
    private fun loadTasksForReview(masterImei: String) {
        firestore.collectionGroup("tasks")
            .whereEqualTo("masterImei", masterImei)
            .whereEqualTo("status", "pending_approval")
            .addSnapshotListener { snapshots, e ->
                if (e != null) {
                    Log.w(TAG, "Listen for reviewable tasks failed.", e)
                    return@addSnapshotListener
                }
                val tasks = snapshots?.mapNotNull { doc ->
                    // The childId is the ID of the parent document of the task.
                    val childId = doc.reference.parent.parent?.id ?: return@mapNotNull null
                    ReviewableTask(
                        taskId = doc.id,
                        childId = childId,
                        description = doc.getString("description") ?: "",
                        photoUrl = doc.getString("photoUrl") ?: ""
                    )
                } ?: emptyList()
                _reviewableTasks.value = tasks
            }
    }

    /**
     * Sets up a Firestore listener for all child devices associated with the current master.
     * @param masterImei The IMEI of the master device.
     */
    private fun loadChildren(masterImei: String) {
        firestore.collection("children")
            .whereEqualTo("masterImei", masterImei)
            .addSnapshotListener { snapshots, e ->
                if (e != null) {
                    Log.w(TAG, "Listen failed.", e)
                    return@addSnapshotListener
                }
                val childrenList = snapshots?.map { doc ->
                    ChildDevice(
                        id = doc.id,
                        isLocked = doc.getBoolean("isLocked") ?: false,
                        lastSeen = doc.getTimestamp("lastSeen")?.seconds
                    )
                } ?: emptyList()
                _children.value = childrenList
            }
    }

    /**
     * Calls the `setDeviceLocked` Firebase Function to change the lock state of a child device.
     * @param childImei The ID of the child device to lock/unlock.
     * @param isLocked The desired new lock state.
     */
    fun setDeviceLocked(childImei: String, isLocked: Boolean) {
        viewModelScope.launch {
            val hasCredentials = credentialsRepository.getMasterId.first() != null
            if (!hasCredentials) {
                _error.value = "Credentials not found. Cannot perform action."
                return@launch
            }
            val data = hashMapOf(
                "childId" to childImei, "isLocked" to isLocked
            )
            try {
                functions.getHttpsCallable("setDeviceLocked").call(data).await()
            } catch (e: Exception) {
                Log.e(TAG, "Error calling setDeviceLocked", e)
                _error.value = "Failed to update lock state. Please try again."
            }
        }
    }

    /**
     * Calls the `createTask` Firebase Function to assign a new task to a child device.
     * @param childImei The ID of the child device to assign the task to.
     * @param description The description of the task.
     * @param deadline The deadline of the task as a Long (timestamp).
     */
    fun createTask(childImei: String, description: String, deadline: Long) {
        viewModelScope.launch {
            val hasCredentials = credentialsRepository.getMasterId.first() != null
            if (!hasCredentials) {
                _error.value = "Credentials not found. Cannot perform action."
                return@launch
            }
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
            sdf.timeZone = TimeZone.getTimeZone("UTC")
            val deadlineISO = sdf.format(java.util.Date(deadline))
            val data = hashMapOf(
                "childId" to childImei,
                "description" to description,
                "deadlineISO" to deadlineISO
            )
            try {
                functions.getHttpsCallable("createTask").call(data).await()
            } catch (e: Exception) {
                Log.e(TAG, "Error calling createTask", e)
                _error.value = "Failed to create task. Please try again."
            }
        }
    }

    /**
     * Calls the `approveTask` Firebase Function to approve a task completed by a child.
     * @param childImei The ID of the child device.
     * @param taskId The ID of the task to approve.
     */
    fun approveTask(childImei: String, taskId: String) {
        viewModelScope.launch {
            val hasCredentials = credentialsRepository.getMasterId.first() != null
            if (!hasCredentials) {
                _error.value = "Credentials not found. Cannot perform action."
                return@launch
            }
            val data = hashMapOf(
                "childId" to childImei,
                "taskId" to taskId
            )
            try {
                functions.getHttpsCallable("approveTask").call(data).await()
            } catch (e: Exception) {
                Log.e(TAG, "Error calling approveTask", e)
                _error.value = "Failed to approve task. Please try again."
            }
        }
    }

    /**
     * Calls the `rejectTask` Firebase Function to reject a task submitted by a child.
     * @param childImei The ID of the child device.
     * @param taskId The ID of the task to reject.
     * @param reason An optional reason for the rejection.
     */
    fun rejectTask(childImei: String, taskId: String, reason: String? = null) {
        viewModelScope.launch {
            val hasCredentials = credentialsRepository.getMasterId.first() != null
            if (!hasCredentials) {
                _error.value = "Credentials not found. Cannot perform action."
                return@launch
            }
            val data = hashMapOf<String, Any>(
                "childId" to childImei,
                "taskId" to taskId
            )
            if (!reason.isNullOrBlank()) {
                data["reason"] = reason
            }
            try {
                functions.getHttpsCallable("rejectTask").call(data).await()
            } catch (e: Exception) {
                Log.e(TAG, "Error calling rejectTask", e)
                _error.value = "Failed to reject task. Please try again."
            }
        }
    }
}
