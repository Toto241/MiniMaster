package com.google.pairing

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

/**
 * Repository for managing task data and interactions with Cloud Functions.
 *
 * This class handles the retrieval of tasks from Firestore and the submission of
 * task proofs via Firebase Functions.
 *
 * @property firestore The [FirebaseFirestore] instance.
 * @property functions The [FirebaseFunctions] instance.
 * @property childIdProvider The provider for the current child ID.
 */
class TaskRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val childIdProvider: ChildIdProvider
) {

    /**
     * Helper property to get the child ID from the flow synchronously (blocking, for simplicity in some contexts)
     * or via flow collection in others. Here we use a suspend function pattern implicitly in usage.
     * Note: Accessing this property directly is not async-safe if it were just a value.
     * We will use the provider's flow in the method below.
     */

    /**
     * Returns a Flow that monitors the latest assigned task in real-time.
     * The "current" task is defined as the most recent one that is NOT in the 'APPROVED' state.
     *
     * @return A [Flow] emitting the current [TaskModel] or null if none exists.
     */
    fun observeCurrentTask(): Flow<TaskModel?> = callbackFlow {
        // We need to launch a coroutine to collect the child ID first
        val childId = childIdProvider.childIdFlow.first()

        if (childId.isNullOrEmpty()) {
            trySend(null)
            awaitClose { }
            return@callbackFlow
        }

        // Query for the latest task that is pending, submitted, or rejected.
        // We exclude APPROVED tasks as they are considered "done" history.
        val taskQuery = firestore
            .collection("children")
            .document(childId)
            .collection("tasks")
            .whereIn("status", listOf(TaskStatus.ASSIGNED.value, TaskStatus.SUBMITTED.value, TaskStatus.REJECTED.value))
            .orderBy("assignedAt", com.google.firebase.firestore.Query.Direction.DESCENDING)
            .limit(1)

        val subscription = taskQuery.addSnapshotListener { snapshot, e ->
            if (e != null) {
                close(e)
                return@addSnapshotListener
            }

            val task = snapshot?.documents?.firstOrNull()?.toObject(TaskModel::class.java)
            trySend(task)
        }

        awaitClose { subscription.remove() }
    }

    /**
     * Calls the Cloud Function to submit a proof for a specific task.
     *
     * @param taskId The ID of the task.
     * @param proofUrl The URL of the uploaded proof image.
     * @return True if the submission was successful, false otherwise.
     */
    suspend fun submitTaskProof(taskId: String, proofUrl: String): Boolean {
        val data = hashMapOf(
            "taskId" to taskId,
            "proofUrl" to proofUrl
        )

        return try {
            functions
                .getHttpsCallable("submitTaskProof")
                .call(data)
                .await()
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }
}
