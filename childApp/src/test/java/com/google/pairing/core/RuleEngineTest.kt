package com.google.pairing.core

import com.google.pairing.core.engine.RuleEngine
import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.rules.AppCondition
import com.google.pairing.core.rules.EventTypeCondition
import com.google.pairing.core.rules.RuleAction
import com.google.pairing.core.rules.RuleDefinition
import com.google.pairing.core.rules.TimeWindowCondition
import org.junit.Assert.assertEquals
import org.junit.Test

class RuleEngineTest {

    private val ruleEngine = RuleEngine()

    @Test
    fun evaluate_blocksBlacklistedAppDeterministically() {
        val event = DeviceEvent(
            type = DeviceEventType.APP_OPENED,
            payload = mapOf("packageName" to "com.social.media"),
        )
        val rules = listOf(
            RuleDefinition(
                ruleId = "blocked-app",
                name = "Blocked App",
                reason = "Package is blocked.",
                action = RuleAction.BLOCK,
                conditions = listOf(
                    EventTypeCondition(DeviceEventType.APP_OPENED),
                    AppCondition("com.social.media"),
                ),
            )
        )

        val decision = ruleEngine.evaluate(event, rules, nowMinutes = 10 * 60)

        assertEquals(RuleAction.BLOCK, decision.action)
        assertEquals("blocked-app", decision.ruleId)
    }

    @Test
    fun evaluate_blocksOutsideAllowedWindow() {
        val event = DeviceEvent(
            type = DeviceEventType.APP_OPENED,
            payload = mapOf("packageName" to "com.video.app"),
        )
        val rules = listOf(
            RuleDefinition(
                ruleId = "allowed-window",
                name = "Allowed Window",
                reason = "Outside allowed hours.",
                action = RuleAction.BLOCK,
                conditions = listOf(
                    EventTypeCondition(DeviceEventType.APP_OPENED),
                    TimeWindowCondition(startMinutes = 8 * 60, endMinutes = 20 * 60, matchesOutsideWindow = true),
                ),
            )
        )

        val decision = ruleEngine.evaluate(event, rules, nowMinutes = 22 * 60)

        assertEquals(RuleAction.BLOCK, decision.action)
        assertEquals("allowed-window", decision.ruleId)
    }

    @Test
    fun evaluate_defaultsToAllowWhenNoRuleMatches() {
        val event = DeviceEvent(type = DeviceEventType.DEVICE_UNLOCKED)

        val decision = ruleEngine.evaluate(event, emptyList(), nowMinutes = 12 * 60)

        assertEquals(RuleAction.ALLOW, decision.action)
        assertEquals("default-allow", decision.ruleId)
    }
}