package com.google.pairing.child

data class ParsedUsageRules(
    val dailyLimitMillis: Long = -1L,
    val perAppLimitsMillis: Map<String, Long> = emptyMap(),
    val allowedStartMinutes: Int? = null,
    val allowedEndMinutes: Int? = null,
)

object ChildProtectionPolicy {
    fun parseBlockedApps(rawValue: String): Set<String> {
        val trimmed = rawValue.trim()
        if (trimmed.isEmpty()) {
            return emptySet()
        }

        return if (trimmed.startsWith("[")) {
            val jsonArray = org.json.JSONArray(trimmed)
            buildSet {
                for (index in 0 until jsonArray.length()) {
                    val packageName = jsonArray.optString(index).trim()
                    if (packageName.isNotEmpty()) {
                        add(packageName)
                    }
                }
            }
        } else {
            trimmed.split(",")
                .map { it.trim() }
                .filter { it.isNotEmpty() }
                .toSet()
        }
    }

    fun parseUsageRules(json: String): ParsedUsageRules {
        val usageRules = org.json.JSONObject(json)
        val dailyLimitSeconds = usageRules.optLong("dailyLimitSeconds", -1L)
        val appLimits = usageRules.optJSONObject("appLimits")
        val allowedHours = usageRules.optJSONObject("allowedHours")

        val perAppLimitsMillis = buildMap {
            if (appLimits != null) {
                appLimits.keys().forEach { packageName ->
                    put(packageName, appLimits.optLong(packageName, 0L) * 1000)
                }
            }
        }

        val allowedStartMinutes = allowedHours?.optString("start")?.let(::parseClockMinutes)
        val allowedEndMinutes = allowedHours?.optString("end")?.let(::parseClockMinutes)

        return ParsedUsageRules(
            dailyLimitMillis = if (dailyLimitSeconds >= 0) dailyLimitSeconds * 1000 else -1L,
            perAppLimitsMillis = perAppLimitsMillis,
            allowedStartMinutes = allowedStartMinutes,
            allowedEndMinutes = allowedEndMinutes,
        )
    }

    fun isManagedUserApp(packageName: String?, ownPackageName: String): Boolean {
        return !packageName.isNullOrBlank() &&
            !packageName.startsWith("com.android") &&
            packageName != ownPackageName
    }

    fun shouldBlockForUsage(
        packageName: String?,
        ownPackageName: String,
        dailyLimitMillis: Long,
        currentDayUsageMillis: Long,
        perAppLimitsMillis: Map<String, Long>,
        perAppUsageMillis: Map<String, Long>,
    ): Boolean {
        if (!isManagedUserApp(packageName, ownPackageName)) {
            return false
        }

        if (dailyLimitMillis != -1L && currentDayUsageMillis > dailyLimitMillis) {
            return true
        }

        val appLimit = perAppLimitsMillis[packageName]
        val appUsage = perAppUsageMillis[packageName] ?: 0L
        return appLimit != null && appUsage > appLimit
    }

    fun isOutsideAllowedWindow(
        currentMinutes: Int,
        allowedStartMinutes: Int?,
        allowedEndMinutes: Int?,
    ): Boolean {
        if (allowedStartMinutes == null || allowedEndMinutes == null) {
            return false
        }

        val isWithinWindow = if (allowedStartMinutes <= allowedEndMinutes) {
            currentMinutes in allowedStartMinutes..allowedEndMinutes
        } else {
            currentMinutes >= allowedStartMinutes || currentMinutes <= allowedEndMinutes
        }

        return !isWithinWindow
    }

    private fun parseClockMinutes(value: String): Int? {
        val parts = value.split(":")
        if (parts.size != 2) {
            return null
        }

        val hours = parts[0].toIntOrNull() ?: return null
        val minutes = parts[1].toIntOrNull() ?: return null
        if (hours !in 0..23 || minutes !in 0..59) {
            return null
        }

        return hours * 60 + minutes
    }
}
