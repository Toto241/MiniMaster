package com.google.pairing.core

import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.events.EventDispatcher
import com.google.pairing.core.events.EventListener
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

class EventDispatcherTest {

    @Test
    fun dispatch_notifiesRegisteredListenersInOrder() = runBlocking {
        val dispatcher = EventDispatcher()
        val received = mutableListOf<String>()

        dispatcher.register(object : EventListener {
            override suspend fun onEvent(event: DeviceEvent) {
                received += "first:${event.type.name}"
            }
        })
        dispatcher.register(object : EventListener {
            override suspend fun onEvent(event: DeviceEvent) {
                received += "second:${event.type.name}"
            }
        })

        dispatcher.dispatch(DeviceEvent(type = DeviceEventType.APP_OPENED))

        assertEquals(listOf("first:APP_OPENED", "second:APP_OPENED"), received)
    }
}