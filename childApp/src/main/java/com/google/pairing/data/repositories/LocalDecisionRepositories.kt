package com.google.pairing.data.repositories

import android.content.Context
import com.google.pairing.core.events.DeviceEvent
import com.google.pairing.core.events.DeviceEventType
import com.google.pairing.core.rules.RuleAction
import com.google.pairing.core.trace.DecisionTrace
import org.json.JSONArray
import org.json.JSONObject

private const val TRACE_PREFS = "decision_trace_store"
private const val TRACE_KEY = "traces"
private const val EVENT_PREFS = "pending_device_events"
private const val EVENT_KEY = "events"
private const val MAX_TRACE_ENTRIES = 100
private const val MAX_PENDING_EVENTS = 100

class LocalDecisionTraceRepository(
    private val context: Context,
) {
    fun append(trace: DecisionTrace) {
        val nextItems = JSONArray().apply {
            put(trace.toJson())
            readAll().forEachIndexed { index, item ->
                if (index < MAX_TRACE_ENTRIES - 1) {
                    put(item.toJson())
                }
            }
        }
        save(nextItems)
    }

    fun listRecent(limit: Int = 10): List<DecisionTrace> = readAll().take(limit)

    fun markSynced(traceId: String) {
        val nextItems = JSONArray().apply {
            readAll().forEach { trace ->
                val nextTrace = if (trace.traceId == traceId) trace.copy(synced = true) else trace
                put(nextTrace.toJson())
            }
        }
        save(nextItems)
    }

    private fun readAll(): List<DecisionTrace> {
        val raw = context.getSharedPreferences(TRACE_PREFS, Context.MODE_PRIVATE).getString(TRACE_KEY, null)
            ?: return emptyList()
        val jsonArray = JSONArray(raw)
        return buildList {
            for (index in 0 until jsonArray.length()) {
                add(jsonArray.getJSONObject(index).toDecisionTrace())
            }
        }
    }

    private fun save(jsonArray: JSONArray) {
        context.getSharedPreferences(TRACE_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(TRACE_KEY, jsonArray.toString())
            .apply()
    }
}

class PendingDeviceEventRepository(
    private val context: Context,
) {
    fun enqueue(event: DeviceEvent) {
        val existing = readAll().toMutableList()
        existing += event
        val nextItems = JSONArray().apply {
            existing.takeLast(MAX_PENDING_EVENTS).forEach { put(it.toJson()) }
        }
        save(nextItems)
    }

    fun readAll(): List<DeviceEvent> {
        val raw = context.getSharedPreferences(EVENT_PREFS, Context.MODE_PRIVATE).getString(EVENT_KEY, null)
            ?: return emptyList()
        val jsonArray = JSONArray(raw)
        return buildList {
            for (index in 0 until jsonArray.length()) {
                add(jsonArray.getJSONObject(index).toDeviceEvent())
            }
        }
    }

    fun clear() {
        context.getSharedPreferences(EVENT_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(EVENT_KEY)
            .apply()
    }

    private fun save(jsonArray: JSONArray) {
        context.getSharedPreferences(EVENT_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(EVENT_KEY, jsonArray.toString())
            .apply()
    }
}

private fun DecisionTrace.toJson(): JSONObject = JSONObject().apply {
    put("traceId", traceId)
    put("ruleId", ruleId)
    put("reason", reason)
    put("action", action.name)
    put("timestamp", timestamp)
    put("eventType", eventType.name)
    put("payload", JSONObject(payload))
    put("synced", synced)
}

private fun JSONObject.toDecisionTrace(): DecisionTrace {
    val payloadJson = optJSONObject("payload") ?: JSONObject()
    val payload = mutableMapOf<String, String>()
    payloadJson.keys().forEach { key -> payload[key] = payloadJson.optString(key) }
    return DecisionTrace(
        traceId = getString("traceId"),
        ruleId = getString("ruleId"),
        reason = getString("reason"),
        action = RuleAction.valueOf(getString("action")),
        timestamp = getLong("timestamp"),
        eventType = DeviceEventType.valueOf(getString("eventType")),
        payload = payload,
        synced = optBoolean("synced", false),
    )
}

private fun DeviceEvent.toJson(): JSONObject = JSONObject().apply {
    put("type", type.name)
    put("timestamp", timestamp)
    put("payload", JSONObject(payload))
}

private fun JSONObject.toDeviceEvent(): DeviceEvent {
    val payloadJson = optJSONObject("payload") ?: JSONObject()
    val payload = mutableMapOf<String, String>()
    payloadJson.keys().forEach { key -> payload[key] = payloadJson.optString(key) }
    return DeviceEvent(
        type = DeviceEventType.valueOf(getString("type")),
        payload = payload,
        timestamp = getLong("timestamp"),
    )
}