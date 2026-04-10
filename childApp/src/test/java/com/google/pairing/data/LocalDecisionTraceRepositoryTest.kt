package com.google.pairing.data

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.rules.RuleAction
import com.google.pairing.core.trace.DecisionTrace
import com.google.pairing.data.repositories.LocalDecisionTraceRepository
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class LocalDecisionTraceRepositoryTest {

    private lateinit var context: Context
    private lateinit var repository: LocalDecisionTraceRepository

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context.getSharedPreferences("decision_trace_store", Context.MODE_PRIVATE).edit().clear().commit()
        repository = LocalDecisionTraceRepository(context)
    }

    @Test
    fun appendAndListRecent_persistsMostRecentFirst() {
        repository.append(
            DecisionTrace(
                ruleId = "r1",
                reason = "first",
                action = RuleAction.NOTIFY,
                timestamp = 1L,
                eventType = DeviceEventType.APP_OPENED,
            )
        )
        repository.append(
            DecisionTrace(
                ruleId = "r2",
                reason = "second",
                action = RuleAction.BLOCK,
                timestamp = 2L,
                eventType = DeviceEventType.TIME_LIMIT_REACHED,
            )
        )

        val traces = repository.listRecent(10)

        assertEquals(2, traces.size)
        assertEquals("r2", traces.first().ruleId)
        assertEquals("r1", traces.last().ruleId)
    }

    @Test
    fun markSynced_updatesExistingTrace() {
        val trace = DecisionTrace(
            ruleId = "r1",
            reason = "sync me",
            action = RuleAction.ALLOW,
            timestamp = 3L,
            eventType = DeviceEventType.DEVICE_UNLOCKED,
        )
        repository.append(trace)

        repository.markSynced(trace.traceId)

        assertTrue(repository.listRecent(1).first().synced)
    }
}