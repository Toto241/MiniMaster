package com.google.pairing

object TaskProofStoragePath {
    fun build(childId: String, taskId: String, timestampMillis: Long): String {
        val normalizedChildId = childId.trim()
        val normalizedTaskId = taskId.trim()
        require(normalizedChildId.isNotEmpty()) { "childId must not be blank" }
        require(normalizedTaskId.isNotEmpty()) { "taskId must not be blank" }
        require(timestampMillis >= 0L) { "timestampMillis must be non-negative" }

        return "proofs/$normalizedChildId/$normalizedTaskId/$timestampMillis.jpg"
    }
}