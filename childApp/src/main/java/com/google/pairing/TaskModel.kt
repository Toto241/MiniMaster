package com.google.pairing

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

/**
 * Datenmodell für eine Aufgabe, wie sie in Firestore gespeichert ist.
 * Entspricht der Struktur in der 'tasks' Subcollection.
 */
data class TaskModel(
    @DocumentId
    val taskId: String = "",
    val childId: String = "",
    val masterId: String = "",
    val title: String = "",
    val description: String = "",
    val unlockDuration: Long = 0, // Dauer in Minuten
    val status: String = "ASSIGNED", // ASSIGNED, SUBMITTED, APPROVED, REJECTED
    val proofUrl: String? = null,
    @ServerTimestamp
    val assignedAt: Date? = null,
    @ServerTimestamp
    val completedAt: Date? = null
)

/**
 * Enum für die möglichen Status einer Aufgabe.
 */
enum class TaskStatus(val value: String) {
    ASSIGNED("ASSIGNED"),
    SUBMITTED("SUBMITTED"),
    APPROVED("APPROVED"),
    REJECTED("REJECTED");

    companion object {
        fun fromString(status: String): TaskStatus = values().firstOrNull { it.value == status } ?: ASSIGNED
    }
}
