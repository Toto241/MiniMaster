package com.minimaster.masterapp

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MasterFcmMessageRouterTest {

    @Test
    fun route_taskPendingApproval_maps_to_task_channel_and_extras() {
        val command = MasterFcmMessageRouter.route(
            mapOf(
                "type" to "task_pending_approval",
                "title" to "Neue Aufgabe",
                "body" to "Bitte pruefen",
                "childId" to "child-1",
                "taskId" to "task-9",
            )
        )

        assertEquals("Neue Aufgabe", command.title)
        assertEquals("Bitte pruefen", command.body)
        assertEquals(MasterFcmMessageRouter.CHANNEL_ID_TASKS, command.channelId)
        assertEquals("child-1", command.extras["childId"])
        assertEquals("task-9", command.extras["taskId"])
    }

    @Test
    fun route_deviceStatusChange_maps_to_device_channel_without_task_extras() {
        val command = MasterFcmMessageRouter.route(
            mapOf(
                "type" to "device_status_change",
                "title" to "Gerätestatus",
                "body" to "Kind ist offline",
            )
        )

        assertEquals("Gerätestatus", command.title)
        assertEquals("Kind ist offline", command.body)
        assertEquals(MasterFcmMessageRouter.CHANNEL_ID_DEVICE, command.channelId)
        assertTrue(command.extras.isEmpty())
    }

    @Test
    fun route_unknownType_falls_back_to_task_channel_with_defaults() {
        val command = MasterFcmMessageRouter.route(emptyMap())

        assertEquals("MiniMaster", command.title)
        assertEquals("", command.body)
        assertEquals(MasterFcmMessageRouter.CHANNEL_ID_TASKS, command.channelId)
        assertTrue(command.extras.isEmpty())
    }
}
