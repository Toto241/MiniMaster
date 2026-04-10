package com.google.pairing.core.enforcement

import com.google.pairing.core.engine.RuleDecision
import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.rules.RuleAction

data class EnforcementResult(
    val action: RuleAction,
    val executed: Boolean,
)

interface EnforcementManager {
    suspend fun execute(decision: RuleDecision, event: DeviceEvent): EnforcementResult
}

class AndroidEnforcementManager(
    private val onBlockApp: (String) -> Unit,
    private val onNotify: (String) -> Unit = {},
    private val onAllow: () -> Unit = {},
) : EnforcementManager {
    override suspend fun execute(decision: RuleDecision, event: DeviceEvent): EnforcementResult {
        return when (decision.action) {
            RuleAction.BLOCK -> {
                val packageName = event.payload["packageName"]
                if (!packageName.isNullOrBlank()) {
                    onBlockApp(packageName)
                    EnforcementResult(decision.action, true)
                } else {
                    EnforcementResult(decision.action, false)
                }
            }

            RuleAction.NOTIFY -> {
                onNotify(decision.reason)
                EnforcementResult(decision.action, true)
            }

            RuleAction.ALLOW -> {
                onAllow()
                EnforcementResult(decision.action, true)
            }
        }
    }
}