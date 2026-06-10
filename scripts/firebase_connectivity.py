#!/usr/bin/env python3
"""Firebase-Connectivity-Self-Test.

Prueft die Erreichbarkeit aller Firebase-Endpoints, die das Admin-Panel und
die Apps zur Laufzeit brauchen – aus zwei Perspektiven:

  1. Mit System-TLS-Stack (Windows schannel / OS-CAs + CRL-Pruefung).
     Wenn das fehlschlaegt, scheitert auch der Browser typischerweise.
  2. Mit deaktivierter CRL-/Hostname-Pruefung (``verify=False``-Aequivalent).
     Wenn das funktioniert, aber Schritt 1 nicht, ist das Problem die
     CRL-Pruefung – meist Antivirus mit SSL-Inspection oder Firewall, die
     ``ocsp.pki.goog`` blockt.

Wird vom Admin-Panel-Login-Button "Verbindung testen" via ``GET
/api/tools/firebase-connectivity`` aufgerufen.

CLI:
  python -m scripts.firebase_connectivity check
  python -m scripts.firebase_connectivity check --json
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable

_REPO_ROOT = Path(__file__).resolve().parent.parent
_ENV_FILE = _REPO_ROOT / ".env"


def _read_env_value(key: str) -> str:
    """Liest einen .env-Wert ohne Dependency auf python-dotenv."""
    if not _ENV_FILE.exists():
        return ""
    for raw in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if "=" not in raw:
            continue
        k, _, v = raw.partition("=")
        if k.strip() == key:
            value = v.strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            return value
    return ""


# Endpoints, die Browser-/Backend-Clients zur Laufzeit ansprechen. URL-Pfade
# sind so gewaehlt, dass sie eine 200/400/401-Antwort liefern (also der
# Server *antwortet*) – wir wollen Konnektivitaet pruefen, nicht Auth.
DEFAULT_ENDPOINTS: list[dict[str, str]] = [
    {
        "id": "identitytoolkit",
        "name": "Firebase Auth (Identity Toolkit)",
        "url": "https://identitytoolkit.googleapis.com/v1/projects",
        "purpose": "E-Mail-Login, Token-Validierung. Pflicht fuer Admin-Panel.",
    },
    {
        "id": "securetoken",
        "name": "Secure Token Service",
        "url": "https://securetoken.googleapis.com/",
        "purpose": "ID-Token-Refresh nach Login. Pflicht – sonst fliegen Sessions nach ~1h.",
    },
    {
        "id": "firestore",
        "name": "Firestore (Datenbank)",
        "url": "https://firestore.googleapis.com/",
        "purpose": "Operator-Profile, Pairing-Codes, Geraete-State.",
    },
    {
        "id": "storage",
        "name": "Cloud Storage",
        "url": "https://firebasestorage.googleapis.com/",
        "purpose": "Datei-Uploads, Snapshot-Backups.",
    },
    {
        "id": "fcm",
        "name": "Firebase Cloud Messaging",
        "url": "https://fcm.googleapis.com/",
        "purpose": "Push-Nachrichten an Master-/Child-Apps.",
    },
    {
        "id": "ocsp_google",
        "name": "Google Certificate-Status (OCSP)",
        "url": "https://ocsp.pki.goog/",
        "purpose": (
            "Hier scheitert es bei Antivirus mit SSL-Inspection. "
            "Wenn dieser Endpoint blockiert ist, schlaegt Auth mit "
            "CRYPT_E_NO_REVOCATION_CHECK fehl."
        ),
    },
]


def _probe_endpoint(url: str, *, verify_tls: bool, timeout: float = 6.0) -> dict[str, object]:
    """Macht einen einzelnen HEAD/GET-Probe und meldet Status + TLS-Detail."""
    start = time.monotonic()
    ctx = ssl.create_default_context()
    if not verify_tls:
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, method="GET",
                                 headers={"User-Agent": "MiniMaster-Connectivity-Probe/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            status_code = resp.status
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return {
                "ok": True,
                "statusCode": status_code,
                "elapsedMs": elapsed_ms,
                "tlsVerified": verify_tls,
            }
    except urllib.error.HTTPError as exc:
        # 4xx/5xx ist KEIN Connectivity-Fehler – Server antwortet.
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "ok": True,
            "statusCode": exc.code,
            "elapsedMs": elapsed_ms,
            "tlsVerified": verify_tls,
            "note": f"Server antwortet mit {exc.code} (Endpoint-Konnektivitaet OK).",
        }
    except urllib.error.URLError as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        reason = exc.reason
        reason_text = str(reason) if reason is not None else "URLError"
        category = _categorize_url_error(reason_text)
        return {
            "ok": False,
            "elapsedMs": elapsed_ms,
            "tlsVerified": verify_tls,
            "errorClass": "URLError",
            "errorReason": reason_text[:300],
            "category": category,
        }
    except socket.timeout:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "ok": False,
            "elapsedMs": elapsed_ms,
            "tlsVerified": verify_tls,
            "errorClass": "Timeout",
            "errorReason": f"Keine Antwort nach {timeout}s.",
            "category": "timeout",
        }
    except Exception as exc:  # pragma: no cover - defensive
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "ok": False,
            "elapsedMs": elapsed_ms,
            "tlsVerified": verify_tls,
            "errorClass": exc.__class__.__name__,
            "errorReason": str(exc)[:300],
            "category": "unknown",
        }


def _categorize_url_error(reason: str) -> str:
    """Kategorisiert einen URLError-Reason in eine handelbare Klasse."""
    lower = reason.lower()
    if "revocation" in lower or "crl" in lower or "ocsp" in lower:
        return "tls_revocation_check_failed"
    if "certificate verify failed" in lower or "cert_authority_invalid" in lower:
        return "tls_cert_invalid"
    if "self-signed" in lower or "self signed" in lower:
        return "tls_self_signed"
    if "ssl" in lower or "tls" in lower or "wrong_version_number" in lower:
        return "tls_other"
    if "name or service not known" in lower or "getaddrinfo failed" in lower or "nodename nor servname" in lower:
        return "dns_failed"
    if "connection refused" in lower:
        return "connection_refused"
    if "timed out" in lower or "timeout" in lower:
        return "timeout"
    if "network is unreachable" in lower or "no route" in lower:
        return "no_route"
    return "other"


def _summarize_diagnosis(
    results: list[dict[str, object]], *, proxies: dict[str, str] | None = None
) -> dict[str, object]:
    """Baut aus den Probe-Ergebnissen eine handlungsfaehige Diagnose."""
    proxies = proxies or {}
    strict_failures: list[dict[str, object]] = []
    relaxed_successes: list[str] = []
    full_failures: list[str] = []
    full_failure_categories: set[str] = set()
    crl_issue = False

    for entry in results:
        strict = entry.get("strict") or {}
        relaxed = entry.get("relaxed") or {}
        if not strict.get("ok"):
            strict_failures.append({
                "endpointId": entry["id"],
                "category": strict.get("category"),
                "reason": strict.get("errorReason"),
            })
            if relaxed.get("ok"):
                relaxed_successes.append(str(entry["id"]))
            else:
                full_failures.append(str(entry["id"]))
                full_failure_categories.add(str(relaxed.get("category") or strict.get("category") or "other"))
            if strict.get("category") == "tls_revocation_check_failed":
                crl_issue = True

    if not strict_failures:
        return {
            "level": "ok",
            "headline": "✓ Alle Endpoints erreichbar (TLS strict).",
            "hints": [],
        }

    hints: list[str] = []
    if crl_issue or (relaxed_successes and not full_failures):
        hints.append(
            "TLS-Zertifikats-Sperrpruefung scheitert. Wahrscheinlichste Ursache: "
            "Antivirus mit SSL-Inspection (Kaspersky, Avast, Norton, Sophos, "
            "Bitdefender). Testweise SSL-Scanning deaktivieren oder Ausnahme fuer "
            "*.googleapis.com einrichten."
        )
        hints.append(
            "Alternativ Windows-Root-Zertifikate aktualisieren: "
            "'certutil -generateSSTFromWU roots.sst && certutil -addstore -f root roots.sst' "
            "(als Administrator)."
        )
        level = "warn"
        headline = (
            f"⚠ TLS-Strict scheitert bei {len(strict_failures)} Endpoint(s), "
            "ohne CRL-Pruefung erreichbar. Vermutlich Antivirus / SSL-Inspection."
        )
    elif full_failures:
        connection_like = {"connection_refused", "no_route", "dns_failed", "timeout", "other"}
        if full_failure_categories & connection_like:
            if proxies:
                proxy_desc = ", ".join(f"{k}={v}" for k, v in sorted(proxies.items()))
                hints.append(
                    f"Python nutzt diese Proxys: {proxy_desc}. Wenn der Browser ohne "
                    "Proxy funktioniert oder einen anderen nutzt, stimmt die Python-"
                    "Proxy-Konfiguration nicht – HTTP(S)_PROXY pruefen/anpassen."
                )
            else:
                hints.append(
                    "Python sieht KEINEN Proxy, der Browser kommt aber durch. Sehr "
                    "wahrscheinlich ein System-/PAC-Auto-Config-Proxy, den Pythons "
                    "urllib nicht auswertet. Loesung: 'HTTPS_PROXY' (und 'HTTP_PROXY') "
                    "auf den Unternehmens-Proxy setzen, dann den Admin-Server neu starten."
                )
        hints.append(
            "Sonst: Internetverbindung, Firewall und DNS-Aufloesung pruefen."
        )
        level = "error"
        headline = f"✗ {len(full_failures)} Endpoint(s) komplett unerreichbar."
    else:
        level = "warn"
        headline = (
            f"⚠ {len(strict_failures)} Endpoint(s) mit Fehler – Details unten."
        )

    return {
        "level": level,
        "headline": headline,
        "hints": hints,
        "strictFailures": strict_failures,
        "relaxedSuccesses": relaxed_successes,
        "fullFailures": full_failures,
    }


def _detect_proxies() -> dict[str, str]:
    """Proxies, die Pythons urllib tatsaechlich verwenden wuerde.

    Liest Umgebungsvariablen (HTTP(S)_PROXY) und – auf Windows – die WinINET-/
    Registry-Einstellungen (dieselben, die ein manuell gesetzter System-Proxy
    nutzt). PAC-/Auto-Config-Skripte werden von urllib NICHT ausgewertet; in
    dem Fall ist diese Map leer, obwohl der Browser einen Proxy nutzt.
    """
    try:
        return {str(k): str(v) for k, v in urllib.request.getproxies().items()}
    except Exception:  # pragma: no cover - defensive
        return {}


def _probe_endpoint_both(endpoint: dict[str, str], timeout: float) -> dict[str, object]:
    """Strict-Probe und – nur bei Fehler – Relaxed-Probe fuer einen Endpoint."""
    strict = _probe_endpoint(endpoint["url"], verify_tls=True, timeout=timeout)
    if strict.get("ok"):
        relaxed: dict[str, object] = {"ok": True, "skipped": True}
    else:
        relaxed = _probe_endpoint(endpoint["url"], verify_tls=False, timeout=timeout)
    return {
        "id": endpoint["id"],
        "name": endpoint["name"],
        "url": endpoint["url"],
        "purpose": endpoint["purpose"],
        "strict": strict,
        "relaxed": relaxed,
    }


def run_connectivity_check(*, timeout: float = 6.0) -> dict[str, object]:
    """Fuehrt alle Endpoints (strict + relaxed) NEBENLAEUFIG aus und summarisiert.

    Nebenlaeufig, damit der Aufruf auch dann in ~timeout Sekunden zurueckkehrt,
    wenn mehrere Endpoints scheitern. Sequenziell waeren es bei 6 Endpoints bis
    zu 6 * 2 * timeout Sekunden – lange genug, dass der Browser-Fetch im Admin-
    Panel mit "Failed to fetch" abbricht und nur ein "Server-Routing-Problem"
    anzeigt, statt der echten Diagnose.
    """
    proxies = _detect_proxies()
    results: list[dict[str, object]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(DEFAULT_ENDPOINTS)) as pool:
        futures = {
            pool.submit(_probe_endpoint_both, endpoint, timeout): endpoint
            for endpoint in DEFAULT_ENDPOINTS
        }
        by_id: dict[str, dict[str, object]] = {}
        for future in concurrent.futures.as_completed(futures):
            entry = future.result()
            by_id[str(entry["id"])] = entry
        # Reihenfolge der DEFAULT_ENDPOINTS beibehalten (deterministische Anzeige).
        results = [by_id[str(ep["id"])] for ep in DEFAULT_ENDPOINTS if str(ep["id"]) in by_id]

    diagnosis = _summarize_diagnosis(results, proxies=proxies)
    return {
        "diagnosis": diagnosis,
        "endpoints": results,
        "proxies": proxies,
        "projectId": _read_env_value("FIREBASE_PROJECT_ID"),
        "platform": sys.platform,
        "tlsBackend": "openssl (python urllib)",
        "note": (
            "Dieser Test laeuft im Python-Admin-Server (urllib + OpenSSL). "
            "Der Browser-Test im UI ergaenzt diesen mit dem tatsaechlichen "
            "Browser-TLS-Stack (relevant fuer Auth-Aufrufe)."
        ),
    }


# ─── CLI ──────────────────────────────────────────────────────────────

def _ascii_safe(text: str) -> str:
    """Ersetzt Unicode-Marker durch ASCII, damit Windows-cp1252-Konsolen klappen."""
    return (text or "").replace("✓", "[OK]").replace("✗", "[FAIL]").replace("⚠", "[WARN]")


def _cmd_check(args: argparse.Namespace) -> int:
    result = run_connectivity_check(timeout=args.timeout)
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        diag = result["diagnosis"]  # type: ignore
        print(_ascii_safe(str(diag.get("headline", ""))))
        for hint in diag.get("hints", []):
            print(_ascii_safe(f"  - {hint}"))
        print()
        for ep in result["endpoints"]:  # type: ignore
            strict = ep.get("strict") or {}
            mark = "OK  " if strict.get("ok") else "FAIL"
            status = strict.get("statusCode") or strict.get("errorReason", "")
            print(_ascii_safe(f"  [{mark}] {ep['name']:38s} {str(status)[:50]}"))
    return 0 if result["diagnosis"]["level"] == "ok" else 1  # type: ignore


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Firebase-Connectivity-Self-Test")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_check = sub.add_parser("check", help="Konnektivitaet aller Firebase-Endpoints pruefen")
    p_check.add_argument("--timeout", type=float, default=6.0)
    p_check.add_argument("--json", action="store_true")
    p_check.set_defaults(func=_cmd_check)
    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
