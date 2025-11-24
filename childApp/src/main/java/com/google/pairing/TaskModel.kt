package com.google.pairing

import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.ServerTimestamp
import java.util.Date

/**
 * Data model for a task, as stored in Firestore.
 * Corresponds to the structure in the 'tasks' subcollection.
 *
 * @property taskId The unique document ID of the task.
 * @property childId The ID of the child device this task is assigned to.
 * @property masterId The ID of the master (parent) who assigned the task.
 * @property title The title of the task.
 * @property description A detailed description of the task.
 * @property unlockDuration The duration in minutes for which the device will be unlocked upon approval.
 * @property status The current status of the task (ASSIGNED, SUBMITTED, APPROVED, REJECTED).
 * @property proofUrl The URL of the photo proof, if submitted.
 * @property assignedAt The timestamp when the task was created/assigned.
 * @property completedAt The timestamp when the task was approved/completed.
 */
data class TaskModel(
    @DocumentId
    val taskId: String = "",
    val childId: String = "",
    val masterId: String = "",
    val title: String = "",
    val description: String = "",
    val unlockDuration: Long = 0, // Duration in minutes
    val status: String = "ASSIGNED", // ASSIGNED, SUBMITTED, APPROVED, REJECTED
    val proofUrl: String? = null,
    @ServerTimestamp
    val assignedAt: Date? = null,
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
    ASSIGNED("ASSIGNED"),
    /** The child has submitted a proof, waiting for approval. */
    SUBMITTED("SUBMITTED"),
    /** The parent has approved the task. */
    APPROVED("APPROVED"),
    /** The parent has rejected the proof. */
    REJECTED("REJECTED");

    companion object {
        /**
         * Converts a string status to the corresponding [TaskStatus] enum.
         * Defaults to [ASSIGNED] if the string does not match.
         * @param status The string status to convert.
         * @return The matching [TaskStatus].
         */
        fun fromString(status: String): TaskStatus = values().firstOrNull { it.value == status } ?: ASSIGNED
    }
}
