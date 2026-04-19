package com.google.pairing.child

/**
 * Pure-Kotlin Offline-Policy-Cache mit Conflict-Resolution.
 *
 * Verantwortlich nur für die Entscheidungslogik – keine I/O, keine Android-Abhängigkeiten.
 * Persistierung erfolgt im aufrufenden Repository (SharedPreferences / DataStore / Firestore-Cache).
 *
 * Conflict-Resolution-Strategie:
 *  - Authoritative-Source ist immer der Server (höhere `policyVersion` gewinnt).
 *  - Bei gleicher `policyVersion` gewinnt der ältere `appliedAtEpochMs` (deterministisch).
 *  - Solange Offline-Phase < `staleAfterMillis`, darf der Cache angewendet werden.
 *  - Nach Überschreiten von `hardExpireMillis` muss der Cache als unsicher gelten
 *    und das Gerät in einen "safe-mode" (z. B. nur essentielle Apps erlaubt) wechseln.
 */
data class CachedPolicy(
    val policyVersion: Int,
    val appliedAtEpochMs: Long,
    val sourceEpochMs: Long,
    val payloadJson: String,
)

enum class PolicyFreshness {
    FRESH,
    STALE_BUT_USABLE,
    EXPIRED_SAFE_MODE,
}

enum class PolicyMergeOutcome {
    KEEP_LOCAL,
    REPLACE_WITH_REMOTE,
    TIE_PREFER_OLDER,
}

object OfflinePolicyCache {

    /**
     * Default-Schwellwerte (können vom Repository pro Profil überschrieben werden).
     */
    const val DEFAULT_STALE_AFTER_MS: Long = 6L * 60 * 60 * 1000        // 6 h
    const val DEFAULT_HARD_EXPIRE_MS: Long = 72L * 60 * 60 * 1000        // 72 h

    /**
     * Default Safe-Mode-Payload, das durchgesetzt wird, wenn der Cache `EXPIRED_SAFE_MODE`
     * ist und der Server beim Pairing keine eigene Safe-Mode-Konfiguration hinterlegt hat.
     *
     * Bedeutung: Gerät komplett gesperrt (`isLocked=true`), keine App-Whitelist, kein
     * Tageslimit – das Kind muss warten, bis das Gerät wieder online ist und eine
     * frische Policy zieht. Damit gibt es keinen "Free Pass" durch reinen Offline-Betrieb.
     */
    const val SAFE_MODE_DEFAULT_JSON: String =
        "{\"isLocked\":true,\"appBlacklist\":[],\"usageRules\":{\"dailyLimitSeconds\":0}}"

    private const val FIELD_VERSION = "policyVersion"
    private const val FIELD_APPLIED = "appliedAtEpochMs"
    private const val FIELD_SOURCE = "sourceEpochMs"
    private const val FIELD_PAYLOAD = "payloadJson"

    /**
     * Serialisiert eine `CachedPolicy` als JSON-String für die Persistierung.
     * Pure-JVM, nutzt `org.json` (testbar ohne Android-Context).
     */
    fun toJson(cache: CachedPolicy): String {
        val obj = org.json.JSONObject()
        obj.put(FIELD_VERSION, cache.policyVersion)
        obj.put(FIELD_APPLIED, cache.appliedAtEpochMs)
        obj.put(FIELD_SOURCE, cache.sourceEpochMs)
        obj.put(FIELD_PAYLOAD, cache.payloadJson)
        return obj.toString()
    }

    /**
     * Liest eine `CachedPolicy` aus dem persistierten JSON. Gibt `null` zurück, wenn
     * der Eintrag fehlt, leer oder strukturell beschädigt ist (defensiv – beschädigte
     * Caches dürfen niemals zur Anwendung kommen).
     */
    fun fromJson(raw: String?): CachedPolicy? {
        if (raw.isNullOrBlank()) return null
        return try {
            val obj = org.json.JSONObject(raw)
            CachedPolicy(
                policyVersion = obj.getInt(FIELD_VERSION),
                appliedAtEpochMs = obj.getLong(FIELD_APPLIED),
                sourceEpochMs = obj.getLong(FIELD_SOURCE),
                payloadJson = obj.getString(FIELD_PAYLOAD),
            )
        } catch (_: org.json.JSONException) {
            null
        }
    }

    fun assessFreshness(
        cache: CachedPolicy?,
        nowEpochMs: Long,
        staleAfterMillis: Long = DEFAULT_STALE_AFTER_MS,
        hardExpireMillis: Long = DEFAULT_HARD_EXPIRE_MS,
    ): PolicyFreshness {
        if (cache == null) return PolicyFreshness.EXPIRED_SAFE_MODE
        val ageMs = nowEpochMs - cache.sourceEpochMs
        return when {
            ageMs < 0 -> PolicyFreshness.FRESH                      // Clock-Skew → wohlwollend behandeln
            ageMs < staleAfterMillis -> PolicyFreshness.FRESH
            ageMs < hardExpireMillis -> PolicyFreshness.STALE_BUT_USABLE
            else -> PolicyFreshness.EXPIRED_SAFE_MODE
        }
    }

    /**
     * Vergleicht eine bereits angewandte Policy mit einer neu eingegangenen Server-Policy
     * und entscheidet, welche behalten wird.
     */
    fun resolveConflict(
        local: CachedPolicy?,
        remote: CachedPolicy,
    ): PolicyMergeOutcome {
        if (local == null) return PolicyMergeOutcome.REPLACE_WITH_REMOTE
        return when {
            remote.policyVersion > local.policyVersion -> PolicyMergeOutcome.REPLACE_WITH_REMOTE
            remote.policyVersion < local.policyVersion -> PolicyMergeOutcome.KEEP_LOCAL
            // Gleiche Version – wähle deterministisch die ältere appliedAtEpochMs
            remote.appliedAtEpochMs < local.appliedAtEpochMs -> PolicyMergeOutcome.TIE_PREFER_OLDER
            else -> PolicyMergeOutcome.KEEP_LOCAL
        }
    }

    /**
     * Liefert das Policy-JSON, das aktuell durchgesetzt werden soll.
     * Bei `EXPIRED_SAFE_MODE` wird `safeModeJson` zurückgegeben (z. B. nur Notruf-Apps erlaubt).
     */
    fun selectEnforcedPolicy(
        cache: CachedPolicy?,
        nowEpochMs: Long,
        safeModeJson: String,
        staleAfterMillis: Long = DEFAULT_STALE_AFTER_MS,
        hardExpireMillis: Long = DEFAULT_HARD_EXPIRE_MS,
    ): String {
        val freshness = assessFreshness(cache, nowEpochMs, staleAfterMillis, hardExpireMillis)
        return when (freshness) {
            PolicyFreshness.FRESH,
            PolicyFreshness.STALE_BUT_USABLE -> cache!!.payloadJson
            PolicyFreshness.EXPIRED_SAFE_MODE -> safeModeJson
        }
    }
}
