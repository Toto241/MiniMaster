package com.google.pairing.core.events

interface EventListener {
    suspend fun onEvent(event: DeviceEvent)
}

class EventDispatcher {
    private val listeners = mutableListOf<EventListener>()

    fun register(listener: EventListener) {
        listeners += listener
    }

    suspend fun dispatch(event: DeviceEvent) {
        listeners.forEach { listener ->
            listener.onEvent(event)
        }
    }
}