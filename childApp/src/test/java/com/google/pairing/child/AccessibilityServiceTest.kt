package com.google.pairing.child

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccessibilityServiceTest {

    @Test
    fun `blocked apps parsing should normalize comma separated values`() {
        val blockedAppsSet = ChildProtectionPolicy.parseBlockedApps("com.app1, com.app2 ,,com.app3 ")

        assertEquals(setOf("com.app1", "com.app2", "com.app3"), blockedAppsSet)
    }

    @Test
    fun `blocked apps parsing should handle JSON array payloads`() {
        val blockedAppsSet = ChildProtectionPolicy.parseBlockedApps("[\"com.app1\", \" com.app2 \", \"\"]")

        assertEquals(setOf("com.app1", "com.app2"), blockedAppsSet)
    }

    @Test
    fun `usage rules parsing should convert limits and allowed hours`() {
        val parsedRules = ChildProtectionPolicy.parseUsageRules(
            """
            {
              "dailyLimitSeconds": 1800,
              "appLimits": {"com.game": 600, "com.video": 1200},
              "allowedHours": {"start": "08:15", "end": "20:45"}
            }
            """.trimIndent()
        )

        assertEquals(1_800_000L, parsedRules.dailyLimitMillis)
        assertEquals(600_000L, parsedRules.perAppLimitsMillis["com.game"])
        assertEquals(1_200_000L, parsedRules.perAppLimitsMillis["com.video"])
        assertEquals(495, parsedRules.allowedStartMinutes)
        assertEquals(1245, parsedRules.allowedEndMinutes)
    }

    @Test
    fun `usage blocking should trigger for global limit on managed app`() {
        val shouldBlock = ChildProtectionPolicy.shouldBlockForUsage(
            packageName = "com.example.userapp",
            ownPackageName = "com.google.pairing",
            dailyLimitMillis = 1_000L,
            currentDayUsageMillis = 1_001L,
            perAppLimitsMillis = emptyMap(),
            perAppUsageMillis = emptyMap(),
        )

        assertTrue(shouldBlock)
    }

    @Test
    fun `usage blocking should ignore system and own apps`() {
        assertFalse(
            ChildProtectionPolicy.shouldBlockForUsage(
                packageName = "com.android.settings",
                ownPackageName = "com.google.pairing",
                dailyLimitMillis = 1_000L,
                currentDayUsageMillis = 5_000L,
                perAppLimitsMillis = emptyMap(),
                perAppUsageMillis = emptyMap(),
            )
        )

        assertFalse(
            ChildProtectionPolicy.shouldBlockForUsage(
                packageName = "com.google.pairing",
                ownPackageName = "com.google.pairing",
                dailyLimitMillis = 1_000L,
                currentDayUsageMillis = 5_000L,
                perAppLimitsMillis = emptyMap(),
                perAppUsageMillis = emptyMap(),
            )
        )
    }

    @Test
    fun `usage blocking should trigger for per app limit`() {
        val shouldBlock = ChildProtectionPolicy.shouldBlockForUsage(
            packageName = "com.example.game",
            ownPackageName = "com.google.pairing",
            dailyLimitMillis = -1L,
            currentDayUsageMillis = 0L,
            perAppLimitsMillis = mapOf("com.example.game" to 300_000L),
            perAppUsageMillis = mapOf("com.example.game" to 300_001L),
        )

        assertTrue(shouldBlock)
    }

    @Test
    fun `allowed window should support daytime and overnight ranges`() {
        assertFalse(ChildProtectionPolicy.isOutsideAllowedWindow(9 * 60, 8 * 60, 20 * 60))
        assertTrue(ChildProtectionPolicy.isOutsideAllowedWindow(21 * 60, 8 * 60, 20 * 60))
        assertFalse(ChildProtectionPolicy.isOutsideAllowedWindow(23 * 60, 22 * 60, 7 * 60))
        assertFalse(ChildProtectionPolicy.isOutsideAllowedWindow(6 * 60, 22 * 60, 7 * 60))
        assertTrue(ChildProtectionPolicy.isOutsideAllowedWindow(12 * 60, 22 * 60, 7 * 60))
    }
}
