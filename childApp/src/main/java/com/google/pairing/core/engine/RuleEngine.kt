package com.google.pairing.core.engine

import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.rules.RuleAction
import com.google.pairing.core.rules.RuleDefinition
import com.google.pairing.core.rules.RuleEvaluationContext
import java.util.Calendar

data class RuleDecision(
    val action: RuleAction,
    val ruleId: String,
    val reason: String,
    val timestamp: Long,
)

class RuleEngine {
    fun evaluate(
        event: DeviceEvent,
        rules: List<RuleDefinition>,
        nowMinutes: Int = currentMinutes(),
    ): RuleDecision {
        val context = RuleEvaluationContext(event = event, currentMinutes = nowMinutes)
        val matchedRule = rules.firstOrNull { rule ->
            rule.enabled && rule.conditions.all { condition -> condition.matches(context) }
        }

        return if (matchedRule != null) {
            RuleDecision(
                action = matchedRule.action,
                ruleId = matchedRule.ruleId,
                reason = matchedRule.reason,
                timestamp = event.timestamp,
            )
        } else {
            RuleDecision(
                action = RuleAction.ALLOW,
                ruleId = "default-allow",
                reason = "Keine Regel hat auf ${event.type.name} gematcht.",
                timestamp = event.timestamp,
            )
        }
    }

    private fun currentMinutes(): Int {
        val calendar = Calendar.getInstance()
        return calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
    }
}