#!/usr/bin/env python3
"""MiniMaster Pre-Flight Check.

Prueft alle Voraussetzungen fuer eine erfolgreiche Inbetriebnahme an einer
Stelle und gibt fuer jeden fehlenden Punkt einen konkreten Fix-Befehl aus.

Exit-Code:
  0  alle Pflicht-Checks gruen
  1  mindestens ein Pflicht-Check rot

Optionale Flags:
  --json       JSON-Bericht statt Mensch-Text
  --strict     Auch Empfehlungen (WARN) zaehlen wie Fehler
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

REPO_ROOT = Path(__file__).resolve().parent.parent

PLACEHOLDER_TOKENS = ("your-", "your_project", "<your", "REPLACE_ME")


@dataclass
class CheckResult:
    check_id: str
    title: str
    status: str            # "ok" | "warn" | "fail"
    required: bool
    details: str
    fix_hint: str = ""


def _which(*candidates: str) -> str | None:
    for name in candidates:
        path = shutil.which(name)
        if path:
            return path
    return None


def _run(cmd: list[str], timeout: int = 10) -> tuple[int, str]:
    try:
        if cmd:
            resolved = shutil.which(cmd[0])
            if resolved:
                cmd = [resolved, *cmd[1:]]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return proc.returncode, (proc.stdout + proc.stderr).strip()
    except Exception as exc:
        return 1, str(exc)


# ---------------------------------------------------------------------------
# Einzelne Checks
# ---------------------------------------------------------------------------

def check_node() -> CheckResult:
    node = _which("node")
    if not node:
        return CheckResult(
            "tool-node", "Node.js >= 22", "fail", True,
            "node nicht im PATH gefunden.",
            "Node.js 22 installieren: https://nodejs.org/ oder via nvm 'nvm install 22'",
        )
    rc, out = _run(["node", "--version"])
    if rc != 0:
        return CheckResult("tool-node", "Node.js >= 22", "fail", True,
                           f"node --version fehlgeschlagen: {out}",
                           "Node 22 neu installieren.")
    match = re.match(r"v(\d+)\.(\d+)\.(\d+)", out.strip())
    if not match:
        return CheckResult("tool-node", "Node.js >= 22", "warn", True,
                           f"Unerwartete Version: {out}", "Pruefen: node --version")
    major = int(match.group(1))
    if major < 22:
        return CheckResult("tool-node", "Node.js >= 22", "fail", True,
                           f"node {out} ist zu alt (mind. v22).",
                           "Node 22 installieren (package.json fordert engines>=22).")
    return CheckResult("tool-node", "Node.js >= 22", "ok", True, f"node {out}")


def check_npm() -> CheckResult:
    if not _which("npm"):
        return CheckResult("tool-npm", "npm verfuegbar", "fail", True,
                           "npm nicht im PATH gefunden.",
                           "Mit Node.js installieren.")
    rc, out = _run(["npm", "--version"])
    return CheckResult("tool-npm", "npm verfuegbar",
                       "ok" if rc == 0 else "fail",
                       True,
                       f"npm {out}" if rc == 0 else f"Fehler: {out}",
                       "Mit Node.js installieren." if rc != 0 else "")


def check_python() -> CheckResult:
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        return CheckResult("tool-python", "Python >= 3.8", "fail", True,
                           f"Python {version.major}.{version.minor} zu alt.",
                           "Python 3.8+ installieren.")
    return CheckResult("tool-python", "Python >= 3.8", "ok", True,
                       f"Python {version.major}.{version.minor}.{version.micro}")


def check_firebase_cli() -> CheckResult:
    fb = _which("firebase")
    if not fb:
        return CheckResult("tool-firebase-cli", "Firebase CLI", "fail", True,
                           "firebase nicht im PATH gefunden.",
                           "Installieren: npm install -g firebase-tools")
    rc, out = _run(["firebase", "--version"])
    if rc != 0:
        return CheckResult("tool-firebase-cli", "Firebase CLI", "fail", True,
                           f"firebase --version fehlgeschlagen: {out}",
                           "Neu installieren: npm install -g firebase-tools")
    return CheckResult("tool-firebase-cli", "Firebase CLI", "ok", True,
                       f"firebase-tools {out}")


def check_firebase_login() -> CheckResult:
    if not _which("firebase"):
        return CheckResult("firebase-login", "Firebase CLI eingeloggt", "fail", True,
                           "firebase-CLI fehlt.", "Erst Firebase CLI installieren.")
    rc, out = _run(["firebase", "login:list"], timeout=15)
    if rc != 0:
        return CheckResult("firebase-login", "Firebase CLI eingeloggt", "fail", True,
                           f"login:list fehlgeschlagen: {out[:200]}",
                           "firebase login")
    if "No authorized accounts" in out or "No users" in out:
        return CheckResult("firebase-login", "Firebase CLI eingeloggt", "fail", True,
                           "Kein Firebase-Konto verknuepft.", "firebase login")
    return CheckResult("firebase-login", "Firebase CLI eingeloggt", "ok", True,
                       "Mindestens ein Konto verknuepft.")


def check_jdk() -> CheckResult:
    jdk = _which("java", "javac")
    if not jdk:
        return CheckResult("tool-jdk", "JDK 17 (fuer Android-Builds)", "warn", False,
                           "java nicht im PATH gefunden.",
                           "JDK 17 installieren (z.B. Temurin) – nur fuer Android-Builds noetig.")
    rc, out = _run(["java", "-version"], timeout=10)
    text = out
    match = re.search(r"version \"(\d+)(?:\.(\d+))?", text)
    if not match:
        return CheckResult("tool-jdk", "JDK 17 (fuer Android-Builds)", "warn", False,
                           "Java-Version konnte nicht erkannt werden.",
                           "Pruefen: java -version (JDK 17 empfohlen).")
    major = int(match.group(1))
    if major < 17:
        return CheckResult("tool-jdk", "JDK 17 (fuer Android-Builds)", "warn", False,
                           f"Java {major} aktiv (Android-Build erwartet 17).",
                           "JDK 17 installieren und JAVA_HOME setzen.")
    return CheckResult("tool-jdk", "JDK 17 (fuer Android-Builds)", "ok", False,
                       f"Java {major} aktiv.")


def check_node_modules() -> CheckResult:
    nm = REPO_ROOT / "node_modules"
    if not nm.is_dir():
        return CheckResult("repo-node-modules", "Backend-Dependencies installiert", "fail", True,
                           "node_modules/ fehlt.",
                           "Im Repo-Root: npm install")
    return CheckResult("repo-node-modules", "Backend-Dependencies installiert", "ok", True,
                       f"node_modules/ vorhanden ({sum(1 for _ in nm.iterdir())} Top-Level-Eintraege).")


def check_built_functions() -> CheckResult:
    lib = REPO_ROOT / "lib"
    if not (lib / "index.js").exists():
        return CheckResult("repo-build", "Cloud Functions kompiliert", "warn", False,
                           "lib/index.js fehlt – Backend wurde noch nicht gebaut.",
                           "Im Repo-Root: npm run build")
    return CheckResult("repo-build", "Cloud Functions kompiliert", "ok", False,
                       "lib/index.js vorhanden.")


def check_env_file() -> CheckResult:
    env = REPO_ROOT / ".env"
    if not env.exists():
        return CheckResult("config-env", ".env Datei vorhanden", "fail", True,
                           ".env fehlt im Repo-Root.",
                           "python -m scripts.setup_init  ODER  cp .env.example .env")
    text = env.read_text(encoding="utf-8", errors="replace")
    missing: list[str] = []
    optional_warn: list[str] = []
    required_keys = ("GEMINI_API_KEY",)
    recommended_keys = ("ADMIN_RECOVERY_TOKEN", "LEGAL_POLICY_BASE_URL", "PAIRING_LINK_BASE_URL")
    for key in required_keys:
        if not re.search(rf"^{key}=\S+", text, re.MULTILINE):
            missing.append(key)
    for key in recommended_keys:
        if not re.search(rf"^{key}=\S+", text, re.MULTILINE):
            optional_warn.append(key)
    if missing:
        return CheckResult("config-env", ".env Datei vorhanden", "fail", True,
                           f".env existiert, aber Pflicht-Variablen leer: {', '.join(missing)}",
                           "Werte ergaenzen oder Admin-Panel-Wizard ('Uebertragen'-Button) nutzen.")
    if optional_warn:
        return CheckResult("config-env", ".env Datei vorhanden", "warn", False,
                           f"Optionale Variablen leer: {', '.join(optional_warn)}",
                           "Vor Go-Live setzen (Recovery-Token, Legal-URLs).")
    return CheckResult("config-env", ".env Datei vorhanden", "ok", True,
                       "Pflichtvariablen gesetzt.")


def _has_placeholder(path: Path) -> bool:
    if not path.exists():
        return True
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return True
    return any(token in text for token in PLACEHOLDER_TOKENS)


def check_google_services_master() -> CheckResult:
    p = REPO_ROOT / "masterApp" / "google-services.json"
    if not p.exists():
        return CheckResult("config-gs-master", "masterApp/google-services.json", "fail", True,
                           "Datei fehlt (nur Template vorhanden).",
                           "Aus Firebase-Console fuer Package com.minimaster.masterapp herunterladen.")
    if _has_placeholder(p):
        return CheckResult("config-gs-master", "masterApp/google-services.json", "fail", True,
                           "Enthaelt Platzhalter-Werte.",
                           "Echte google-services.json aus Firebase-Console verwenden.")
    return CheckResult("config-gs-master", "masterApp/google-services.json", "ok", True,
                       "Datei vorhanden.")


def check_google_services_child() -> CheckResult:
    p = REPO_ROOT / "childApp" / "google-services.json"
    if not p.exists():
        return CheckResult("config-gs-child", "childApp/google-services.json", "fail", True,
                           "Datei fehlt (nur Template vorhanden).",
                           "Aus Firebase-Console fuer Package com.google.pairing herunterladen.")
    if _has_placeholder(p):
        return CheckResult("config-gs-child", "childApp/google-services.json", "fail", True,
                           "Enthaelt Platzhalter-Werte.",
                           "Echte google-services.json aus Firebase-Console verwenden.")
    return CheckResult("config-gs-child", "childApp/google-services.json", "ok", True,
                       "Datei vorhanden.")


def check_service_account() -> CheckResult:
    p = REPO_ROOT / "serviceAccountKey.json"
    if not p.exists():
        return CheckResult("config-service-account", "serviceAccountKey.json", "fail", True,
                           "Datei fehlt im Repo-Root.",
                           "Firebase-Console -> Projekteinstellungen -> Dienstkonten -> Neuen privaten Schluessel.")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:
        return CheckResult("config-service-account", "serviceAccountKey.json", "fail", True,
                           f"JSON nicht parsbar: {exc}",
                           "Datei neu generieren.")
    if data.get("type") != "service_account":
        return CheckResult("config-service-account", "serviceAccountKey.json", "fail", True,
                           "type != 'service_account'.",
                           "Korrekten Service-Account-Key herunterladen.")
    project_id = str(data.get("project_id") or "")
    if not project_id:
        return CheckResult("config-service-account", "serviceAccountKey.json", "fail", True,
                           "project_id fehlt.",
                           "Korrekten Service-Account-Key herunterladen.")
    return CheckResult("config-service-account", "serviceAccountKey.json", "ok", True,
                       f"OK (project_id={project_id}).")


def check_firebase_config_files() -> CheckResult:
    """Prueft, ob fuer alle 4 Panels eine produktive firebase-config.js existiert."""
    panels = ("admin-panel", "web-control", "parent-panel", "child-panel")
    missing: list[str] = []
    placeholders: list[str] = []
    for panel in panels:
        p = REPO_ROOT / panel / "firebase-config.js"
        if not p.exists():
            missing.append(panel)
            continue
        if _has_placeholder(p):
            placeholders.append(panel)
    if missing and len(missing) == len(panels):
        return CheckResult("config-firebase-panels", "Frontend Firebase-Konfiguration",
                           "fail", True,
                           "Kein Panel hat firebase-config.js.",
                           "Im Admin-Panel den 'Uebertragen'-Button klicken ODER "
                           "'python -m scripts.config_transfer_cli' ausfuehren.")
    problems = []
    if missing:
        problems.append(f"fehlt in: {', '.join(missing)}")
    if placeholders:
        problems.append(f"Platzhalter in: {', '.join(placeholders)}")
    if problems:
        return CheckResult("config-firebase-panels", "Frontend Firebase-Konfiguration",
                           "fail", True, "; ".join(problems),
                           "Im Admin-Panel den 'Uebertragen'-Button klicken (schreibt in alle 4 Panels).")
    return CheckResult("config-firebase-panels", "Frontend Firebase-Konfiguration",
                       "ok", True, "Alle 4 Panels haben echte Werte.")


def check_appcheck_site_key() -> CheckResult:
    """Prueft, ob ein reCAPTCHA-v3-Site-Key in .env hinterlegt ist."""
    env = REPO_ROOT / ".env"
    if not env.exists():
        return CheckResult("config-appcheck", "App Check Site Key", "warn", False,
                           ".env fehlt – kein App-Check-Key pruefbar.",
                           "Erst .env anlegen (python -m scripts.setup_init).")
    text = env.read_text(encoding="utf-8", errors="replace")
    match = re.search(r"^FIREBASE_APP_CHECK_SITE_KEY=(\S+)", text, re.MULTILINE)
    if not match:
        return CheckResult("config-appcheck", "App Check Site Key", "warn", False,
                           "FIREBASE_APP_CHECK_SITE_KEY nicht in .env gesetzt.",
                           "reCAPTCHA-v3 Site Key aus Firebase Console -> App Check.")
    return CheckResult("config-appcheck", "App Check Site Key", "ok", False,
                       "FIREBASE_APP_CHECK_SITE_KEY gesetzt.")


def _env_keys(text: str) -> set[str]:
    keys: set[str] = set()
    for raw in text.splitlines():
        match = re.match(r"^\s*([A-Z][A-Z0-9_]*)\s*=", raw)
        if match:
            keys.add(match.group(1))
    return keys


def check_env_schema_drift() -> CheckResult:
    """Meldet, wenn .env.example neue Schluessel hat, die in .env fehlen."""
    env = REPO_ROOT / ".env"
    example = REPO_ROOT / ".env.example"
    if not example.exists():
        return CheckResult("schema-env-drift", ".env Schema aktuell", "ok", False,
                           ".env.example fehlt – keine Drift-Pruefung moeglich.")
    if not env.exists():
        return CheckResult("schema-env-drift", ".env Schema aktuell", "ok", False,
                           ".env fehlt – wird beim Setup neu angelegt.")
    try:
        example_keys = _env_keys(example.read_text(encoding="utf-8"))
        env_keys = _env_keys(env.read_text(encoding="utf-8"))
    except Exception as exc:
        return CheckResult("schema-env-drift", ".env Schema aktuell", "warn", False,
                           f".env/.env.example nicht lesbar: {exc}", "")
    new_keys = sorted(example_keys - env_keys)
    if new_keys:
        # WICHTIG: Diese Liste hier nur als Hinweis, kein Pflichtfehler – der
        # eigentliche Wert-Check passiert in check_env_file().
        return CheckResult("schema-env-drift", ".env Schema aktuell", "warn", False,
                           f"Neue Variablen in .env.example seit Setup: {', '.join(new_keys)}",
                           "Im Admin-Panel/Wizard ergaenzen ODER manuell aus .env.example uebernehmen.")
    removed_keys = sorted(env_keys - example_keys)
    if removed_keys:
        return CheckResult("schema-env-drift", ".env Schema aktuell", "ok", False,
                           f"In .env vorhandene, aber nicht in .env.example beschriebene Keys: "
                           f"{', '.join(removed_keys)}")
    return CheckResult("schema-env-drift", ".env Schema aktuell", "ok", False,
                       f"{len(env_keys)} Schluessel synchron mit .env.example.")


def check_firebase_config_drift() -> CheckResult:
    """Vergleicht Panel-firebase-config.js gegen das Template auf Strukturebene."""
    template = REPO_ROOT / "admin-panel" / "firebase-config.template.js"
    if not template.exists():
        return CheckResult("schema-firebase-drift", "Firebase-Config Schema aktuell", "ok", False,
                           "Template fehlt – kein Vergleich moeglich.")
    template_fields = set(re.findall(r"\b([a-zA-Z]+)\s*:", template.read_text(encoding="utf-8")))
    panels = ("admin-panel", "web-control", "parent-panel", "child-panel")
    missing_fields: dict[str, list[str]] = {}
    for panel in panels:
        p = REPO_ROOT / panel / "firebase-config.js"
        if not p.exists():
            continue
        try:
            fields = set(re.findall(r"\b([a-zA-Z]+)\s*:", p.read_text(encoding="utf-8")))
        except Exception:
            continue
        diff = sorted(template_fields - fields)
        if diff:
            missing_fields[panel] = diff
    if not missing_fields:
        return CheckResult("schema-firebase-drift", "Firebase-Config Schema aktuell", "ok", False,
                           "Alle Panel-Configs decken die Template-Felder ab.")
    summary = "; ".join(f"{panel}: {', '.join(fields)}" for panel, fields in missing_fields.items())
    return CheckResult("schema-firebase-drift", "Firebase-Config Schema aktuell", "warn", False,
                       f"Template-Felder fehlen: {summary}",
                       "Im Admin-Panel 'Uebertragen' erneut ausfuehren (rendert aus aktuellem Template).")


def check_firebaserc() -> CheckResult:
    rc_file = REPO_ROOT / ".firebaserc"
    if not rc_file.exists():
        return CheckResult("config-firebaserc", ".firebaserc gebunden", "fail", True,
                           ".firebaserc fehlt.",
                           "firebase use --add")
    try:
        data = json.loads(rc_file.read_text(encoding="utf-8"))
    except Exception as exc:
        return CheckResult("config-firebaserc", ".firebaserc gebunden", "fail", True,
                           f"JSON nicht parsbar: {exc}", "firebase use --add")
    default_project = data.get("projects", {}).get("default", "")
    if not default_project:
        return CheckResult("config-firebaserc", ".firebaserc gebunden", "fail", True,
                           "Kein 'default'-Projekt definiert.", "firebase use --add")
    return CheckResult("config-firebaserc", ".firebaserc gebunden", "ok", True,
                       f"Default-Projekt: {default_project}")


CHECKS: tuple[Callable[[], CheckResult], ...] = (
    check_node,
    check_npm,
    check_python,
    check_firebase_cli,
    check_firebase_login,
    check_jdk,
    check_node_modules,
    check_built_functions,
    check_env_file,
    check_env_schema_drift,
    check_google_services_master,
    check_google_services_child,
    check_service_account,
    check_firebase_config_files,
    check_firebase_config_drift,
    check_appcheck_site_key,
    check_firebaserc,
)


# ---------------------------------------------------------------------------
# Ausgabe
# ---------------------------------------------------------------------------

STATUS_SYMBOL = {"ok": "[OK] ", "warn": "[WARN]", "fail": "[FAIL]"}


def render_human(results: list[CheckResult], strict: bool) -> str:
    lines: list[str] = []
    lines.append("=" * 72)
    lines.append("MiniMaster Pre-Flight Check")
    lines.append("=" * 72)
    for r in results:
        marker = STATUS_SYMBOL.get(r.status, "[?]   ")
        req = " *" if r.required else "  "
        lines.append(f"{marker}{req} {r.title}")
        lines.append(f"        -> {r.details}")
        if r.fix_hint and r.status != "ok":
            lines.append(f"        Fix: {r.fix_hint}")
    lines.append("-" * 72)
    fails = [r for r in results if r.status == "fail"]
    warns = [r for r in results if r.status == "warn"]
    req_fails = [r for r in fails if r.required]
    lines.append(
        f"Ergebnis: {len(req_fails)} Pflicht-Fehler, "
        f"{len(fails) - len(req_fails)} optional-Fehler, "
        f"{len(warns)} Warnungen, "
        f"{sum(1 for r in results if r.status == 'ok')} ok."
    )
    if strict and warns:
        lines.append("STRICT-Modus: Warnungen zaehlen als Fehler.")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Pre-Flight Check")
    parser.add_argument("--json", action="store_true", help="JSON-Bericht statt Text.")
    parser.add_argument("--strict", action="store_true",
                        help="Warnungen zaehlen als Fehler.")
    args = parser.parse_args()

    results = [check() for check in CHECKS]

    if args.json:
        report = {
            "results": [asdict(r) for r in results],
            "summary": {
                "total": len(results),
                "ok": sum(1 for r in results if r.status == "ok"),
                "warn": sum(1 for r in results if r.status == "warn"),
                "fail": sum(1 for r in results if r.status == "fail"),
                "requiredFail": sum(1 for r in results if r.status == "fail" and r.required),
            },
        }
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(render_human(results, args.strict))

    required_fail = any(r.status == "fail" and r.required for r in results)
    warns_count_as_error = args.strict and any(r.status == "warn" for r in results)
    return 1 if required_fail or warns_count_as_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
