package com.google.pairing.services

import com.google.pairing.core.engine.RuleEngine
import com.google.pairing.core.enforcement.EnforcementManager
import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.events.EventDispatcher
import com.google.pairing.core.trace.DecisionTrace
import com.google.pairing.data.providers.RuleSnapshotProvider
import com.google.pairing.data.repositories.LocalDecisionTraceRepository

class EventProcessingPipeline(
    private val eventDispatcher: EventDispatcher,
    private val ruleSnapshotProvider: RuleSnapshotProvider,
    private val ruleEngine: RuleEngine,
    private val enforcementManager: EnforcementManager,
    private val decisionTraceRepository: LocalDecisionTraceRepository,
    private val backendSyncGateway: BackendSyncGateway,
    private val deviceIdProvider: () -> String,
) {
    suspend fun process(event: DeviceEvent): DecisionTrace {
        eventDispatcher.dispatch(event)

        val deviceId = deviceIdProvider()
        runCatching { backendSyncGateway.flushPending(deviceId) }

        val rules = ruleSnapshotProvider.getRules()
        val decision = ruleEngine.evaluate(event, rules)
        enforcementManager.execute(decision, event)

        val trace = DecisionTrace(
            ruleId = decision.ruleId,
            reason = decision.reason,
            action = decision.action,
            timestamp = decision.timestamp,
            eventType = event.type,
            payload = event.payload,
        )
        decisionTraceRepository.append(trace)
        backendSyncGateway.syncEvent(deviceId, event)
        backendSyncGateway.syncTrace(deviceId, trace)
        return trace
    }
}