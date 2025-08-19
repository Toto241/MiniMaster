package com.google.pairing

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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import android.net.Uri

data class Task(
    val id: String,
    val description: String,
    val status: String
)

@HiltViewModel
class TasksViewModel @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val storage: FirebaseStorage,
    private val functions: FirebaseFunctions,
    private val childIdRepository: ChildIdRepository
) : ViewModel() {

    private val _tasks = MutableStateFlow<List<Task>>(emptyList())
    val tasks: StateFlow<List<Task>> = _tasks.asStateFlow()

    private val TAG = "TasksViewModel"

    init {
        loadTasks()
    }

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

    fun completeTaskWithPhoto(taskId: String, photoUri: Uri) {
        viewModelScope.launch {
            val childId = childIdRepository.getChildId().first()
            if (childId.isNullOrEmpty()) {
                Log.e(TAG, "Cannot complete task, childId is null.")
                return@launch
            }

            try {
                // 1. Upload image to Firebase Storage
                val photoRef = storage.reference.child("proofs/$childId/$taskId.jpg")
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

                Log.d(TAG, "Task $taskId marked as complete.")
                // The snapshot listener will automatically update the UI
            } catch (e: Exception) {
                Log.e(TAG, "Error completing task $taskId", e)
            }
        }
    }
}
