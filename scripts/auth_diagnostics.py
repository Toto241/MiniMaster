#!/usr/bin/env python3
"""Firebase-Auth-Diagnose-Helfer.

Ruft Identity Toolkit aus dem Python-Backend an (gleiche Endpoints wie der
Browser, aber mit Python OpenSSL-TLS-Stack der bei Antivirus/SSL-Inspection
nicht betroffen ist) und decodiert die exakten Server-Fehler in handlungs-
faehige Diagnosen.

Hauptfunktion:
  diagnose_login_failure(api_key, email?, password?) -> dict

Workflow:
  1. „Probe": signInWithPassword mit einer nicht-existenten Test-Mail wird
     aufgerufen. Identity Toolkit antwortet je nach Projekt-Setup mit einem
     spezifischen Fehler-Code, der uns sagt: ist der API-Key gueltig, ist
     Email/Password aktiviert, hat der Key Referrer-Restrictions usw.
  2. Wenn der User echte Credentials mitgibt: zweiter Aufruf mit den echten
     Werten – wir sehen dann den eigentlichen Login-Fehler.
  3. Kategorisierung in:
       - apiKeyValid: bool
       - emailPasswordProviderEnabled: bool | None  (None = unbestimmbar)
       - loginAttempt: { success, errorCode, errorMessage }
       - recommendedActions: list[str]

CLI:
  python -m scripts.auth_diagnostics probe
  python -m scripts.auth_diagnostics probe --email a@b.de --password secret
  python -m scripts.auth_diagnostics probe --api-key AIza...
"""
from __future__ import annotations

import argparse
import json
import os
import re
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
    if not _ENV_FILE.exists():
        return ""
    for raw in _ENV_FILE.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if "=" not in raw:
            continue
        k, _, v = raw.partition("=")
        if k.strip() != key:
            continue
        value = v.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        return value
    return ""


# Nicht-existente Test-Adresse + offensichtlich falsches Passwort. Identity
# Toolkit antwortet ohne Account-Anlage – wir sehen nur den Auth-Pfad.
_PROBE_EMAIL = "minimaster-diagnostic-probe-nonexistent@example.invalid"
_PROBE_PASSWORD = "diagnostic-probe-will-fail-by-design"


