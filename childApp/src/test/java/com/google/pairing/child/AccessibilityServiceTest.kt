package com.google.pairing.child

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Unit tests for AccessibilityService related functionality
 */
@RunWith(RobolectricTestRunner::class)
class AccessibilityServiceTest {

    @Test
    fun `blocked apps parsing should handle comma separated values`() {
        // Given
        val blockedAppsString = "com.app1,com.app2,com.app3"

        // When
        val blockedAppsSet = blockedAppsString.split(",").toSet()

        // Then
        assertEquals("Should have 3 blocked apps", 3, blockedAppsSet.size)
        assertTrue("Should contain com.app1", blockedAppsSet.contains("com.app1"))
        assertTrue("Should contain com.app2", blockedAppsSet.contains("com.app2"))
        assertTrue("Should contain com.app3", blockedAppsSet.contains("com.app3"))
    }

    @Test
    fun `empty blocked apps string should result in empty set`() {
        // Given
        val blockedAppsString = ""

        // When
        val blockedAppsSet = if (blockedAppsString.isNotEmpty()) {
            blockedAppsString.split(",").toSet()
        } else {
            emptySet()
        }

        // Then
        assertEquals("Empty string should result in empty set", 0, blockedAppsSet.size)
    }

    @Test
    fun `system apps should be filtered out correctly`() {
        // Given
        val testPackages = listOf(
            "com.android.settings",
            "com.android.systemui",
            "com.google.pairing.child",
            "com.example.userapp",
            "com.facebook.katana"
        )

        // When - Filter system apps and our own app
        val userApps = testPackages.filter { packageName ->
            !packageName.startsWith("com.android") &&
            packageName != "com.google.pairing.child"
        }

        // Then
        assertEquals("Should have 2 user apps", 2, userApps.size)
        assertTrue("Should contain user app", userApps.contains("com.example.userapp"))
        assertTrue("Should contain Facebook", userApps.contains("com.facebook.katana"))
    }

    @Test
    fun `usage rules should be parsed correctly`() {
        // Given
        val usageRulesJson = "{\"dailyLimitSeconds\": 3600}"

        // When
                val jsonObject = JSONObject(usageRulesJson)
        val limit = jsonObject.optLong("dailyLimitSeconds", -1L)

        // Then
        assertEquals("Daily limit should be 3600", 3600L, limit)
    }

        @Test
        fun `usage rules should parse app limits and allowed hours`() {
                val usageRulesJson = """
                        {
                            "dailyLimitSeconds": 7200,
                            "appLimits": {
                                "com.example.game": 1800,
                                "com.example.video": 2400
                            },
                            "allowedHours": {
                                "start": "08:00",
                                "end": "20:00"
                            }
                        }
                """.trimIndent()

                val jsonObject = JSONObject(usageRulesJson)
                val appLimits = jsonObject.getJSONObject("appLimits")
                val allowedHours = jsonObject.getJSONObject("allowedHours")

                assertEquals(7200L, jsonObject.optLong("dailyLimitSeconds", -1L))
                assertEquals(1800L, appLimits.getLong("com.example.game"))
                assertEquals(2400L, appLimits.getLong("com.example.video"))
                assertEquals("08:00", allowedHours.optString("start"))
                assertEquals("20:00", allowedHours.optString("end"))
        }

    @Test
    fun `invalid usage rules should handle gracefully`() {
        // Given
        val invalidJson = "{invalid_json}"

        // When
        var limit = -1L
        try {
            val jsonObject = JSONObject(invalidJson)
            limit = jsonObject.optLong("dailyLimitSeconds", -1L)
        } catch (e: Exception) {
            // Expected
        }

        // Then
        assertEquals("Limit should remain default", -1L, limit)
    }
}
