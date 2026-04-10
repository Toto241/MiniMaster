package com.google.pairing.core.events

enum class DeviceEventType {
    APP_OPENED,
    TIME_LIMIT_REACHED,
    LOCATION_CHANGED,
    DEVICE_UNLOCKED,
}

data class DeviceEvent(
    val type: DeviceEventType,
    val payload: Map<String, String> = emptyMap(),
    val timestamp: Long = System.currentTimeMillis(),
)