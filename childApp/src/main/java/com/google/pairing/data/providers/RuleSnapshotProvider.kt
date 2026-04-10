package com.google.pairing.data.providers

import android.content.Context
import com.google.pairing.PolicyPreferences
import com.google.pairing.child.ChildProtectionPolicy
import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.rules.AppCondition
import com.google.pairing.core.rules.EventTypeCondition
import com.google.pairing.core.rules.PayloadValueCondition
import com.google.pairing.core.rules.RuleAction
import com.google.pairing.core.rules.RuleDefinition
import com.google.pairing.core.rules.TimeWindowCondition

class RuleSnapshotProvider(
    private val context: Context,
) {
    fun getRules(): List<RuleDefinition> {
        val rules = mutableListOf<RuleDefinition>()

        PolicyPreferences.getBlockedApps(context)
            .filter { it.isNotBlank() }
            .forEach { packageName ->
                rules += RuleDefinition(
                    ruleId = "blocked-app-$packageName",
                    name = "Blockierte App $packageName",
                    reason = "Die App $packageName ist in der statischen Sperrliste hinterlegt.",
                    action = RuleAction.BLOCK,
                    conditions = listOf(
                        EventTypeCondition(DeviceEventType.APP_OPENED),
                        AppCondition(packageName),
                    ),
                )
            }

        val usageRulesJson = PolicyPreferences.getUsageRules(context)
        if (!usageRulesJson.isNullOrBlank()) {
            val parsedRules = ChildProtectionPolicy.parseUsageRules(usageRulesJson)

            if (parsedRules.allowedStartMinutes != null && parsedRules.allowedEndMinutes != null) {
                rules += RuleDefinition(
                    ruleId = "allowed-window",
                    name = "Zeitfenster-Regel",
                    reason = "Die Nutzung liegt außerhalb des erlaubten Zeitfensters.",
                    action = RuleAction.BLOCK,
                    conditions = listOf(
                        EventTypeCondition(DeviceEventType.APP_OPENED),
                        TimeWindowCondition(
                            startMinutes = parsedRules.allowedStartMinutes,
                            endMinutes = parsedRules.allowedEndMinutes,
                            matchesOutsideWindow = true,
                        ),
                    ),
                )
            }

            if (parsedRules.dailyLimitMillis > 0) {
                rules += RuleDefinition(
                    ruleId = "daily-limit",
                    name = "Tageslimit",
                    reason = "Das statische Tageslimit wurde erreicht.",
                    action = RuleAction.BLOCK,
                    conditions = listOf(
                        EventTypeCondition(DeviceEventType.TIME_LIMIT_REACHED),
                        PayloadValueCondition("scope", "daily"),
                    ),
                )
            }

            parsedRules.perAppLimitsMillis.keys.forEach { packageName ->
                rules += RuleDefinition(
                    ruleId = "per-app-limit-$packageName",
                    name = "App-Limit $packageName",
                    reason = "Das App-spezifische Zeitlimit für $packageName wurde erreicht.",
                    action = RuleAction.BLOCK,
                    conditions = listOf(
                        EventTypeCondition(DeviceEventType.TIME_LIMIT_REACHED),
                        AppCondition(packageName),
                    ),
                )
            }
        }

        return rules
    }
}