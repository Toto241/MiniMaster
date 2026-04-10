package com.google.pairing.core

import com.google.pairing.core.engine.RuleDecision
import com.google.pairing.core.enforcement.AndroidEnforcementManager
import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.rules.RuleAction
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidEnforcementManagerTest {

    @Test
    fun execute_blocksTargetAppWithoutDecisionLogic() = runBlocking {
        var blockedPackage: String? = null
        val manager = AndroidEnforcementManager(onBlockApp = { blockedPackage = it })

        val result = manager.execute(
            decision = RuleDecision(RuleAction.BLOCK, "blocked-app", "blocked", System.currentTimeMillis()),
            event = DeviceEvent(DeviceEventType.APP_OPENED, payload = mapOf("packageName" to "com.example.app")),
        )

        assertTrue(result.executed)
        assertEquals("com.example.app", blockedPackage)
    }

    @Test
    fun execute_returnsFalseForBlockWithoutTargetPackage() = runBlocking {
        val manager = AndroidEnforcementManager(onBlockApp = {})

        val result = manager.execute(
            decision = RuleDecision(RuleAction.BLOCK, "blocked-app", "blocked", System.currentTimeMillis()),
            event = DeviceEvent(DeviceEventType.APP_OPENED),
        )

        assertFalse(result.executed)
    }
}