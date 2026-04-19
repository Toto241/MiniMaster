package com.google.pairing.child

import org.junit.Assert.assertEquals
import org.junit.Test

class OfflinePolicyCacheTest {

    private val safeMode = "{\"safeMode\":true}"
    private val payload = "{\"dailyLimitSeconds\":3600}"

    private fun cache(version: Int = 1, source: Long = 0L, applied: Long = 0L) =
        CachedPolicy(version, applied, source, payload)

    // ── Freshness ─────────────────────────────────────────────

    @Test fun `null cache is expired`() {
        assertEquals(
            PolicyFreshness.EXPIRED_SAFE_MODE,
            OfflinePolicyCache.assessFreshness(null, nowEpochMs = 1000L)
        )
    }

    @Test fun `recent cache is fresh`() {
        val c = cache(source = 1000L)
        assertEquals(
            PolicyFreshness.FRESH,
            OfflinePolicyCache.assessFreshness(c, nowEpochMs = 1000L + 60_000L)
        )
    }

    @Test fun `cache between stale and hard-expire is stale-but-usable`() {
        val c = cache(source = 0L)
        val now = OfflinePolicyCache.DEFAULT_STALE_AFTER_MS + 1000L
        assertEquals(
            PolicyFreshness.STALE_BUT_USABLE,
            OfflinePolicyCache.assessFreshness(c, nowEpochMs = now)
        )
    }

    @Test fun `cache after hard-expire forces safe mode`() {
        val c = cache(source = 0L)
        val now = OfflinePolicyCache.DEFAULT_HARD_EXPIRE_MS + 1000L
        assertEquals(
            PolicyFreshness.EXPIRED_SAFE_MODE,
            OfflinePolicyCache.assessFreshness(c, nowEpochMs = now)
        )
    }

    @Test fun `clock skew (now before source) is treated as fresh`() {
        val c = cache(source = 10_000L)
        assertEquals(
            PolicyFreshness.FRESH,
            OfflinePolicyCache.assessFreshness(c, nowEpochMs = 5_000L)
        )
    }

    // ── Conflict resolution ───────────────────────────────────

    @Test fun `null local always replaces with remote`() {
        val remote = cache(version = 5)
        assertEquals(
            PolicyMergeOutcome.REPLACE_WITH_REMOTE,
            OfflinePolicyCache.resolveConflict(local = null, remote = remote)
        )
    }

    @Test fun `higher remote version wins`() {
        val local = cache(version = 4)
        val remote = cache(version = 5)
        assertEquals(
            PolicyMergeOutcome.REPLACE_WITH_REMOTE,
            OfflinePolicyCache.resolveConflict(local, remote)
        )
    }

    @Test fun `lower remote version is rejected`() {
        val local = cache(version = 5)
        val remote = cache(version = 4)
        assertEquals(
            PolicyMergeOutcome.KEEP_LOCAL,
            OfflinePolicyCache.resolveConflict(local, remote)
        )
    }

    @Test fun `same version with older remote applied-time wins deterministically`() {
        val local = cache(version = 5, applied = 2000L)
        val remote = cache(version = 5, applied = 1000L)
        assertEquals(
            PolicyMergeOutcome.TIE_PREFER_OLDER,
            OfflinePolicyCache.resolveConflict(local, remote)
        )
    }

    @Test fun `same version and same applied-time keeps local`() {
        val local = cache(version = 5, applied = 1000L)
        val remote = cache(version = 5, applied = 1000L)
        assertEquals(
            PolicyMergeOutcome.KEEP_LOCAL,
            OfflinePolicyCache.resolveConflict(local, remote)
        )
    }

    // ── selectEnforcedPolicy ──────────────────────────────────

    @Test fun `selects payload when fresh`() {
        val c = cache(source = 1000L)
        assertEquals(
            payload,
            OfflinePolicyCache.selectEnforcedPolicy(c, nowEpochMs = 2000L, safeModeJson = safeMode)
        )
    }

    @Test fun `selects safe-mode when expired`() {
        val c = cache(source = 0L)
        val now = OfflinePolicyCache.DEFAULT_HARD_EXPIRE_MS + 5000L
        assertEquals(
            safeMode,
            OfflinePolicyCache.selectEnforcedPolicy(c, nowEpochMs = now, safeModeJson = safeMode)
        )
    }

    @Test fun `selects payload when stale-but-usable`() {
        val c = cache(source = 0L)
        val now = OfflinePolicyCache.DEFAULT_STALE_AFTER_MS + 60_000L
        assertEquals(
            payload,
            OfflinePolicyCache.selectEnforcedPolicy(c, nowEpochMs = now, safeModeJson = safeMode)
        )
    }
}