# Mapping ITK-Fehler-Code -> (Kategorie, lesbare Erklaerung, Fix).
# Quelle: https://firebase.google.com/docs/reference/rest/auth
_ERROR_CATALOG: dict[str, dict[str, str]] = {
    "EMAIL_NOT_FOUND": {
        "category": "provider_ok",
        "explanation": "Account existiert nicht. Aber: API-Key gueltig und Email/Password-Provider ist aktiv.",
        "fix": "Operator-Konto in Firebase Auth anlegen (Console -> Authentication -> Users) oder via 'Konto erstellen' im Onboarding.",
    },
    "INVALID_LOGIN_CREDENTIALS": {
        "category": "provider_ok_credentials_invalid",
        "explanation": "Email oder Passwort falsch. API-Key und Provider sind aktiv (Identity Toolkit fasst aus Sicherheitsgruenden 'Email unbekannt' und 'Passwort falsch' zusammen).",
        "fix": "Passwort pruefen, ggf. ueber 'Passwort vergessen?' zuruecksetzen. Oder Konto erst in Firebase anlegen.",
    },
    "INVALID_PASSWORD": {
        "category": "provider_ok_password_wrong",
        "explanation": "Account existiert, Passwort ist falsch. (Bei aelteren Projekten ohne Email-Enumeration-Protection.)",
        "fix": "Passwort pruefen oder 'Passwort vergessen?' verwenden.",
    },
    "USER_DISABLED": {
        "category": "user_disabled",
        "explanation": "Das Konto ist in Firebase Auth deaktiviert.",
        "fix": "Firebase-Console -> Authentication -> Users -> Konto -> Re-Enable.",
    },
    "OPERATION_NOT_ALLOWED": {
        "category": "provider_disabled",
        "explanation": "Email/Password-Anmeldemethode ist im Firebase-Projekt nicht aktiviert.",
        "fix": "Firebase-Console -> Authentication -> Sign-in method -> 'Email/Password' aktivieren.",
    },
    "TOO_MANY_ATTEMPTS_TRY_LATER": {
        "category": "rate_limited",
        "explanation": "Zu viele fehlerhafte Login-Versuche von dieser IP. Firebase blockt temporaer.",
        "fix": "Kurz warten oder Passwort-Reset durchfuehren.",
    },
    "API_KEY_HTTP_REFERRER_BLOCKED": {
        "category": "api_key_referrer_blocked",
        "explanation": "Der API-Key hat 'HTTP referrers'-Restrictions, und 127.0.0.1/localhost ist nicht in der erlaubten Liste.",
        "fix": "Google Cloud Console -> APIs & Services -> Credentials -> den API-Key bearbeiten -> 'Application restrictions' entweder 'None' (Test) oder 127.0.0.1/* in HTTP referrers.",
    },
    "API_KEY_IP_ADDRESS_BLOCKED": {
        "category": "api_key_ip_blocked",
        "explanation": "Der API-Key hat 'IP addresses'-Restrictions, und deine Public-IP ist nicht erlaubt.",
        "fix": "Cloud Console -> Credentials -> API-Key -> 'Application restrictions' -> IP-Liste anpassen oder auf 'None' setzen.",
    },
    "API_KEY_SERVICE_BLOCKED": {
        "category": "api_key_service_blocked",
        "explanation": "Der API-Key ist via 'API restrictions' nur fuer bestimmte APIs freigegeben, Identity Toolkit ist nicht dabei.",
        "fix": "Cloud Console -> Credentials -> API-Key -> 'API restrictions' -> 'Identity Toolkit API' hinzufuegen oder auf 'Don't restrict key' setzen.",
    },
    "INVALID_API_KEY": {
        "category": "api_key_invalid",
        "explanation": "Der API-Key existiert nicht oder ist deaktiviert.",
        "fix": "FIREBASE_API_KEY in .env pruefen. Korrekter Wert: Firebase-Console -> Project Settings -> 'Your apps' -> Web-App -> Config.",
    },
    "CONFIGURATION_NOT_FOUND": {
        "category": "project_misconfigured",
        "explanation": "Identity Toolkit findet das Projekt nicht. Meist: Project-ID falsch, oder Auth wurde im Projekt noch nie initialisiert.",
        "fix": "FIREBASE_PROJECT_ID in .env pruefen. In Firebase-Console mindestens einmal Authentication -> Get started klicken.",
    },
    "ADMIN_ONLY_OPERATION": {
        "category": "admin_required",
        "explanation": "Diese Operation ist nur Admins erlaubt (z.B. wenn Email-Enumeration-Protection 'strict' steht).",
        "fix": "Firebase-Console -> Authentication -> Settings -> 'Email enumeration protection' -> ggf. lockern oder Account direkt anlegen.",
    },
}


def _probe_signin(api_key: str, email: str, password: str, *, timeout: float = 8.0) -> dict[str, object]:
    """Macht einen einzelnen signInWithPassword-Aufruf.

    Liefert immer ein dict – auch im Fehlerfall werden Status-Code und Error-Body
    durchgereicht, damit der Diagnose-Algorithmus das auswerten kann.
    """
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={api_key}"
    body = json.dumps({
        "email": email,
        "password": password,
        "returnSecureToken": True,
    }).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={
            "Content-Type": "application/json",
            "User-Agent": "MiniMaster-Auth-Diagnostics/1.0",
        },
    )
    ctx = ssl.create_default_context()
    start = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elapsed_ms = int((time.monotonic() - start) * 1000)
            return {
                "httpStatus": resp.status,
                "elapsedMs": elapsed_ms,
                "success": True,
                "raw": data,
            }
    except urllib.error.HTTPError as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        body_text = ""
        try:
            body_text = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        try:
            body_json = json.loads(body_text) if body_text else {}
        except Exception:
            body_json = {}
        # Identity Toolkit-Fehler-Code extrahieren
        error_code = ""
        error_message = ""
        if isinstance(body_json, dict):
            err = body_json.get("error") or {}
            if isinstance(err, dict):
                error_message = str(err.get("message") or "")
                # 'message' enthaelt meist den Code, z.B. "OPERATION_NOT_ALLOWED"
                # oder "API_KEY_HTTP_REFERRER_BLOCKED: ..."
                match = re.match(r"^([A-Z_]+)", error_message)
                if match:
                    error_code = match.group(1)
        return {
            "httpStatus": exc.code,
            "elapsedMs": elapsed_ms,
            "success": False,
            "errorCode": error_code,
            "errorMessage": error_message,
            "rawBody": body_text[:600],
        }
    except urllib.error.URLError as exc:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "httpStatus": 0,
            "elapsedMs": elapsed_ms,
            "success": False,
            "errorCode": "NETWORK_ERROR",
            "errorMessage": f"Backend-Konnektivitaet fehlgeschlagen: {exc.reason}",
        }
    except Exception as exc:  # pragma: no cover - defensive
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "httpStatus": 0,
            "elapsedMs": elapsed_ms,
            "success": False,
            "errorCode": "UNEXPECTED_ERROR",
            "errorMessage": str(exc)[:300],
        }


