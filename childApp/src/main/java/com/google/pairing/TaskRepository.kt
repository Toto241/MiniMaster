package com.google.pairing

import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/**
 * Repository zur Verwaltung der Aufgaben-Daten und Interaktion mit den Cloud Functions.
 */
class TaskRepository(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val childIdProvider: ChildIdProvider
) {

    private val childId: String
        get() = childIdProvider.getChildId()

    /**
     * Liefert einen Flow, der die aktuellste zugewiesene Aufgabe in Echtzeit überwacht.
     * Die Aufgabe wird als das Dokument mit dem neuesten 'assignedAt' Timestamp betrachtet,
     * das NICHT den Status 'APPROVED' hat (da genehmigte Aufgaben historisch sind).
     */
    fun observeCurrentTask(): Flow<TaskModel?> = callbackFlow {
        if (childId.isEmpty()) {
            send(null)
            awaitClose { }
            return@callbackFlow
        }

        // Wir suchen nach der neuesten Aufgabe, die noch nicht abgeschlossen ist (Status != APPROVED)
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
     * Ruft die Cloud Function zum Einreichen des Nachweises auf.
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
            // Hier sollte eine robustere Fehlerbehandlung erfolgen
            e.printStackTrace()
            false
        }
    }
}
