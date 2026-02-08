package com.google.pairing

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

/**
 * Data model for a task, as stored in Firestore.
 * Corresponds to the structure in the 'tasks' subcollection.
 *
 * @property taskId The unique document ID of the task.
 * @property masterImei The IMEI of the master (parent) who assigned the task.
 * @property description A detailed description of the task.
 * @property status The current status of the task (pending, pending_approval, approved, rejected).
 * @property photoUrl The URL of the photo proof, if submitted.
 * @property deadline The deadline for the task.
 * @property createdAt The timestamp when the task was created/assigned.
 * @property completedAt The timestamp when the task was completed.
 */
data class TaskModel(
    @DocumentId
    val taskId: String = "",
    val masterImei: String = "",
    val description: String = "",
    val status: String = "pending", // pending, pending_approval, approved, rejected
    val photoUrl: String? = null,
    val deadline: Date? = null,
    @ServerTimestamp
    val createdAt: Date? = null,
    @ServerTimestamp
    val completedAt: Date? = null
)

/**
 * Enum representing the possible states of a task.
 *
 * @property value The string representation of the status as stored in Firestore.
 */
enum class TaskStatus(val value: String) {
    /** The task has been assigned but not yet completed. */
    PENDING("pending"),
    /** The child has submitted a proof, waiting for approval. */
    PENDING_APPROVAL("pending_approval"),
    /** The parent has approved the task. */
    APPROVED("approved"),
    /** The parent has rejected the proof. */
    REJECTED("rejected");

    companion object {
        /**
         * Converts a string status to the corresponding [TaskStatus] enum.
         * Defaults to [PENDING] if the string does not match.
         * @param status The string status to convert.
         * @return The matching [TaskStatus].
         */
        fun fromString(status: String): TaskStatus = values().firstOrNull { it.value == status } ?: PENDING
    }
}
