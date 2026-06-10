"""Tests für firebase_connectivity.py — Concurrency, Proxy-Report, Diagnose."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import firebase_connectivity as fc


# ═══════════════════════════════════════════════════════════════════
#  Diagnose-Zusammenfassung
# ═══════════════════════════════════════════════════════════════════

def _entry(eid: str, *, strict_ok: bool, relaxed_ok: bool, category: str = "other"):
    return {
        "id": eid,
        "strict": {"ok": strict_ok, "category": None if strict_ok else category, "errorReason": "x"},
        "relaxed": {"ok": relaxed_ok, "skipped": strict_ok, "category": None if relaxed_ok else category},
    }


class TestSummarizeDiagnosis:
    def test_all_ok(self):
        results = [_entry("a", strict_ok=True, relaxed_ok=True)]
        d = fc._summarize_diagnosis(results, proxies={})
        assert d["level"] == "ok"

    def test_revocation_failure_flags_antivirus(self):
        results = [_entry("a", strict_ok=False, relaxed_ok=True, category="tls_revocation_check_failed")]
        d = fc._summarize_diagnosis(results, proxies={})
        assert d["level"] == "warn"
        assert any("SSL-Inspection" in h or "Antivirus" in h for h in d["hints"])

    def test_full_failure_without_proxy_hints_pac(self):
        results = [_entry("a", strict_ok=False, relaxed_ok=False, category="no_route")]
        d = fc._summarize_diagnosis(results, proxies={})
        assert d["level"] == "error"
        assert any("KEINEN Proxy" in h or "PAC" in h for h in d["hints"])

    def test_full_failure_with_proxy_lists_it(self):
        results = [_entry("a", strict_ok=False, relaxed_ok=False, category="timeout")]
        d = fc._summarize_diagnosis(results, proxies={"https": "http://corp:8080"})
        assert d["level"] == "error"
        assert any("http://corp:8080" in h for h in d["hints"])


# ═══════════════════════════════════════════════════════════════════
#  Orchestrierung (nebenläufig, ohne echtes Netzwerk)
# ═══════════════════════════════════════════════════════════════════

class TestRunConnectivityCheck:
    def test_returns_proxies_and_all_endpoints(self, monkeypatch):
        monkeypatch.setattr(
            fc, "_probe_endpoint",
            lambda url, *, verify_tls, timeout=6.0: {"ok": True, "statusCode": 200, "elapsedMs": 1, "tlsVerified": verify_tls},
        )
        monkeypatch.setattr(fc, "_detect_proxies", lambda: {"https": "http://corp:8080"})

        result = fc.run_connectivity_check(timeout=1.0)

        assert result["proxies"] == {"https": "http://corp:8080"}
        assert len(result["endpoints"]) == len(fc.DEFAULT_ENDPOINTS)
        # Reihenfolge bleibt deterministisch wie in DEFAULT_ENDPOINTS.
        assert [e["id"] for e in result["endpoints"]] == [e["id"] for e in fc.DEFAULT_ENDPOINTS]
        assert result["diagnosis"]["level"] == "ok"

    def test_skips_relaxed_when_strict_ok(self, monkeypatch):
        calls: list[bool] = []

        def fake_probe(url, *, verify_tls, timeout=6.0):
            calls.append(verify_tls)
            return {"ok": True, "statusCode": 200, "elapsedMs": 1, "tlsVerified": verify_tls}

        monkeypatch.setattr(fc, "_probe_endpoint", fake_probe)
        monkeypatch.setattr(fc, "_detect_proxies", lambda: {})

        fc.run_connectivity_check(timeout=1.0)

        # Wenn strict OK ist, darf kein relaxed (verify_tls=False) laufen.
        assert all(v is True for v in calls)

    def test_runs_relaxed_when_strict_fails(self, monkeypatch):
        seen: list[bool] = []

        def fake_probe(url, *, verify_tls, timeout=6.0):
            seen.append(verify_tls)
            return {"ok": verify_tls is False, "category": "tls_other", "errorReason": "x", "tlsVerified": verify_tls}

        monkeypatch.setattr(fc, "_probe_endpoint", fake_probe)
        monkeypatch.setattr(fc, "_detect_proxies", lambda: {})

        result = fc.run_connectivity_check(timeout=1.0)

        assert False in seen  # relaxed lief
        assert result["diagnosis"]["level"] == "warn"
