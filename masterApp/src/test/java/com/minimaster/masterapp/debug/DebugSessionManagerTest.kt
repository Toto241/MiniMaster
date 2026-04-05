package com.minimaster.masterapp.debug

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class DebugSessionManagerTest {

    @After
    fun tearDown() {
        DebugSessionManager.resetForTesting()
    }

    @Test
    fun `activation requires pending challenge and valid token`() {
        var now = 1_000L
        DebugSessionManager.currentTimeProvider = { now }
        DebugSessionManager.secretProvider = { "test-master-secret" }
        DebugSessionManager.challengeProvider = { "fixedchallenge" }

        DebugSessionManager.generateChallenge()
        val challenge = DebugSessionManager.peekPendingChallenge()
        val token = computeHmac("test-master-secret", challenge + "_ACTIVATE_MASTER")

        assertTrue(DebugSessionManager.activateSession(token))
        assertTrue(DebugSessionManager.isSessionActive())
        assertTrue(
            DebugSessionManager.dumpStateJson("registered", "1234", "abcd", true, "deadbeef")
                .contains("\"sessionActive\": true")
        )

        now += 31L * 60 * 1000
        assertFalse(DebugSessionManager.isSessionActive())
    }

    @Test
    fun `challenge is one time use even after successful activation`() {
        DebugSessionManager.secretProvider = { "test-master-secret" }
        DebugSessionManager.challengeProvider = { "onceonly" }

        DebugSessionManager.generateChallenge()
        val challenge = DebugSessionManager.peekPendingChallenge()
        val token = computeHmac("test-master-secret", challenge + "_ACTIVATE_MASTER")

        assertTrue(DebugSessionManager.activateSession(token))
        DebugSessionManager.deactivateSession()
        assertFalse(DebugSessionManager.activateSession(token))
    }

    @Test
    fun `disabled secret keeps debug session closed by default`() {
        DebugSessionManager.secretProvider = { "DISABLED" }
        DebugSessionManager.generateChallenge()

        assertFalse(DebugSessionManager.activateSession("irrelevant"))
        assertTrue(DebugSessionManager.dumpStateJson("registered", "1234", "abcd", true, "deadbeef").contains("no_active_debug_session"))
    }

    private fun computeHmac(secret: String, data: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        return mac.doFinal(data.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}
