package com.google.pairing.core.trace

import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.rules.RuleAction
import java.util.UUID

data class DecisionTrace(
    val traceId: String = UUID.randomUUID().toString(),
    val ruleId: String,
    val reason: String,
    val action: RuleAction,
    val timestamp: Long,
    val eventType: DeviceEventType,
    val payload: Map<String, String> = emptyMap(),
    val synced: Boolean = false,
)