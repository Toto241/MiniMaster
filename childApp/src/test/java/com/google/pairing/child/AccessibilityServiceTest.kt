package com.google.pairing.child

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for AccessibilityService related functionality
 */
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

}