def _categorize(probe_result: dict[str, object]) -> dict[str, object]:
    """Aus Probe-Ergebnis -> Kategorie + Erklaerung + Fix."""
    if probe_result.get("success"):
        return {
            "category": "login_succeeded",
            "explanation": "Login erfolgreich. Es gibt aktuell kein Auth-Problem.",
            "fix": "",
        }
    code = str(probe_result.get("errorCode") or "")
    if not code:
        return {
            "category": "unknown",
            "explanation": (
                "Identity Toolkit antwortet mit HTTP "
                f"{probe_result.get('httpStatus')}, aber ohne erkennbaren Fehler-Code."
            ),
            "fix": "Body manuell pruefen: " + str(probe_result.get("rawBody", ""))[:200],
        }
    if code in _ERROR_CATALOG:
        info = _ERROR_CATALOG[code]
        return {
            "category": info["category"],
            "code": code,
            "explanation": info["explanation"],
            "fix": info["fix"],
        }
    # Praefix-Fallback: API_KEY_* etc.
    for prefix in ("API_KEY_", ):
        if code.startswith(prefix):
            return {
                "category": "api_key_other",
                "code": code,
                "explanation": (
                    f"API-Key-Restriction-Fehler: {code}. "
                    "Pruefe die Application restrictions des API-Keys."
                ),
                "fix": "Cloud Console -> Credentials -> API-Key bearbeiten -> Application restrictions auf 'None' fuer Test, fuer Production gezielt setzen.",
            }
    return {
        "category": "other",
        "code": code,
        "explanation": f"Unbekannter Identity-Toolkit-Code: {code}. Rohnachricht: {probe_result.get('errorMessage', '')}",
        "fix": "Suche nach diesem Code in der Firebase-Auth-REST-API-Doku oder Issue auf StackOverflow.",
    }


