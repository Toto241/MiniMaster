package com.google.pairing.core.rules

data class RuleDefinition(
    val ruleId: String,
    val name: String,
    val reason: String,
    val action: RuleAction,
    val enabled: Boolean = true,
    val conditions: List<RuleCondition> = emptyList(),
)