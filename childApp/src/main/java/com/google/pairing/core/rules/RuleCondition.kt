package com.google.pairing.core.rules

import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.events.DeviceEventType

data class RuleEvaluationContext(
    val event: DeviceEvent,
    val currentMinutes: Int,
)

fun interface RuleCondition {
    fun matches(context: RuleEvaluationContext): Boolean
}

data class EventTypeCondition(
    private val expectedType: DeviceEventType,
) : RuleCondition {
    override fun matches(context: RuleEvaluationContext): Boolean = context.event.type == expectedType
}

data class AppCondition(
    private val packageName: String,
) : RuleCondition {
    override fun matches(context: RuleEvaluationContext): Boolean =
        context.event.payload["packageName"] == packageName
}

data class PayloadValueCondition(
    private val key: String,
    private val expectedValue: String,
) : RuleCondition {
    override fun matches(context: RuleEvaluationContext): Boolean =
        context.event.payload[key] == expectedValue
}

data class TimeWindowCondition(
    private val startMinutes: Int,
    private val endMinutes: Int,
    private val matchesOutsideWindow: Boolean = true,
) : RuleCondition {
    override fun matches(context: RuleEvaluationContext): Boolean {
        val insideWindow = if (startMinutes <= endMinutes) {
            context.currentMinutes in startMinutes until endMinutes
        } else {
            context.currentMinutes >= startMinutes || context.currentMinutes < endMinutes
        }
        return if (matchesOutsideWindow) !insideWindow else insideWindow
    }
}