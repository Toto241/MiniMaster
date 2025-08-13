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
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

data class ChildDevice(
    val id: String,
    val isLocked: Boolean,
    val lastSeen: Long? // timestamp
)

data class ReviewableTask(
    val taskId: String,
    val childId: String,
    val description: String,
    val photoUrl: String
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val credentialsRepository: MasterCredentialsRepository
) : ViewModel() {

    private val _children = MutableStateFlow<List<ChildDevice>>(emptyList())
    val children: StateFlow<List<ChildDevice>> = _children.asStateFlow()

    private val _reviewableTasks = MutableStateFlow<List<ReviewableTask>>(emptyList())
    val reviewableTasks: StateFlow<List<ReviewableTask>> = _reviewableTasks.asStateFlow()

    private val TAG = "DashboardViewModel"

    init {
        viewModelScope.launch {
            credentialsRepository.getCredentials.collect { (imei, _) ->
                if (imei != null) {
                    loadChildren(imei)
                    loadTasksForReview(imei)
                }
            }
        }
    }

    private fun loadTasksForReview(masterImei: String) {
        firestore.collectionGroup("tasks")
            .whereEqualTo("status", "pending_approval")
            .addSnapshotListener { snapshots, e ->
                if (e != null) {
                    Log.w(TAG, "Listen for reviewable tasks failed.", e)
                    return@addSnapshotListener
                }

                val tasks = snapshots?.mapNotNull { doc ->
                    val childId = doc.reference.parent.parent?.id ?: return@mapNotNull null
                    ReviewableTask(
                        taskId = doc.id,
                        childId = childId,
                        description = doc.getString("description") ?: "",
                        photoUrl = doc.getString("photoUrl") ?: ""
                    )
                } ?: emptyList()

                // In a real app, we would cross-reference with a list of this master's children
                // For now, we assume all pending tasks are for this master.
                _reviewableTasks.value = tasks
            }
    }

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
                Log.d(TAG, "Child devices loaded: ${childrenList.size}")
            }
    }

    fun setDeviceLocked(childImei: String, isLocked: Boolean) {
        viewModelScope.launch {
            val (imei, secret) = credentialsRepository.getCredentials.first()
            if (imei == null || secret == null) return@launch

            val data = hashMapOf(
                "masterImei" to imei,
                "secretKey" to secret,
                "childImei" to childImei,
                "isLocked" to isLocked
            )
            try {
                functions.getHttpsCallable("setDeviceLocked").call(data).await()
                Log.d(TAG, "setDeviceLocked called successfully for $childImei")
            } catch (e: Exception) {
                Log.e(TAG, "Error calling setDeviceLocked", e)
            }
        }
    }

    fun createTask(childImei: String, description: String, deadline: Long) {
        viewModelScope.launch {
            val (imei, secret) = credentialsRepository.getCredentials.first()
            if (imei == null || secret == null) return@launch

            val deadlineISO = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
                .format(java.util.Date(deadline))

            val data = hashMapOf(
                "masterImei" to imei,
                "secretKey" to secret,
                "childImei" to childImei,
                "description" to description,
                "deadlineISO" to deadlineISO
            )
            try {
                functions.getHttpsCallable("createTask").call(data).await()
                Log.d(TAG, "createTask called successfully for $childImei")
            } catch (e: Exception) {
                Log.e(TAG, "Error calling createTask", e)
            }
        }
    }

    fun approveTask(childImei: String, taskId: String) {
        viewModelScope.launch {
            val (imei, secret) = credentialsRepository.getCredentials.first()
            if (imei == null || secret == null) return@launch

            val data = hashMapOf(
                "masterImei" to imei,
                "secretKey" to secret,
                "childImei" to childImei,
                "taskId" to taskId
            )
            try {
                functions.getHttpsCallable("approveTask").call(data).await()
                Log.d(TAG, "approveTask called successfully for task $taskId")
            } catch (e: Exception) {
                Log.e(TAG, "Error calling approveTask", e)
            }
        }
    }
}
