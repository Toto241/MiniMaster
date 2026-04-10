package com.google.pairing

import org.junit.Assert.assertEquals
import org.junit.Test

class TaskProofStoragePathTest {

    @Test
    fun build_returnsCanonicalProofPath() {
        val path = TaskProofStoragePath.build("child-1", "task-1", 123456789L)

        assertEquals("proofs/child-1/task-1/123456789.jpg", path)
    }

    @Test(expected = IllegalArgumentException::class)
    fun build_rejectsBlankChildId() {
        TaskProofStoragePath.build(" ", "task-1", 123L)
    }

    @Test(expected = IllegalArgumentException::class)
    fun build_rejectsBlankTaskId() {
        TaskProofStoragePath.build("child-1", " ", 123L)
    }
}