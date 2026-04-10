package com.minimaster.masterapp.core.rules

import com.minimaster.masterapp.UsageRulesState

data class UsageRuleDraft(
    val dailyLimitMinutes: Int,
    val allowedStartTime: String,
    val allowedEndTime: String,
    val perAppLimits: Map<String, Int>,
) {
    fun toCallablePayload(): Map<String, Any> {
        val usageRules = mutableMapOf<String, Any>()

        if (dailyLimitMinutes > 0) {
            usageRules["dailyLimitSeconds"] = dailyLimitMinutes * 60
        }

        if (allowedStartTime.isNotBlank() && allowedEndTime.isNotBlank()) {
            usageRules["allowedHours"] = mapOf(
                "start" to allowedStartTime,
                "end" to allowedEndTime,
            )
        }

        if (perAppLimits.isNotEmpty()) {
            usageRules["appLimits"] = perAppLimits.mapValues { (_, minutes) -> minutes * 60 }
        }

        return usageRules
    }

    companion object {
        fun fromState(state: UsageRulesState): UsageRuleDraft = UsageRuleDraft(
            dailyLimitMinutes = state.dailyLimitMinutes,
            allowedStartTime = state.allowedStartTime,
            allowedEndTime = state.allowedEndTime,
            perAppLimits = state.perAppLimits,
        )
    }
}