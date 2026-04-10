package com.google.pairing.services

import com.google.firebase.functions.FirebaseFunctions
import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.trace.DecisionTrace
import com.google.pairing.data.repositories.LocalDecisionTraceRepository
import com.google.pairing.data.repositories.PendingDeviceEventRepository
import kotlinx.coroutines.tasks.await

class BackendSyncGateway(
    private val functions: FirebaseFunctions,
    private val traceRepository: LocalDecisionTraceRepository,
    private val eventRepository: PendingDeviceEventRepository,
) {
    suspend fun flushPending(deviceId: String) {
        val pendingEvents = eventRepository.readAll()
        if (pendingEvents.isEmpty()) return

        pendingEvents.forEach { event ->
            functions.getHttpsCallable("ingestEvent").call(
                hashMapOf(
                    "deviceId" to deviceId,
                    "type" to event.type.name,
                    "payload" to HashMap(event.payload),
                    "timestamp" to event.timestamp,
                )
            ).await()
        }
        eventRepository.clear()
    }

    suspend fun syncEvent(deviceId: String, event: DeviceEvent) {
        try {
            functions.getHttpsCallable("ingestEvent").call(
                hashMapOf(
                    "deviceId" to deviceId,
                    "type" to event.type.name,
                    "payload" to HashMap(event.payload),
                    "timestamp" to event.timestamp,
                )
            ).await()
        } catch (_: Exception) {
            eventRepository.enqueue(event)
        }
    }

    suspend fun syncTrace(deviceId: String, trace: DecisionTrace) {
        try {
            functions.getHttpsCallable("logDecision").call(
                hashMapOf(
                    "deviceId" to deviceId,
                    "ruleId" to trace.ruleId,
                    "reason" to trace.reason,
                    "action" to trace.action.name,
                    "timestamp" to trace.timestamp,
                    "eventType" to trace.eventType.name,
                )
            ).await()
            traceRepository.markSynced(trace.traceId)
        } catch (_: Exception) {
            // Trace remains local and unsynced for later inspection / retry.
        }
    }
}