def diagnose_login_failure(
    api_key: str = "",
    email: str = "",
    password: str = "",
) -> dict[str, object]:
    """Hauptfunktion: macht 1-2 ITK-Probes und liefert strukturierte Diagnose."""
    api_key = (api_key or _read_env_value("FIREBASE_API_KEY")).strip()
    project_id = _read_env_value("FIREBASE_PROJECT_ID")

    if not api_key:
        return {
            "ok": False,
            "error": "missing_api_key",
            "headline": "FIREBASE_API_KEY ist leer.",
            "fix": "API-Key in .env eintragen oder ueber den Setup-Wizard uebernehmen.",
        }

    # Step 1: API-Key-Probe mit Dummy-Credentials
    probe = _probe_signin(api_key, _PROBE_EMAIL, _PROBE_PASSWORD)
    probe_diag = _categorize(probe)

    api_key_valid = probe_diag["category"] not in (
        "api_key_invalid", "api_key_referrer_blocked", "api_key_ip_blocked",
        "api_key_service_blocked", "api_key_other", "project_misconfigured",
    )
    email_password_enabled = None
    if probe_diag["category"] == "provider_disabled":
        email_password_enabled = False
    elif probe_diag["category"] in (
        "provider_ok", "provider_ok_credentials_invalid", "provider_ok_password_wrong",
        "user_disabled", "rate_limited", "admin_required", "login_succeeded",
    ):
        email_password_enabled = True

    # Step 2: Echter Login-Versuch falls Credentials da
    login_attempt = None
    login_diag = None
    if email and password and api_key_valid and email_password_enabled is not False:
        login_attempt = _probe_signin(api_key, email, password)
        login_diag = _categorize(login_attempt)

    # Aufbau der Empfehlungs-Liste
    actions: list[str] = []
    if probe_diag.get("fix"):
        actions.append(f"[Probe-Befund] {probe_diag['fix']}")
    if login_diag and login_diag.get("fix"):
        actions.append(f"[Login-Befund] {login_diag['fix']}")

    # Headline-Logik
    if login_diag and login_diag["category"] == "login_succeeded":
        headline = "✓ Backend-Login mit den eingegebenen Credentials erfolgreich. "\
                   "Der Browser-Fehler 'auth/network-request-failed' kommt also NICHT "\
                   "von der Auth-API, sondern von einem Browser-spezifischen Problem "\
                   "(Extension, Antivirus, App Check)."
        level = "warn"
    elif probe_diag["category"] == "provider_disabled":
        headline = "✗ Email/Password-Provider ist im Firebase-Projekt deaktiviert."
        level = "error"
    elif probe_diag["category"] in ("api_key_invalid", "api_key_referrer_blocked",
                                     "api_key_ip_blocked", "api_key_service_blocked",
                                     "api_key_other"):
        headline = f"✗ API-Key-Problem: {probe_diag['category']}."
        level = "error"
    elif probe_diag["category"] == "project_misconfigured":
        headline = "✗ Firebase-Projekt nicht erreichbar oder Auth nicht initialisiert."
        level = "error"
    elif login_diag and login_diag["category"] in ("provider_ok_credentials_invalid",
                                                    "provider_ok_password_wrong"):
        headline = "✗ Falsche Credentials. Backend bestaetigt: Konto/Passwort stimmt nicht. " \
                   "Der Browser-Fehler 'network-request-failed' ist hier vermutlich nur " \
                   "die SDK-Uebersetzung dieses Auth-Fehlers."
        level = "warn"
    elif probe_diag["category"] in ("provider_ok", "provider_ok_credentials_invalid"):
        headline = ("✓ API-Key und Email/Password-Provider sind in Ordnung "
                    "(Backend-Probe erfolgreich). Login-Problem hat eine andere Ursache.")
        level = "warn"
    else:
        headline = f"⚠ Diagnose unklar. Probe-Kategorie: {probe_diag['category']}."
        level = "warn"

    return {
        "ok": True,
        "level": level,
        "headline": headline,
        "projectId": project_id,
        "apiKeyValid": api_key_valid,
        "emailPasswordProviderEnabled": email_password_enabled,
        "probe": {
            "result": probe,
            "diagnosis": probe_diag,
        },
        "loginAttempt": (
            {"result": login_attempt, "diagnosis": login_diag}
            if login_attempt is not None else None
        ),
        "recommendedActions": actions,
    }


# ─── CLI ──────────────────────────────────────────────────────────────

def _ascii_safe(text: str) -> str:
    return (text or "").replace("✓", "[OK]").replace("✗", "[FAIL]").replace("⚠", "[WARN]")


def _cmd_probe(args: argparse.Namespace) -> int:
    result = diagnose_login_failure(
        api_key=args.api_key or "",
        email=args.email or "",
        password=args.password or "",
    )
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(_ascii_safe(str(result.get("headline", ""))))
        print()
        print(f"API-Key gueltig:           {result.get('apiKeyValid')}")
        print(f"Email/Password aktiviert:  {result.get('emailPasswordProviderEnabled')}")
        probe = (result.get("probe") or {}).get("diagnosis") or {}
        print(f"Probe-Kategorie:           {probe.get('category')}")
        if probe.get("code"):
            print(f"Probe-Code:                {probe.get('code')}")
        print(f"Probe-Erklaerung:          {probe.get('explanation', '')}")
        login = result.get("loginAttempt") or {}
        ldiag = (login.get("diagnosis") or {}) if isinstance(login, dict) else {}
        if ldiag:
            print()
            print(f"Login-Kategorie:           {ldiag.get('category')}")
            if ldiag.get("code"):
                print(f"Login-Code:                {ldiag.get('code')}")
            print(f"Login-Erklaerung:          {ldiag.get('explanation', '')}")
        actions = result.get("recommendedActions") or []
        if actions:
            print("\nEmpfohlene Aktionen:")
            for a in actions:
                print(f"  - {_ascii_safe(a)}")
    return 0 if result.get("level") != "error" else 1


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Firebase-Auth-Diagnose")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe", help="Backend-Probe gegen Identity Toolkit")
    p.add_argument("--api-key", help="API-Key (sonst aus .env)")
    p.add_argument("--email", help="Optional: echte Login-Email fuer zweiten Probe-Aufruf")
    p.add_argument("--password", help="Optional: echtes Passwort")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=_cmd_probe)
    args = parser.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
