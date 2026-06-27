package com.google.pairing

import org.junit.Assert.assertEquals
import org.junit.Test

class TaskStatusTest {

    @Test
    fun fromString_returns_matching_enum_for_known_status() {
        assertEquals(TaskStatus.APPROVED, TaskStatus.fromString("approved"))
        assertEquals(TaskStatus.PENDING_APPROVAL, TaskStatus.fromString("pending_approval"))
    }

    @Test
    fun fromString_defaults_to_none_for_unknown_status() {
        // Unknown/missing status must default to NONE (not an active task) so a
        // missing task snapshot cannot accidentally lock the child device.
        assertEquals(TaskStatus.NONE, TaskStatus.fromString("unexpected"))
        assertEquals(TaskStatus.NONE, TaskStatus.fromString(null))
    }
}
