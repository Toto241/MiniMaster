package com.minimaster.masterapp

data class MasterFcmNotificationCommand(
    val title: String,
    val body: String,
    val channelId: String,
    val extras: Map<String, String> = emptyMap(),
)

object MasterFcmMessageRouter {
    const val CHANNEL_ID_TASKS = "task_notifications"
    const val CHANNEL_ID_DEVICE = "device_notifications"

    fun route(data: Map<String, String>): MasterFcmNotificationCommand {
        val type = data["type"] ?: "general"
        val title = data["title"] ?: "MiniMaster"
        val body = data["body"] ?: ""

        return when (type) {
            "task_pending_approval" -> MasterFcmNotificationCommand(
                title = title,
                body = body,
                channelId = CHANNEL_ID_TASKS,
                extras = mapOf(
                    "childId" to (data["childId"] ?: ""),
                    "taskId" to (data["taskId"] ?: ""),
                ),
            )
            "device_status_change" -> MasterFcmNotificationCommand(
                title = title,
                body = body,
                channelId = CHANNEL_ID_DEVICE,
            )
            else -> MasterFcmNotificationCommand(
                title = title,
                body = body,
                channelId = CHANNEL_ID_TASKS,
            )
        }
    }
}
