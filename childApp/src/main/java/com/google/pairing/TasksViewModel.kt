package com.google.pairing

import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

/**
 * A data class representing a single task for the child, used by the UI.
 *
 * @property id The unique identifier of the task in Firestore.
 * @property description A description of what the task entails.
 * @property status The current status of the task (e.g., "pending", "pending_approval", "approved").
 */
data class Task(
    val id: String,
    val description: String,
    val status: String
)

/**
 * A [ViewModel] responsible for managing the state and business logic for the tasks screen.
 *
 * This ViewModel:
 * - Listens for real-time updates to the list of tasks from Firestore.
 * - Provides a [StateFlow] of tasks for the UI to observe.
 * - Handles the process of completing a task, which involves uploading a photo proof
 *   to Firebase Storage and then calling a cloud function.
 *
 * @property firestore The [FirebaseFirestore] instance for database operations.
 * @property storage The [FirebaseStorage] instance for file uploads.
 * @property functions The [FirebaseFunctions] instance for calling backend logic.
 * @property childIdRepository The repository for retrieving the device's ID.
 */
@HiltViewModel
class TasksViewModel @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val storage: FirebaseStorage,
    private val functions: FirebaseFunctions,
    private val childIdRepository: ChildIdRepository
) : ViewModel() {

    private val _tasks = MutableStateFlow<List<Task>>(emptyList())
    /**
     * A [StateFlow] that emits the current list of tasks for the child device.
     * The UI collects this flow to display the tasks.
     */
    val tasks: StateFlow<List<Task>> = _tasks.asStateFlow()

    private val TAG = "TasksViewModel"

    init {
        loadTasks()
    }

    /**
     * Sets up a real-time snapshot listener on the 'tasks' subcollection in Firestore.
     * It retrieves the child's tasks, ordered by creation date, and updates the [_tasks] state flow.
     */
    private fun loadTasks() {
        viewModelScope.launch {
            val childId = childIdRepository.getChildId().first()
            if (childId.isNullOrEmpty()) {
                Log.w(TAG, "Cannot load tasks, child ID is not available.")
                return@launch
            }

            firestore.collection("children").document(childId).collection("tasks")
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .addSnapshotListener { snapshots, e ->
                    if (e != null) {
                        Log.w(TAG, "Listen failed.", e)
                        return@addSnapshotListener
                    }

                    val taskList = snapshots?.map { doc ->
                        Task(
                            id = doc.id,
                            description = doc.getString("description") ?: "",
                            status = doc.getString("status") ?: ""
                        )
                    } ?: emptyList()

                    _tasks.value = taskList
                    Log.d(TAG, "Tasks loaded: ${taskList.size}")
                }
        }
    }

    /**
     * Handles the process of completing a task that requires photo proof.
     *
     * This function performs two main operations:
     * 1. It uploads the image from the given [photoUri] to a unique path in Firebase Storage.
     * 2. It calls the `submitTaskProof` cloud function with the task details and the URL of the
     *    uploaded photo.
     *
     * The UI is updated automatically via the snapshot listener in [loadTasks].
     *
     * @param taskId The ID of the task to complete.
     * @param photoUri The content [Uri] of the photo taken by the user.
     */
    fun completeTaskWithPhoto(taskId: String, photoUri: Uri) {
        viewModelScope.launch {
            val childId = childIdRepository.getChildId().first()
            if (childId.isNullOrEmpty()) {
                Log.e(TAG, "Cannot complete task, childId is null.")
                return@launch
            }

            try {
                // 1. Upload image to Firebase Storage
                val photoRef = storage.reference.child(
                    TaskProofStoragePath.build(childId, taskId, System.currentTimeMillis())
                )
                photoRef.putFile(photoUri).await()
                val downloadUrl = photoRef.downloadUrl.await().toString()
                Log.d(TAG, "Photo uploaded: $downloadUrl")

                // 2. Call the completeTask Cloud Function
                val data = hashMapOf(
                    "childImei" to childId,
                    "taskId" to taskId,
                    "photoUrl" to downloadUrl
                )
                functions
                    .getHttpsCallable("completeTask")
                    .call(data)
                    .await()

                Log.d(TAG, "Task $taskId proof submitted.")
                // The UI will update automatically thanks to the real-time listener.
            } catch (e: Exception) {
                Log.e(TAG, "Error completing task $taskId", e)
                // Consider exposing this error to the UI via a StateFlow<Event<String>>
            }
        }
    }
}
