#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import os
import re
import shlex
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterable, cast
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

REPO_ROOT = Path(__file__).resolve().parent.parent

# Importiere zentrale Test-Module
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from adb_client import AdbClient, adb_available  # noqa: E402
from test_automation import (  # noqa: E402
    SUITES as TA_SUITES,
    SuiteResult,
    check_prereqs as ta_check_prereqs,
    check_security_service_account_prereq,
    run_suite as ta_run_suite,
)
from usb_test_runner import run_usb_test  # noqa: E402
from dual_device_runner import run_dual_device  # noqa: E402
from static_readiness_checks import run_checks_as_dicts as run_static_readiness_checks, summary as static_readiness_summary  # noqa: E402
LOG_DIR = REPO_ROOT / "python_admin" / "logs"
COMMISSIONING_LOG_FILE = LOG_DIR / "commissioning_runs.jsonl"
COMMISSIONING_EVIDENCE_LOG_FILE = LOG_DIR / "commissioning_evidence.jsonl"
DEFAULT_HOST = os.environ.get("MINIMASTER_ADMIN_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("MINIMASTER_ADMIN_PORT", "8765"))
DEFAULT_HISTORY_LIMIT = 15
MAX_HISTORY_LIMIT = 100
DEFAULT_EVIDENCE_LIMIT = 50
MAX_EVIDENCE_LIMIT = 500
DEFAULT_COMMAND_TIMEOUT_SEC = int(os.environ.get("MINIMASTER_COMMAND_TIMEOUT_SEC", "1800"))
ALLOWED_EVIDENCE_STATUSES = {"pass", "fail", "manual_required"}

ALLOWED_COMMANDS = {
    "adb",
    "bash",
    "firebase",
    "node",
    "npm",
    "npx",
    "powershell",
    "pwsh",
    "python",
    "python3",
    "gradlew.bat",
    ".\\gradlew.bat",
    "./gradlew",
}

COMMISSIONING_COMMANDS = (
    {
        "id": "validate-readiness",
        "label": "Readiness Gates",
        "command": "npm run validate:readiness",
        "cwd": REPO_ROOT,
    },
    {
        "id": "ci-revalidate",
        "label": "CI Revalidate Release Gates",
        "command": "npm run ci:revalidate",
        "cwd": REPO_ROOT,
    },
)


def make_documented_test(
    test_id: str,
    title: str,
    description: str,
    documentation: str,
    *,
    success_criteria: str,
    source: str = "docs",
    automation_type: str = "documented",
) -> dict[str, object]:
    return {
        "id": test_id,
        "title": title,
        "description": description,
        "automationType": automation_type,
        "source": source,
        "successCriteria": success_criteria,
        "documentation": documentation,
    }


TEST_REGISTER_STALE_DAYS = 30


def parse_iso_timestamp(value: object) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def is_stale_timestamp(value: object, *, stale_days: int = TEST_REGISTER_STALE_DAYS) -> bool:
    parsed = parse_iso_timestamp(value)
    if parsed is None:
        return False
    return datetime.now(timezone.utc) - parsed > timedelta(days=stale_days)


def load_local_firebase_binding_status(target_project_id: str) -> tuple[bool, str]:
    firebaserc_file = REPO_ROOT / ".firebaserc"
    if not firebaserc_file.exists():
        return False, ".firebaserc fehlt; lokale Firebase-Projektbindung wurde noch nicht eingerichtet."

    try:
        firebaserc = json.loads(firebaserc_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False, ".firebaserc ist nicht lesbar oder enthaelt ungueltiges JSON."

    projects = as_dict(firebaserc.get("projects"))
    default_project = str_value(projects, "default")
    if not default_project:
        return False, ".firebaserc enthaelt kein default-Projekt; firebase use --add wurde lokal noch nicht abgeschlossen."

    normalized_target = target_project_id.strip()
    if normalized_target and default_project != normalized_target:
        return (
            False,
            f".firebaserc ist auf '{default_project}' gesetzt und weicht von der Runtime Project ID '{normalized_target}' ab.",
        )

    return True, f".firebaserc ist lokal auf '{default_project}' gebunden."


def load_local_service_account_status() -> tuple[bool, str]:
    available, reason = check_security_service_account_prereq()
    if available:
        return True, "serviceAccountKey.json ist lokal fuer setup-admin verfuegbar."
    return False, str(reason or "serviceAccountKey.json ist lokal nicht verfuegbar.")


def severity_rank(value: str) -> int:
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    return order.get(value, 9)


def infer_register_metadata(
    *,
    entry_kind: str,
    automation_type: str,
    group_id: str,
    group_title: str,
    source: str,
    suite_ref: str = "",
    updated_at: str = "",
    status: str = "not_run",
    documentation: str = "",
    command: str = "",
    prereq_reason: str = "",
) -> dict[str, object]:
    owner = "Engineering"
    severity = "medium"
    blocking_for_release = False
    evidence_required = automation_type in {"manual", "documented"}
    environment = "local"
    known_constraints = ""

    group_key = f"{group_id} {group_title} {source}".lower()
    if any(token in group_key for token in ("security", "rules", "compliance", "legal", "audit")):
        owner = "Security/Compliance"
        severity = "critical"
        blocking_for_release = True
    elif any(token in group_key for token in ("play", "release", "p0", "commissioning", "reviewer", "acceptance", "governance")):
        owner = "Product/Ops"
        severity = "critical"
        blocking_for_release = True
    elif any(token in group_key for token in ("android", "ios", "device", "desktop", "runtime", "backend", "support", "integration", "system", "operator", "web")):
        owner = "Engineering"
        severity = "high"
        blocking_for_release = True
    elif "python qa" in group_key:
        owner = "QA Automation"
        severity = "medium"

    if entry_kind == "suite":
        environment = "ci/local"
    if entry_kind == "repo-test":
        environment = "repo"
    if entry_kind == "commissioning" and automation_type in {"manual", "documented"}:
        environment = "manual"
    if automation_type == "command":
        environment = "local-cli"
    elif suite_ref.startswith("android-"):
        environment = "android"
    elif suite_ref.startswith("backend-"):
        environment = "backend"
    elif suite_ref.startswith("python-"):
        environment = "python"
    elif suite_ref.startswith("release-"):
        environment = "release"
    elif "ios" in group_key:
        environment = "ios"

    if suite_ref in {"android-connected-master", "android-connected-child", "android-usb-master", "android-usb-child", "android-e2e-shell", "android-e2e-shell-script"}:
        known_constraints = "Erfordert verbundenes Android-Geraet oder Emulator via adb."
    elif suite_ref == "backend-rules-emulator":
        known_constraints = "Erfordert laufenden Firestore-Emulator bzw. firebase-tools."
    elif suite_ref.startswith("python-tests-"):
        known_constraints = "Erfordert pytest in der lokalen Python-Umgebung."
    elif "ios" in group_key:
        known_constraints = "Echte iOS-Builds und XCTest-Laeufe erfordern macOS/Xcode; aktuell existiert keine direkte Suite-Anbindung im Python-QA-Backend."
    elif prereq_reason:
        known_constraints = prereq_reason

    stale = evidence_required and is_stale_timestamp(updated_at)
    return {
        "owner": owner,
        "severity": severity,
        "severityRank": severity_rank(severity),
        "blockingForRelease": blocking_for_release,
        "evidenceRequired": evidence_required,
        "environment": environment,
        "knownConstraints": known_constraints,
        "lastVerifiedAt": updated_at or "",
        "lastSuccessfulAt": updated_at if status == "pass" else "",
        "hasSuccessfulRun": status == "pass",
        "staleEvidence": stale,
        "sourceOfTruth": documentation or command or suite_ref or source,
        "linkedSuite": suite_ref,
        "linkedCommand": command,
    }

COMMISSIONING_TEST_GROUPS = (
    {
        "id": "runtime",
        "title": "Runtime & Cloud-Basis",
        "description": "Prüft, ob Projektbindung, AI-Runtime und App-Check für den Go-Live vorbereitet sind.",
        "tests": (
            {
                "id": "cloud-project-id",
                "title": "Cloud Project ID gesetzt",
                "description": "Die Runtime-Konfiguration enthält eine produktive Firebase/Cloud-Projekt-ID.",
                "automationType": "automatic",
                "source": "runtime",
                "successCriteria": "projectId ist im Runtime-Block gepflegt.",
            },
            {
                "id": "ai-runtime-config",
                "title": "AI Runtime vollständig",
                "description": "Provider, Modell, Secret-Referenz und Systemprompt sind für den AI-Flow hinterlegt.",
                "automationType": "automatic",
                "source": "runtime",
                "successCriteria": "provider, model, keyRef und systemPrompt sind gesetzt.",
            },
            {
                "id": "app-check-mode",
                "title": "App Check Mode gesetzt",
                "description": "Der Operator hat den gewünschten App-Check-Modus dokumentiert.",
                "automationType": "automatic",
                "source": "runtime",
                "successCriteria": "appCheckMode enthält einen gültigen Wert.",
            },
        ),
    },
    {
        "id": "service-approvals",
        "title": "Freigaben & Registrierungen",
        "description": "Erfasst alle identifizierten manuellen Nachweise, die vor dem Go-Live abgezeichnet sein müssen.",
        "tests": (
            {
                "id": "firebase-auth-enabled",
                "title": "Firebase Authentication aktiviert",
                "description": "Manueller Nachweis, dass Firebase Authentication im Zielprojekt aktiviert und betriebsbereit ist.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Firebase Authentication ist im Operator-Panel bestaetigt.",
            },
            {
                "id": "firestore-enabled",
                "title": "Firestore aktiviert",
                "description": "Automatisch aus der Backend-Validierung abgeleitet: Firestore ist im Zielprojekt erreichbar.",
                "automationType": "automatic",
                "source": "validation",
                "successCriteria": "Die Full Validation meldet erfolgreichen Firestore-Zugriff auf die Kernsammlungen.",
            },
            {
                "id": "storage-enabled",
                "title": "Firebase Storage aktiviert",
                "description": "Automatisch aus der Backend-Validierung abgeleitet: Storage ist erreichbar und der Bucket antwortet.",
                "automationType": "automatic",
                "source": "validation",
                "successCriteria": "Die Full Validation meldet Backend Storage Health als OK.",
            },
            {
                "id": "functions-enabled",
                "title": "Cloud Functions aktiviert",
                "description": "Automatisch aus der Backend-Validierung abgeleitet: Callable Functions sind erreichbar.",
                "automationType": "automatic",
                "source": "validation",
                "successCriteria": "Die Full Validation meldet alle relevanten Functions als erreichbar.",
            },
            {
                "id": "messaging-enabled",
                "title": "Cloud Messaging aktiviert oder bewusst nicht benötigt",
                "description": "Manueller Nachweis fuer FCM-Aktivierung oder bewusstes Nicht-Nutzen im Zielsetup.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Cloud Messaging ist bestaetigt oder explizit als nicht benoetigt dokumentiert.",
            },
            {
                "id": "android-master-registered",
                "title": "Android-App com.minimaster.masterapp registriert",
                "description": "Manueller Nachweis, dass die Eltern-App im Projekt registriert und testbar ist.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Die Eltern-App com.minimaster.masterapp ist bestaetigt registriert.",
            },
            {
                "id": "android-child-registered",
                "title": "Android-App com.google.pairing registriert",
                "description": "Manueller Nachweis, dass die Child-App im Projekt registriert und testbar ist.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Die Child-App com.google.pairing ist bestaetigt registriert.",
            },
            {
                "id": "firebase-project-bound",
                "title": "firebase use --add lokal durchgeführt",
                "description": "Automatischer Workspace-Check auf die lokale Firebase-Projektbindung ueber .firebaserc.",
                "automationType": "automatic",
                "source": "workspace",
                "successCriteria": ".firebaserc enthaelt eine default-Projektbindung und passt zur konfigurierten Runtime Project ID.",
            },
            {
                "id": "service-account-ready",
                "title": "serviceAccountKey.json lokal für setup-admin verfügbar",
                "description": "Automatischer Local-Environment-Check fuer die Service-Account-Datei des Setup-Admin-Runners.",
                "automationType": "automatic",
                "source": "workspace",
                "successCriteria": "Die konfigurierte Service-Account-Datei oder serviceAccountKey.json ist lokal verfuegbar.",
            },
            {
                "id": "parent-panel-verified",
                "title": "Parent Web Panel Login geprüft",
                "description": "Manueller Nachweis fuer den erfolgreichen Login in das Parent Web Panel.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Der Parent-Panel-Login wurde erfolgreich getestet und bestaetigt.",
            },
            {
                "id": "device-sync-verified",
                "title": "Device-Sync zwischen Parent Panel und Child geprüft",
                "description": "Manueller Nachweis fuer die Synchronisation zwischen Parent Panel und Child-Geraet.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Der Device-Sync wurde getestet und bestaetigt.",
            },
            {
                "id": "support-flow-verified",
                "title": "Support-Ticket-Flow geprüft",
                "description": "Automatischer Nachweis fuer einen erfolgreichen Support-Ticket-Flow ueber die vorhandenen Backend- und Admin-Regressionstests.",
                "automationType": "automatic",
                "source": "testing-register",
                "successCriteria": "Der Support-Ticket-Flow ist ueber automatisierte Regressionstests als bestanden markiert.",
            },
            {
                "id": "compliance-flow-verified",
                "title": "DSAR- und Audit-Flow geprüft",
                "description": "Automatischer Nachweis fuer DSAR- und Audit-Funktionen ueber die vorhandenen Backend- und Admin-Regressionstests.",
                "automationType": "automatic",
                "source": "testing-register",
                "successCriteria": "Der DSAR- und Audit-Flow ist ueber automatisierte Regressionstests als bestanden markiert.",
            },
            {
                "id": "storage-rules-verified",
                "title": "Storage Rules aktiv und geprüft",
                "description": "Automatischer Nachweis, dass Storage Rules aktiv sind und ueber Emulator-Tests fachlich geprueft wurden.",
                "automationType": "automatic",
                "source": "testing-register",
                "successCriteria": "Die Storage Rules bestehen die Emulator-Regression fuer Zugriff, Content-Type, Groesse und Legacy-Pfade.",
            },
        ),
    },
    {
        "id": "release-readiness",
        "title": "Release & Store-Readiness",
        "description": "Deckt die bereits identifizierten Go-Live-Blocker rund um Play Store und Gesamtsystem ab.",
        "tests": (
            {
                "id": "play-store-required-checks-complete",
                "title": "Play-Store-Readiness: Pflicht-Checks vollständig",
                "description": "Automatisch bewertet, ob alle Play-Store-Pflichtchecks im lokalen Readiness-Block gesetzt sind.",
                "automationType": "automatic",
                "source": "playstore",
                "successCriteria": "Alle lokalen Play-Store-Pflichtchecks sind als erledigt markiert.",
            },
            {
                "id": "play-store-privacy-url-valid",
                "title": "Play-Store-Readiness: Privacy-Policy-URL gültig",
                "description": "Automatisch bewertet, ob eine gueltige HTTPS-Privacy-Policy-URL gepflegt ist.",
                "automationType": "automatic",
                "source": "playstore",
                "successCriteria": "privacyUrl ist gesetzt und beginnt mit https://.",
            },
            {
                "id": "play-store-support-email-valid",
                "title": "Play-Store-Readiness: Support-/Privacy-E-Mail gültig",
                "description": "Automatisch bewertet, ob eine gueltige Support- oder Privacy-E-Mail gepflegt ist.",
                "automationType": "automatic",
                "source": "playstore",
                "successCriteria": "supportEmail ist gesetzt und im gueltigen E-Mail-Format vorhanden.",
            },
            {
                "id": "full-validation-status",
                "title": "Full Validation fehlerfrei",
                "description": "Die browserseitige Full Validation meldet keine kritischen Fehler mehr.",
                "automationType": "automatic",
                "source": "backend",
                "successCriteria": "errorCount der Full Validation ist 0.",
            },
        ),
    },
    {
        "id": "local-gates",
        "title": "Lokale Gate-Kommandos",
        "description": "Führt die identifizierten lokalen Skript-Gates im Python-Operator aus und protokolliert deren Ergebnis.",
        "tests": tuple(
            {
                "id": str(command_def["id"]),
                "title": str(command_def["label"]),
                "description": f"Lokales Kommando: {command_def['command']}",
                "automationType": "command",
                "source": "command",
                "successCriteria": "Das Kommando beendet sich mit Exit-Code 0.",
                "command": str(command_def["command"]),
            }
            for command_def in COMMISSIONING_COMMANDS
        ),
    },
    {
        "id": "documented-physical-commissioning",
        "title": "Dokumentierte physische Commissioning-Tests",
        "description": "Spiegelt die dokumentierten Abnahmetests aus der Physical Commissioning Checklist wider.",
        "tests": (
            {
                "id": "doc-master-app-registration-auth",
                "title": "Test 1.1: Master App Registration & Auth",
                "description": "Automatisierter MasterApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-master",
                "successCriteria": "Die MasterApp-Commissioning-Suite validiert Registration, Legal-Gate und Auth-Fluss erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-11-master-app-registration--auth",
            },
            {
                "id": "doc-generate-pairing-code",
                "title": "Test 1.2: Generate Pairing Code",
                "description": "Automatisierter MasterApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-master",
                "successCriteria": "Die MasterApp-Commissioning-Suite validiert die Pairing-Code-Erzeugung erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-12-generate-pairing-code",
            },
            {
                "id": "doc-child-app-registration-code",
                "title": "Test 1.3: Child App Registration via Code",
                "description": "Automatisierter ChildApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-child",
                "successCriteria": "Die ChildApp-Commissioning-Suite validiert Registrierung und Pairing erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-13-child-app-registration-via-code",
            },
            {
                "id": "doc-create-task",
                "title": "Test 2.1: Create a Task",
                "description": "Automatisierter MasterApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-master",
                "successCriteria": "Die MasterApp-Commissioning-Suite validiert die Task-Erstellung erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-21-create-a-task",
            },
            {
                "id": "doc-child-submits-task-photo",
                "title": "Test 2.2: Child Submits Task with Photo",
                "description": "Automatisierter ChildApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-child",
                "successCriteria": "Die ChildApp-Commissioning-Suite validiert Task-Abschluss und Foto-Nachweis erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-22-child-submits-task-with-photo",
            },
            {
                "id": "doc-task-approval-workflow",
                "title": "Test 2.3: Complete Task Approval Workflow",
                "description": "Automatisierter MasterApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-master",
                "successCriteria": "Die MasterApp-Commissioning-Suite validiert den Task-Freigabe-Workflow erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-23-complete-task-approval-workflow",
            },
            {
                "id": "doc-create-app-blocking-rule",
                "title": "Test 3.1: Create App Blocking Rule",
                "description": "Automatisierter MasterApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-master",
                "successCriteria": "Die MasterApp-Commissioning-Suite validiert die Erfassung einer App-Blocking-Regel erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-31-create-app-blocking-rule",
            },
            {
                "id": "doc-verify-app-blocking-enforcement",
                "title": "Test 3.2: Verify App Blocking Enforcement",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-32-verify-app-blocking-enforcement",
            },
            {
                "id": "doc-screen-lock-enforcement",
                "title": "Test 3.3: Screen Lock Enforcement",
                "description": "Automatisierter MasterApp-Commissioning-Test aus der Physical Commissioning Checklist.",
                "automationType": "automatic",
                "source": "device-suite",
                "suiteRef": "android-usb-master",
                "successCriteria": "Die MasterApp-Commissioning-Suite validiert den Screen-Lock-Flow erfolgreich.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-33-screen-lock-enforcement",
            },
            {
                "id": "doc-tamper-detection-device-admin-disable",
                "title": "Test 4.1: Tamper Detection — Device Admin Disable",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-41-tamper-detection--device-admin-disable",
            },
            {
                "id": "doc-usb-debug-mode-interface",
                "title": "Test 4.2: USB Debug Mode — Verify Debug Interface",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-42-usb-debug-mode--verify-debug-interface",
            },
            {
                "id": "doc-offline-rule-enforcement",
                "title": "Test 5.1: Offline Rule Enforcement",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-51-offline-rule-enforcement",
            },
            {
                "id": "doc-heartbeat-sync-recovery",
                "title": "Test 5.2: Heartbeat & Sync Recovery",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-52-heartbeat--sync-recovery",
            },
            {
                "id": "doc-required-permissions-granted",
                "title": "Test 6.1: Verify Required Permissions Granted",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-61-verify-required-permissions-granted",
            },
            {
                "id": "doc-no-excessive-permissions",
                "title": "Test 6.2: Verify No Excessive Permissions",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-62-verify-no-excessive-permissions",
            },
            {
                "id": "doc-soak-test-1h",
                "title": "Test 7.1: 1-Hour Soak Test",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-71-1-hour-soak-test",
            },
            {
                "id": "doc-network-resilience",
                "title": "Test 7.2: Network Resilience",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-72-network-resilience",
            },
            {
                "id": "doc-final-checklist-evidence",
                "title": "Test 8.1: Final Checklist & Evidence Collection",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-81-final-checklist--evidence-collection",
            },
            {
                "id": "doc-pre-go-live-decision",
                "title": "Test 8.2: Pre-Go-Live Decision",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-82-pre-go-live-decision",
            },
        ),
    },
    {
        "id": "documented-task-scenarios",
        "title": "Dokumentierte Aufgaben- und Freischalt-Szenarien",
        "description": "Spiegelt die dokumentierten Unlock- und Sicherheits-Testfälle wider.",
        "tests": (
            {
                "id": "doc-task-unlock-success",
                "title": "Testfall 1: Erfolgreicher Aufgaben-Zyklus (Freischaltung)",
                "description": "Dokumentierter Aufgaben- und Freischalt-Flow aus dem Testfall-Dokument.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Szenario gemaess docs/TEST_SCENARIOS_TASK_UNLOCK.md erfolgreich nachgestellt und protokolliert.",
                "documentation": "docs/TEST_SCENARIOS_TASK_UNLOCK.md#testfall-1-erfolgreicher-aufgaben-zyklus-freischaltung",
            },
            {
                "id": "doc-task-unlock-reject",
                "title": "Testfall 2: Ablehnung der Aufgabe (Sperre bleibt aktiv)",
                "description": "Dokumentierter Negativtest fuer den Aufgaben-Workflow.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Szenario gemaess docs/TEST_SCENARIOS_TASK_UNLOCK.md erfolgreich nachgestellt und protokolliert.",
                "documentation": "docs/TEST_SCENARIOS_TASK_UNLOCK.md#testfall-2-ablehnung-der-aufgabe-sperre-bleibt-aktiv",
            },
            {
                "id": "doc-task-unlock-security",
                "title": "Testfall 3: Sicherheitsprüfung (Unautorisierter Zugriff)",
                "description": "Dokumentierter Sicherheitstest fuer unautorisierte Zugriffe.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Szenario gemaess docs/TEST_SCENARIOS_TASK_UNLOCK.md erfolgreich nachgestellt und protokolliert.",
                "documentation": "docs/TEST_SCENARIOS_TASK_UNLOCK.md#testfall-3-sicherheitsprufung-unautorisierter-zugriff",
            },
        ),
    },
    {
        "id": "documented-support-compliance",
        "title": "Dokumentierte Support- und Compliance-Szenarien",
        "description": "Erfasst den dokumentierten Support-/Compliance-Gate aus dem Admin-Support-Workflow.",
        "tests": (
            {
                "id": "doc-support-compliance-test",
                "title": "Support- und Compliance-Testfall durchlaufen",
                "description": "Dokumentierter Go-Live-Schritt aus dem PC Admin AI Support Workflow.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Szenario gemaess docs/PC_ADMIN_AI_SUPPORT_WORKFLOW.md erfolgreich nachgestellt und protokolliert.",
                "documentation": "docs/PC_ADMIN_AI_SUPPORT_WORKFLOW.md#empfohlene-reihenfolge-fur-go-live",
            },
        ),
    },
    {
        "id": "documented-reviewer-access",
        "title": "Dokumentierte Reviewer- und App-Access-Szenarien",
        "description": "Erfasst dokumentierte Testablaeufe fuer Play-Review, Test-Credentials und Submission-Checks.",
        "tests": (
            make_documented_test(
                "doc-reviewer-test-credentials",
                "Reviewer-Test-Credentials verifizieren",
                "Prueft, ob die dokumentierten Reviewer-Credentials und Testprofile vollstaendig gepflegt sind.",
                "docs/APP_ACCESS_REVIEWER_GUIDE.md#2-test-credentials",
                automation_type="automatic",
                source="docs-validation",
                success_criteria="Die hinterlegten Reviewer-Credentials und Testprofile sind verfuegbar und dokumentiert.",
            ),
            make_documented_test(
                "doc-reviewer-minimal-scenario",
                "Minimalen Reviewer-Testablauf durchlaufen",
                "Spiegelt das dokumentierte Minimal-Szenario fuer den App-Review wider.",
                "docs/APP_ACCESS_REVIEWER_GUIDE.md#6-minimal-reviewer-test-scenario",
                success_criteria="Das Minimal-Szenario wurde gemaess Reviewer-Guide erfolgreich nachgestellt und dokumentiert.",
            ),
            make_documented_test(
                "doc-reviewer-password-reset-post-review",
                "Reviewer-Passwort-Reset nach Abschluss pruefen",
                "Stellt sicher, dass Post-Review-Massnahmen fuer QA-/Reviewer-Accounts beachtet werden.",
                "docs/APP_ACCESS_REVIEWER_GUIDE.md#8-post-review-clean-up",
                success_criteria="Die dokumentierten Reset- und Cleanup-Schritte wurden nach Reviewabschluss bestaetigt.",
            ),
            make_documented_test(
                "doc-reviewer-submission-checklist",
                "Submission-Checklist fuer Reviewer-Access abgleichen",
                "Spiegelt die dokumentierte Submission-Checklist fuer den App-Review wider.",
                "docs/APP_ACCESS_REVIEWER_GUIDE.md#9-submission-checklist",
                automation_type="automatic",
                source="docs-validation",
                success_criteria="Alle Submission-Punkte aus dem Reviewer-Guide wurden abgeglichen und dokumentiert.",
            ),
        ),
    },
    {
        "id": "documented-security-release-governance",
        "title": "Dokumentierte Security-, Governance- und Release-Gates",
        "description": "Erfasst dokumentierte Governance- und Release-Unterlagen, die ausserhalb automatischer Laeufe abgezeichnet werden.",
        "tests": (
            make_documented_test(
                "doc-security-baseline-operator-surfaces",
                "Security Baseline fuer Operator-Oberflaechen abgleichen",
                "Vergleicht die Operator-/Web-Sicherheitsbasis mit der dokumentierten Checkliste.",
                "docs/SECURITY_BASELINE_CHECKLIST.md#2-web-panel-admin-panel-operator-dashboard",
                success_criteria="Die Security-Baseline-Checkliste wurde fuer Operator-Oberflaechen durchlaufen und dokumentiert.",
            ),
            make_documented_test(
                "doc-complete-acceptance-process",
                "Complete Acceptance Process abarbeiten",
                "Spiegelt den dokumentierten Gesamtprozess fuer Quality Gate und funktionale Abnahme wider.",
                "docs/COMPLETE_ACCEPTANCE_PROCESS_2026-03-19.md#stage-3-functional-commissioning-gate",
                success_criteria="Die dokumentierten Acceptance-Stages wurden abgearbeitet und protokolliert.",
            ),
            make_documented_test(
                "doc-ci-runbook-gates",
                "CI-Runbook-Gates verifizieren",
                "Prueft, ob die dokumentierten CI- und Test-Gates nachvollzogen wurden.",
                "docs/CI_RUNBOOK.md#2-quality-gates",
                success_criteria="Alle relevanten CI-Runbook-Gates wurden nachvollzogen und dokumentiert.",
            ),
            make_documented_test(
                "doc-release-evidence-register",
                "Release-Evidence-Register abgleichen",
                "Stellt sicher, dass Release-Evidenz und offene Restpunkte im Register gepflegt sind.",
                "docs/RELEASE_EVIDENCE_REGISTER.md",
                automation_type="automatic",
                source="docs-validation",
                success_criteria="Das Evidence Register wurde auf Vollstaendigkeit geprueft und mit aktuellen Artefakten verknuepft.",
            ),
        ),
    },
    {
        "id": "documented-enforcement-matrix",
        "title": "Dokumentierte Enforcement-Matrix",
        "description": "Spiegelt die Child-Enforcement-Matrix als dokumentierte Testgruppe wider.",
        "tests": (
            make_documented_test(
                "doc-enforcement-app-blocking",
                "Enforcement-Matrix: App-Blocking",
                "Dokumentierte App-Blocking-Szenarien aus der Enforcement-Matrix.",
                "docs/CHILD_ENFORCEMENT_TEST_MATRIX.md#3-test-scenarios",
                success_criteria="Die App-Blocking-Szenarien der Matrix wurden durchlaufen und dokumentiert.",
            ),
            make_documented_test(
                "doc-enforcement-device-lock",
                "Enforcement-Matrix: Geraetesperre",
                "Dokumentierte Szenarien zur Geraetesperre aus der Enforcement-Matrix.",
                "docs/CHILD_ENFORCEMENT_TEST_MATRIX.md#3-test-scenarios",
                success_criteria="Die Lock-Szenarien der Matrix wurden durchlaufen und dokumentiert.",
            ),
            make_documented_test(
                "doc-enforcement-usage-rules",
                "Enforcement-Matrix: Nutzungsregeln",
                "Dokumentierte Nutzungsregel-Szenarien aus der Enforcement-Matrix.",
                "docs/CHILD_ENFORCEMENT_TEST_MATRIX.md#3-test-scenarios",
                success_criteria="Die Nutzungsregel-Szenarien der Matrix wurden durchlaufen und dokumentiert.",
            ),
            make_documented_test(
                "doc-enforcement-anti-tamper",
                "Enforcement-Matrix: Anti-Tamper",
                "Dokumentierte Anti-Tamper-Szenarien aus der Enforcement-Matrix.",
                "docs/CHILD_ENFORCEMENT_TEST_MATRIX.md#3-test-scenarios",
                success_criteria="Die Anti-Tamper-Szenarien der Matrix wurden durchlaufen und dokumentiert.",
            ),
            make_documented_test(
                "doc-enforcement-offline-resilience",
                "Enforcement-Matrix: Offline-Resilienz",
                "Dokumentierte Offline-Resilienz-Szenarien aus der Enforcement-Matrix.",
                "docs/CHILD_ENFORCEMENT_TEST_MATRIX.md#3-test-scenarios",
                success_criteria="Die Offline-Resilienz-Szenarien der Matrix wurden durchlaufen und dokumentiert.",
            ),
            make_documented_test(
                "doc-enforcement-fcm-sync",
                "Enforcement-Matrix: FCM-Sync",
                "Dokumentierte FCM-Sync-Szenarien aus der Enforcement-Matrix.",
                "docs/CHILD_ENFORCEMENT_TEST_MATRIX.md#3-test-scenarios",
                success_criteria="Die FCM-Sync-Szenarien der Matrix wurden durchlaufen und dokumentiert.",
            ),
        ),
    },
    {
        "id": "p0-blocker-security",
        "title": "P0: Firebase Key Rotation & Restriktionen",
        "description": "Sicherheitskritische Key-Rotation und API-Restriktionen vor Go-Live.",
        "tests": (
            {
                "id": "p0-key-rotation-done",
                "title": "Firebase API Key Rotation abgeschlossen",
                "description": "Alle kompromittierten oder oeffentlich exponierten API-Keys wurden rotiert.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Key-Rotation in Firebase Console durchgefuehrt und dokumentiert.",
            },
            {
                "id": "p0-key-restrictions-done",
                "title": "API-/App-Restriktionen gesetzt",
                "description": "API-Keys sind auf die benoetigten APIs und App-Bundles eingeschraenkt.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Restriktionen in Google Cloud Console konfiguriert und dokumentiert.",
            },
        ),
    },
    {
        "id": "p0-blocker-play",
        "title": "P0: Play Console Paket",
        "description": "Play Store Release-Voraussetzungen: Data Safety, IARC, Listing, Permissions, App Access.",
        "tests": (
            {
                "id": "p0-play-data-safety",
                "title": "Data Safety Formular eingereicht",
                "description": "Das Data-Safety-Formular in der Play Console ist vollstaendig ausgefuellt.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Data Safety Section in Play Console ist als eingereicht markiert.",
            },
            {
                "id": "p0-play-iarc",
                "title": "IARC-Altersfreigabe abgeschlossen",
                "description": "Altersfreigabe-Rating ueber IARC beantragt und erhalten.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "IARC-Rating ist in der Play Console sichtbar.",
            },
            {
                "id": "p0-play-listing",
                "title": "Store Listing final",
                "description": "Beschreibung, Screenshots, Kontaktdaten und Feature-Grafik sind vollstaendig.",
                "automationType": "automatic",
                "source": "docs-validation",
                "successCriteria": "Store Listing ist in der Play Console als vollstaendig markiert.",
                "documentation": "docs/STORE_LISTING_AND_IARC_READINESS.md#part-d-store-listing-finalization",
            },
            {
                "id": "p0-play-permissions",
                "title": "Permissions Declaration eingereicht",
                "description": "Accessibility/Usage/Overlay-Begruendungen sind eingereicht.",
                "automationType": "automatic",
                "source": "docs-validation",
                "successCriteria": "Permissions Declaration ist eingereicht und consistent mit App-Verhalten.",
                "documentation": "docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md#6-submission-evidence-log",
            },
            {
                "id": "p0-play-app-access",
                "title": "App Access Guide hinterlegt",
                "description": "Reviewer-Anleitung mit Test-Credentials ist in der Play Console hinterlegt.",
                "automationType": "automatic",
                "source": "docs-validation",
                "successCriteria": "App Access Guide ist hochgeladen und aktuell.",
                "documentation": "docs/APP_ACCESS_REVIEWER_GUIDE.md#11-finalization-sign-off",
            },
        ),
    },
    {
        "id": "p0-blocker-commissioning",
        "title": "P0: Physische Commissioning-Abnahme",
        "description": "Physische Device-Tests fuer Android-Pairing, AI-Flow, Support und Compliance.",
        "tests": (
            {
                "id": "p0-commissioning-android",
                "title": "Android Apps (Pairing + Sync) geprueft",
                "description": "Pairing und Daten-Sync zwischen MasterApp und ChildApp auf echten Geraeten getestet.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Pairing + FCM-Sync auf physischen Geraeten erfolgreich dokumentiert.",
            },
            {
                "id": "p0-commissioning-ai",
                "title": "AI-Konfiguration + AI-Flow geprueft",
                "description": "Gemini-Integration und AI-Support-Flow funktionieren end-to-end.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "AI-Anfrage und -Antwort im Admin-Panel erfolgreich getestet.",
            },
            {
                "id": "p0-commissioning-support",
                "title": "Support-Workflow vollstaendig getestet",
                "description": "Ticket-Erstellung, -Bearbeitung und -Abschluss funktionieren.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Support-Workflow end-to-end durchlaufen und protokolliert.",
            },
            {
                "id": "p0-commissioning-compliance",
                "title": "Compliance-Flow (DSAR/Audit/Consent) geprueft",
                "description": "DSAR-Anfragen, Audit-Log und Consent-Status funktionieren korrekt.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "DSAR + Audit + Consent-Flow end-to-end getestet.",
            },
        ),
    },
    {
        "id": "p0-blocker-roster",
        "title": "P0: On-Call / Eskalations-Roster",
        "description": "Bereitschaftsplan und Eskalationskontakte fuer den Produktivbetrieb.",
        "tests": (
            {
                "id": "p0-roster-assigned",
                "title": "Roster verbindlich benannt",
                "description": "On-Call-Roster mit primaeren und sekundaeren Kontakten ist definiert.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Roster ist dokumentiert und allen Beteiligten bekannt.",
            },
        ),
    },
    {
        "id": "functional-readiness-masterapp",
        "title": "MasterApp: Funktionale Readiness & UX",
        "description": "Manuelle E2E- und UX-Pruefungen aus dem bisherigen Plattform-Readiness-Panel fuer die Eltern-App.",
        "tests": (
            {
                "id": "ma-registration-flow",
                "title": "Geräteregistrierung & SecretKey-Persistierung funktionsfähig",
                "description": "Prueft den Ende-zu-Ende-Registrierungsflow inklusive persistiertem SecretKey in der MasterApp.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Registrierung, Wiederanmeldung und SecretKey-Persistierung sind auf einem Testgeraet bestaetigt.",
            },
            {
                "id": "ma-pairing-works",
                "title": "Pairing-Link-Generierung und Kopplung mit ChildApp getestet",
                "description": "Prueft, dass ein Parent-Geraet einen Pairing-Link erzeugen und ein Child erfolgreich koppeln kann.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Pairing-Link wurde erstellt, eingeloest und die Kopplung erfolgreich bestaetigt.",
            },
            {
                "id": "ma-lock-unlock",
                "title": "Lock/Unlock Toggle für Kindergeräte funktionsfähig",
                "description": "Verifiziert die Sperr-/Entsperrsteuerung vom Parent aus gegen ein reales Child-Geraet.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Lock und Unlock werden vom Child-Geraet korrekt uebernommen.",
            },
            {
                "id": "ma-task-create",
                "title": "Task-Erstellung mit Deadline funktionsfähig",
                "description": "Prueft die Erstellung einer Aufgabe inklusive Deadline in der MasterApp.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Eine Aufgabe mit Deadline kann erfolgreich angelegt und gespeichert werden.",
            },
            {
                "id": "ma-task-review",
                "title": "Task Review mit Fotoanzeige und Genehmigung funktionsfähig",
                "description": "Verifiziert den Review-Flow fuer Child-Nachweise inklusive Fotoanzeige und Freigabe.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Foto-Beweis ist sichtbar und die Aufgabe kann erfolgreich genehmigt werden.",
            },
            {
                "id": "ma-task-reject-ui",
                "title": "Reject-Button in TaskReviewScreen vorhanden und funktional",
                "description": "Prueft den Ablehnungsflow fuer Task-Nachweise in der Review-Oberflaeche.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Reject-Button ist sichtbar und lehnt einen offenen Nachweis korrekt ab.",
            },
            {
                "id": "ma-usage-rules-nav",
                "title": "UsageRulesScreen über Navigation erreichbar und datengebunden",
                "description": "Automatischer statischer Nachweis fuer Navigation, Screen-Route und setUsageRules-Anbindung in der MasterApp.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "Dashboard-Navigation, UsageRules-Route und setUsageRules-Callable sind im Code vorhanden.",
            },
            {
                "id": "ma-date-picker",
                "title": "DatePicker statt Freitext-Timestamp für Task-Deadline",
                "description": "Prueft, dass Deadlines ueber einen DatePicker und nicht ueber Freitext erfasst werden.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Deadline-Eingabe erfolgt nutzerfreundlich ueber DatePicker und wird korrekt gespeichert.",
            },
            {
                "id": "ma-subscription-check",
                "title": "Abo-Status wird beim Start geprüft (queryPurchases)",
                "description": "Verifiziert den Laufzeit-Check des Abostatus beim Start der MasterApp.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Die App prueft beim Start den Subscription-Status und zeigt das erwartete Verhalten.",
            },
            {
                "id": "ma-subscription-enforce",
                "title": "Free-Tier-Limit (1 Kind) wird vor Aktionen erzwungen",
                "description": "Prueft die fachliche Durchsetzung des Free-Tier-Limits vor relevanten Aktionen.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Aktionen oberhalb des Free-Tier-Limits werden im UI und fachlich blockiert.",
            },
            {
                "id": "ma-fcm-working",
                "title": "FCM Push-Empfang (task_pending_approval, device_status) getestet",
                "description": "Verifiziert die relevanten FCM-Pushs fuer Task-Approval und Device-Status in der MasterApp.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Die erwarteten Push-Ereignisse kommen auf dem Parent-Geraet sichtbar an.",
            },
            {
                "id": "ma-firebase-appcheck",
                "title": "Firebase App Check aktiviert",
                "description": "Prueft die wirksame Aktivierung von Firebase App Check in einem realen Laufzeitkontext.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "App Check ist aktiv und Anfragen verhalten sich entsprechend der Zielkonfiguration.",
            },
            {
                "id": "ma-offline-handling",
                "title": "Offline-Hinweis oder -Caching implementiert",
                "description": "Prueft, wie die MasterApp bei fehlender Verbindung reagiert und ob Caching/Offline-Hinweise vorhanden sind.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Offline-Szenario fuehrt zu nutzbarer Rueckmeldung oder erwartbarem Cache-Verhalten.",
            },
            {
                "id": "ma-qr-pairing",
                "title": "QR-Code-Anzeige für Pairing (nicht nur Link)",
                "description": "Verifiziert, dass Pairing zusaetzlich per QR-Code visuell bereitgestellt wird.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Ein scanbarer QR-Code fuer Pairing ist im Parent-Flow verfuegbar.",
            },
        ),
    },
    {
        "id": "functional-readiness-childapp",
        "title": "ChildApp: Funktionale Readiness & Geräteschutz",
        "description": "Manuelle E2E- und Schutzpruefungen aus dem bisherigen Plattform-Readiness-Panel fuer die Child-App.",
        "tests": (
            {
                "id": "ca-pairing-flow",
                "title": "Pairing per Deep-Link und 6-stelligem Code funktionsfähig",
                "description": "Prueft den Pairing-Flow der Child-App sowohl per Deep-Link als auch per 6-stelligem Code.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Beide Pairing-Wege lassen sich erfolgreich durchlaufen.",
            },
            {
                "id": "ca-fcm-sync",
                "title": "FCM-Regelempfang (isLocked, appBlacklist, usageRules) funktionsfähig",
                "description": "Verifiziert die Laufzeituebernahme von Sperrstatus, Blacklist und Usage Rules via FCM.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Aenderungen an Regeln werden auf dem Child-Geraet zeitnah sichtbar uebernommen.",
            },
            {
                "id": "ca-accessibility-active",
                "title": "AccessibilityService aktiviert und App-Überwachung läuft",
                "description": "Prueft die aktive Eingabehilfe und die laufende App-Ueberwachung auf dem Child-Geraet.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "AccessibilityService ist aktiv und ueberwacht App-Wechsel wie vorgesehen.",
            },
            {
                "id": "ca-app-blocking-effective",
                "title": "App-Blocking tatsächlich wirksam (nicht nur GLOBAL_ACTION_BACK)",
                "description": "Verifiziert, dass geblockte Apps effektiv verlassen oder ueberdeckt werden und nicht nur ein Ruecksprung ausgelöst wird.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Gesperrte Apps koennen nicht sinnvoll genutzt werden.",
            },
            {
                "id": "ca-overlay-secure",
                "title": "BlockingOverlay nicht wegwischbar, bedeckt kompletten Screen",
                "description": "Prueft das BlockingOverlay auf Vollflaechigkeit und Resistenz gegen Umgehung.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Das Overlay bedeckt den Screen vollstaendig und kann nicht einfach umgangen werden.",
            },
            {
                "id": "ca-settings-protection",
                "title": "Zugriff auf Eingabehilfe-Einstellungen geschützt (nicht nur geloggt)",
                "description": "Verifiziert Schutzmassnahmen gegen das Deaktivieren der Eingabehilfe ueber die Einstellungen.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Das Umgehen ueber Einstellungen ist verhindert oder wird wirksam unterbunden.",
            },
            {
                "id": "ca-device-admin-enforced",
                "title": "DevicePolicyManager tatsächlich aufgerufen (force-lock, watch-login)",
                "description": "Prueft die wirksame Nutzung von DevicePolicyManager-Funktionen im Betrieb.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Relevante DevicePolicyManager-Funktionen greifen auf einem Testgeraet nachweisbar.",
            },
            {
                "id": "ca-usage-limits",
                "title": "Tages- und Pro-App-Nutzungslimits korrekt durchgesetzt",
                "description": "Automatischer statischer Nachweis fuer Parsing, Sync und Enforcement-Code der Tages- und Pro-App-Limits.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "dailyLimit/appLimits werden geparst, synchronisiert und in der Policy-Engine ausgewertet.",
            },
            {
                "id": "ca-time-windows",
                "title": "Zeitfenster-Einschränkungen (inkl. Nachtsperre) aktiv",
                "description": "Automatischer statischer Nachweis fuer Parsing, Sync und Enforcement-Code von Zeitfenster-Policies.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "allowedHours werden geparst, synchronisiert und in der Policy-Engine ausgewertet.",
            },
            {
                "id": "ca-tamper-detection",
                "title": "Manipulationserkennung (Settings-Zugriff) getestet",
                "description": "Verifiziert die Erkennung manipulativer Eingriffe, insbesondere ueber Settings-Zugriffe.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Manipulationsversuche werden erkannt und fuehren zum erwarteten Verhalten.",
            },
            {
                "id": "ca-task-proof",
                "title": "Foto-Beweis-Upload für Aufgaben funktionsfähig",
                "description": "Prueft den Upload eines Foto-Beweises vom Child-Geraet fuer eine Aufgabe.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Foto-Beweis kann erstellt, hochgeladen und im Parent-Flow angezeigt werden.",
            },
            {
                "id": "ca-factory-reset-protection",
                "title": "Factory-Reset-Schutz implementiert",
                "description": "Prueft vorhandene Massnahmen gegen einen Factory Reset oder deren dokumentierte Einschraenkungen.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Factory-Reset-Schutz ist nachweisbar umgesetzt oder sauber dokumentiert bewertet.",
            },
            {
                "id": "ca-root-detection",
                "title": "Root-/SafetyNet-Erkennung implementiert",
                "description": "Verifiziert Root- oder Integritaetserkennung im Betrieb der Child-App.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Root-/Integritaetspruefung ist aktiv und reagiert erwartungsgemaess.",
            },
            {
                "id": "ca-permission-onboarding",
                "title": "Permissions-Onboarding mit Verifikation implementiert",
                "description": "Prueft den gefuehrten Permissions-Onboarding-Flow inklusive Verifikation der erteilten Rechte.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Der Permissions-Flow fuehrt zu bestaetigten und verifizierten Berechtigungen.",
            },
        ),
    },
    {
        "id": "functional-readiness-desktop",
        "title": "Desktop: Betrieb & Integrations-Readiness",
        "description": "Manuelle Betriebs- und Integrationspruefungen aus dem bisherigen Plattform-Readiness-Panel fuer die Electron-App.",
        "tests": (
            {
                "id": "dt-code-signing",
                "title": "Code-Signing-Zertifikate für Windows/macOS eingerichtet",
                "description": "Prueft die produktionsreife Signierung der Desktop-Builds.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Signierte Artefakte oder dokumentierte Zertifikatsnachweise liegen vor.",
            },
            {
                "id": "dt-auto-update",
                "title": "Auto-Update-Mechanismus (electron-updater) implementiert",
                "description": "Verifiziert den Auto-Update-Flow fuer die Electron-App.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Ein Update kann erkannt, angeboten und nachvollziehbar eingespielt werden.",
            },
            {
                "id": "dt-system-tray",
                "title": "System-Tray-Integration (Minimize-to-Tray, Icon)",
                "description": "Prueft das Verhalten beim Minimieren in den Tray und die Sichtbarkeit der Tray-Funktionen.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Tray-Integration funktioniert auf dem Zielsystem erwartungsgemaess.",
            },
            {
                "id": "dt-desktop-notifications",
                "title": "Desktop-Benachrichtigungen bei Aufgaben/Sperren",
                "description": "Verifiziert Desktop-Benachrichtigungen fuer relevante Ereignisse.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Aufgaben- oder Sperrereignisse erzeugen sichtbare Desktop-Benachrichtigungen.",
            },
            {
                "id": "dt-window-persistence",
                "title": "Fenstergröße/-position wird gespeichert",
                "description": "Prueft, ob Fensterzustand zwischen Starts der App erhalten bleibt.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Fensterposition und -groesse werden nach Neustart korrekt wiederhergestellt.",
            },
            {
                "id": "dt-ipc-messaging",
                "title": "IPC-Kommunikation zwischen Main-Process und Panels",
                "description": "Automatischer statischer Nachweis fuer Preload-Bridge und ipcMain-Handler in der Electron-App.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "contextBridge/ipcRenderer im Preload und passende ipcMain-Handler im Main-Process sind vorhanden.",
            },
            {
                "id": "dt-parent-panel-login",
                "title": "Parent-Panel-Login im Electron-Fenster geprüft",
                "description": "Prueft den Parent-Panel-Login innerhalb des Electron-Fensters.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Login und Session im Parent Panel funktionieren im Desktop-Container.",
            },
            {
                "id": "dt-admin-panel-login",
                "title": "Admin-Panel-Login im Electron-Fenster geprüft",
                "description": "Prueft den Admin-Panel-Login innerhalb des Electron-Fensters.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Login und Session im Admin Panel funktionieren im Desktop-Container.",
            },
            {
                "id": "dt-crash-reporting",
                "title": "Crash-Reporter integriert (Sentry o. Ä.)",
                "description": "Verifiziert vorhandenes Crash-Reporting oder einen dokumentierten aequivalenten Fehlerkanal.",
                "automationType": "manual",
                "source": "platform-readiness",
                "successCriteria": "Crash-Reporting ist verfuegbar oder als bewusstes Risiko nachvollziehbar dokumentiert.",
            },
        ),
    },
    {
        "id": "static-readiness-masterapp",
        "title": "Statische Analyse: MasterApp (Eltern-Android)",
        "description": "Automatische Quellcode- und Build-Konfigurationsanalyse der Eltern-App.",
        "tests": (
            {
                "id": "static-ma-proguard-enabled",
                "title": "ProGuard/R8 in Release-Build aktiviert",
                "description": "Prueft, ob minifyEnabled=true im Release-Block von masterApp/build.gradle gesetzt ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "minifyEnabled=true im Release-Block.",
            },
            {
                "id": "static-ma-credentials-encrypted",
                "title": "EncryptedSharedPreferences verwendet",
                "description": "Prueft, ob IMEI/SecretKey via EncryptedSharedPreferences verschluesselt gespeichert werden.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "EncryptedSharedPreferences in mindestens einer Kotlin-Datei.",
            },
            {
                "id": "static-ma-imei-fallback",
                "title": "IMEI-Fallback fuer Android 10+ implementiert",
                "description": "Prueft auf SDK_INT >= 29 / ANDROID_ID-Fallback in der Codebasis.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "SDK-Version-Guard oder ANDROID_ID-Nutzung vorhanden.",
            },
            {
                "id": "static-ma-debug-hidden",
                "title": "Debug-Infos in Release ausgeblendet",
                "description": "Prueft auf BuildConfig.DEBUG-Guards in der MasterApp.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "BuildConfig.DEBUG-Check in mindestens einer Datei.",
            },
            {
                "id": "static-ma-billing",
                "title": "BillingClient/Abo-Pruefung vorhanden",
                "description": "Prueft, ob BillingClient oder queryPurchases in der MasterApp implementiert ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "BillingClient in mindestens einer Kotlin-Datei.",
            },
            {
                "id": "static-ma-fcm",
                "title": "FCM Push-Empfang implementiert",
                "description": "Prueft, ob ein FirebaseMessagingService in der MasterApp vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "FCM-Service in mindestens einer Kotlin-Datei.",
            },
            {
                "id": "static-ma-appcheck",
                "title": "Firebase App Check implementiert",
                "description": "Prueft, ob FirebaseAppCheck in der MasterApp konfiguriert ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "App Check Provider in mindestens einer Kotlin-Datei.",
            },
        ),
    },
    {
        "id": "static-readiness-childapp",
        "title": "Statische Analyse: ChildApp (Kind-Android)",
        "description": "Automatische Quellcode- und Manifest-Analyse der Kind-App.",
        "tests": (
            {
                "id": "static-ca-accessibility",
                "title": "AccessibilityService deklariert",
                "description": "Prueft, ob der AccessibilityService im AndroidManifest.xml deklariert ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "AccessibilityService im Manifest vorhanden.",
            },
            {
                "id": "static-ca-boot-receiver",
                "title": "BootReceiver registriert",
                "description": "Prueft, ob BOOT_COMPLETED-Receiver im AndroidManifest.xml deklariert ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "RECEIVE_BOOT_COMPLETED im Manifest.",
            },
            {
                "id": "static-ca-device-admin",
                "title": "DevicePolicyManager implementiert",
                "description": "Prueft Manifest-Deklaration UND Kotlin-Code fuer DevicePolicyManager.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "Manifest-Deklaration + DevicePolicyManager-Aufruf im Code.",
            },
            {
                "id": "static-ca-heartbeat",
                "title": "HeartbeatWorker (WorkManager) implementiert",
                "description": "Prueft, ob PeriodicWorkRequest/HeartbeatWorker in der ChildApp vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "WorkManager/HeartbeatWorker in mindestens einer Datei.",
            },
            {
                "id": "static-ca-fcm-sync",
                "title": "FCM-Regelempfang implementiert",
                "description": "Prueft, ob ein FCM-Receiver/RuleSyncService in der ChildApp vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "FCM-Receiver in mindestens einer Kotlin-Datei.",
            },
            {
                "id": "static-ca-uninstall-prevention",
                "title": "Deinstallationsschutz implementiert",
                "description": "Prueft, ob setUninstallBlocked im ChildApp-Code aufgerufen wird.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "setUninstallBlocked in mindestens einer Kotlin-Datei.",
            },
            {
                "id": "static-ca-overlay",
                "title": "BlockingOverlay implementiert",
                "description": "Prueft, ob BlockingOverlay/SYSTEM_ALERT_WINDOW-Code vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "Overlay-Code in mindestens einer Kotlin-Datei.",
            },
            {
                "id": "static-ca-tamper-detection",
                "title": "Manipulationserkennung implementiert",
                "description": "Prueft, ob Tamper-Detection-Code in der ChildApp vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "Tamper-Detection in mindestens einer Kotlin-Datei.",
            },
        ),
    },
    {
        "id": "static-readiness-desktop",
        "title": "Statische Analyse: Desktop-App (Electron)",
        "description": "Automatische Analyse der Electron-Desktop-App auf Sicherheit und Build-Konfiguration.",
        "tests": (
            {
                "id": "static-dt-csp",
                "title": "Content Security Policy gesetzt",
                "description": "Prueft, ob ein CSP-Meta-Tag in den Desktop-HTML-Dateien vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "Content-Security-Policy Meta-Tag in desktop/*.html.",
            },
            {
                "id": "static-dt-sri",
                "title": "SRI-Hashes fuer CDN-Scripts",
                "description": "Prueft, ob integrity-Attribute an externen Script-Tags vorhanden sind.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "integrity='sha...' in mindestens einem Script-Tag.",
            },
            {
                "id": "static-dt-electron-builder",
                "title": "electron-builder konfiguriert",
                "description": "Prueft, ob desktop/package.json mit electron-builder-Konfiguration existiert.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "electron-builder Konfiguration in package.json vorhanden.",
            },
            {
                "id": "static-dt-credential-security",
                "title": "Credentials sicher gespeichert",
                "description": "Prueft, ob keytar/safeStorage fuer Credential-Speicherung verwendet wird.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "keytar oder electron.safeStorage in Desktop-JS-Code.",
            },
            {
                "id": "static-dt-session-timeout",
                "title": "Session-Timeout implementiert",
                "description": "Prueft, ob Auto-Logout nach Inaktivitaet im Desktop-Code vorhanden ist.",
                "automationType": "automatic",
                "source": "static-analysis",
                "successCriteria": "Session-Timeout-Logik in Desktop-JavaScript.",
            },
        ),
    },
)

STATIC_ANALYSIS_RESULT_ALIASES = {
    "static-ma-proguard-enabled": "static-ma-proguard-enabled",
    "static-ma-credentials-encrypted": "static-ma-credentials-encrypted",
    "static-ma-imei-fallback": "static-ma-imei-fallback",
    "static-ma-debug-hidden": "static-ma-debug-hidden",
    "static-ma-billing": "static-ma-subscription-check",
    "static-ma-fcm": "static-ma-fcm-working",
    "static-ma-appcheck": "static-ma-firebase-appcheck",
    "static-ca-accessibility": "static-ca-accessibility-active",
    "static-ca-boot-receiver": "static-ca-boot-receiver",
    "static-ca-device-admin": "static-ca-device-admin-code",
    "static-ca-heartbeat": "static-ca-heartbeat",
    "static-ca-fcm-sync": "static-ca-fcm-sync",
    "static-ca-uninstall-prevention": "static-ca-uninstall-prevention",
    "static-ca-overlay": "static-ca-overlay-secure",
    "static-ca-tamper-detection": "static-ca-tamper-detection",
    "static-dt-csp": "static-dt-csp-headers",
    "static-dt-sri": "static-dt-sri-hashes",
    "static-dt-electron-builder": "static-dt-electron-builder",
    "static-dt-credential-security": "static-dt-credential-security",
    "static-dt-session-timeout": "static-dt-session-timeout",
}


@dataclass(frozen=True)
class CommandRequest:
    command: str
    cwd: Path


def sanitize_cwd(raw_cwd: str | None) -> Path:
    if not raw_cwd:
        return REPO_ROOT

    candidate = Path(raw_cwd).expanduser()
    if not candidate.is_absolute():
        candidate = (REPO_ROOT / candidate).resolve()
    else:
        candidate = candidate.resolve()
    return candidate


def as_dict(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def parse_int(value: object, default: int, *, min_value: int, max_value: int) -> int:
    try:
        parsed = int(str(value))
    except (TypeError, ValueError):
        return default
    return max(min_value, min(max_value, parsed))


def bool_from_payload(value: object, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    if isinstance(value, (int, float)):
        return bool(value)
    return default


def trim_output(text: str, max_chars: int = 12000) -> str:
    if len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return f"... [Ausgabe gekuerzt, {omitted} Zeichen entfernt] ...\n" + text[-max_chars:]


def bool_attestation(attestations: dict[str, object], key: str) -> bool:
    return bool_from_payload(attestations.get(key), default=False)


def str_value(data: dict[str, object], key: str) -> str:
    value = data.get(key)
    return value.strip() if isinstance(value, str) else ""


def is_https_url(value: str) -> bool:
    return value.lower().startswith("https://")


def is_email(value: str) -> bool:
    if "@" not in value:
        return False
    local, _, domain = value.partition("@")
    return bool(local and domain and "." in domain)


def make_check(
    check_id: str,
    title: str,
    passed: bool,
    details: str,
    *,
    source: str,
    manual_if_failed: bool = False,
) -> dict[str, object]:
    status = "pass" if passed else ("manual_required" if manual_if_failed else "fail")
    return {
        "id": check_id,
        "title": title,
        "status": status,
        "details": details,
        "source": source,
    }


def evaluate_commissioning_context(context: dict[str, object]) -> dict[str, object]:
    runtime = as_dict(context.get("runtimeConfig"))
    cloud = as_dict(runtime.get("cloud"))
    ai = as_dict(runtime.get("ai"))
    attestations = as_dict(context.get("attestations"))
    play_store = as_dict(context.get("playStoreState"))
    play_checks = as_dict(play_store.get("checks"))
    validation = as_dict(context.get("validationSummary"))
    validation_checks = as_dict(validation.get("checks"))

    project_id = str_value(cloud, "projectId")
    ai_provider = str_value(ai, "provider")
    ai_model = str_value(ai, "model")
    ai_key_ref = str_value(ai, "keyRef")
    ai_prompt = str_value(ai, "systemPrompt")
    app_check_mode = str_value(cloud, "appCheckMode")

    checks: list[dict[str, object]] = []

    checks.append(
        make_check(
            "cloud-project-id",
            "Cloud Project ID gesetzt",
            bool(project_id),
            "Project ID vorhanden." if project_id else "Cloud Project ID fehlt im Runtime-Block.",
            source="runtime",
        )
    )

    ai_complete = bool(ai_provider and ai_model and ai_key_ref and ai_prompt)
    checks.append(
        make_check(
            "ai-runtime-config",
            "AI Runtime vollstaendig",
            ai_complete,
            "AI-Konfiguration ist vollstaendig."
            if ai_complete
            else "provider, model, keyRef und systemPrompt muessen gesetzt sein.",
            source="runtime",
        )
    )

    checks.append(
        make_check(
            "app-check-mode",
            "App Check Mode gesetzt",
            bool(app_check_mode),
            "App Check Mode ist gepflegt." if app_check_mode else "App Check Mode fehlt.",
            source="runtime",
        )
    )

    firestore_ok = bool_from_payload(validation_checks.get("firestoreAccessOk"), default=False)
    checks.append(
        make_check(
            "firestore-enabled",
            "Firestore aktiviert",
            firestore_ok,
            "Firestore-Zugriff wurde in der Full Validation erfolgreich bestaetigt."
            if firestore_ok
            else "Full Validation bestaetigt Firestore-Zugriff noch nicht.",
            source="validation",
        )
    )

    storage_ok = bool_from_payload(validation_checks.get("storageHealthOk"), default=False)
    checks.append(
        make_check(
            "storage-enabled",
            "Firebase Storage aktiviert",
            storage_ok,
            "Backend Storage Health ist erfolgreich bestaetigt."
            if storage_ok
            else "Backend Storage Health ist noch nicht erfolgreich bestaetigt.",
            source="validation",
        )
    )

    functions_ok = bool_from_payload(validation_checks.get("functionsReachable"), default=False)
    checks.append(
        make_check(
            "functions-enabled",
            "Cloud Functions aktiviert",
            functions_ok,
            "Callable Functions sind in der Full Validation erreichbar."
            if functions_ok
            else "Callable Functions sind in der Full Validation noch nicht erreichbar.",
            source="validation",
        )
    )

    project_bound_ok, project_bound_detail = load_local_firebase_binding_status(project_id)
    checks.append(
        make_check(
            "firebase-project-bound",
            "firebase use --add lokal durchgeführt",
            project_bound_ok,
            project_bound_detail,
            source="workspace",
        )
    )

    service_account_ok, service_account_detail = load_local_service_account_status()
    checks.append(
        make_check(
            "service-account-ready",
            "serviceAccountKey.json lokal für setup-admin verfügbar",
            service_account_ok,
            service_account_detail,
            source="workspace",
            manual_if_failed=True,
        )
    )

    attestation_checks = (
        (
            "firebase-auth-enabled",
            "Firebase Authentication aktiviert",
            "Firebase Authentication ist bestaetigt." if bool_attestation(attestations, "firebase-auth-enabled") else "Firebase Authentication ist noch nicht bestaetigt.",
        ),
        (
            "messaging-enabled",
            "Cloud Messaging aktiviert oder bewusst nicht benötigt",
            "Cloud Messaging ist bestaetigt oder als nicht benoetigt dokumentiert."
            if bool_attestation(attestations, "messaging-enabled")
            else "Cloud Messaging ist noch nicht bestaetigt.",
        ),
        (
            "android-master-registered",
            "Android-App com.minimaster.masterapp registriert",
            "Die Eltern-App ist registriert." if bool_attestation(attestations, "android-master-registered") else "Die Eltern-App ist noch nicht bestaetigt registriert.",
        ),
        (
            "android-child-registered",
            "Android-App com.google.pairing registriert",
            "Die Child-App ist registriert." if bool_attestation(attestations, "android-child-registered") else "Die Child-App ist noch nicht bestaetigt registriert.",
        ),
        (
            "parent-panel-verified",
            "Parent Web Panel Login geprüft",
            "Der Parent-Panel-Login ist bestaetigt." if bool_attestation(attestations, "parent-panel-verified") else "Der Parent-Panel-Login ist noch nicht bestaetigt.",
        ),
        (
            "device-sync-verified",
            "Device-Sync zwischen Parent Panel und Child geprüft",
            "Der Device-Sync ist bestaetigt." if bool_attestation(attestations, "device-sync-verified") else "Der Device-Sync ist noch nicht bestaetigt.",
        ),
    )
    for check_id, title, detail in attestation_checks:
        checks.append(
            make_check(
                check_id,
                title,
                bool_attestation(attestations, check_id),
                detail,
                source="attestation",
                manual_if_failed=True,
            )
        )

    play_checks_ok = all(bool_from_payload(value) for value in play_checks.values()) if play_checks else False
    privacy_url = str_value(play_store, "privacyUrl")
    support_email = str_value(play_store, "supportEmail")
    play_privacy_ok = is_https_url(privacy_url)
    play_support_ok = is_email(support_email)
    checks.append(
        make_check(
            "play-store-required-checks-complete",
            "Play-Store-Readiness: Pflicht-Checks vollständig",
            play_checks_ok,
            "Alle Play-Store-Pflichtchecks sind erfuellt."
            if play_checks_ok
            else "Mindestens ein Play-Store-Pflichtcheck ist noch offen.",
            source="playstore",
        )
    )
    checks.append(
        make_check(
            "play-store-privacy-url-valid",
            "Play-Store-Readiness: Privacy-Policy-URL gültig",
            play_privacy_ok,
            "Privacy-Policy-URL ist gueltig gesetzt." if play_privacy_ok else "Privacy-Policy-URL fehlt oder ist kein https-Link.",
            source="playstore",
        )
    )
    checks.append(
        make_check(
            "play-store-support-email-valid",
            "Play-Store-Readiness: Support-/Privacy-E-Mail gültig",
            play_support_ok,
            "Support-/Privacy-E-Mail ist gueltig gesetzt." if play_support_ok else "Support-/Privacy-E-Mail fehlt oder ist ungueltig.",
            source="playstore",
        )
    )

    validation_error_count = parse_int(validation.get("errorCount"), default=-1, min_value=-1, max_value=100000)
    validation_ok = validation_error_count == 0
    checks.append(
        make_check(
            "full-validation-status",
            "Full Validation fehlerfrei",
            validation_ok,
            "Full Validation meldet 0 Fehler."
            if validation_ok
            else (
                "Noch keine Full Validation Ergebnisse verfuegbar."
                if validation_error_count < 0
                else f"Full Validation meldet {validation_error_count} Fehler."
            ),
            source="backend",
        )
    )

    return summarize_commissioning_checks(checks)


def summarize_commissioning_checks(checks: list[dict[str, object]]) -> dict[str, object]:
    status_counts = {
        "pass": sum(1 for item in checks if item.get("status") == "pass"),
        "fail": sum(1 for item in checks if item.get("status") == "fail"),
        "manual_required": sum(1 for item in checks if item.get("status") == "manual_required"),
    }
    overall = "pass"
    if status_counts["fail"] > 0:
        overall = "fail"
    elif status_counts["manual_required"] > 0:
        overall = "manual_required"

    pending = [
        {
            "title": str(item.get("title") or "Offener Punkt"),
            "status": str(item.get("status") or "not_run"),
            "details": str(item.get("details") or ""),
            "source": str(item.get("source") or ""),
        }
        for item in checks
        if item.get("status") != "pass"
    ]

    return {
        "checks": checks,
        "statusCounts": status_counts,
        "overall": overall,
        "pending": pending,
    }


def iter_commissioning_tests() -> Iterable[tuple[dict[str, object], dict[str, object]]]:
    for group in COMMISSIONING_TEST_GROUPS:
        for test in cast(tuple[dict[str, object], ...], group["tests"]):
            yield cast(dict[str, object], group), test


def find_commissioning_test(test_id: str) -> tuple[dict[str, object], dict[str, object]] | None:
    needle = test_id.strip()
    if not needle:
        return None

    for group, test in iter_commissioning_tests():
        if str(test.get("id", "")).strip() == needle:
            return group, test
    return None


def normalize_text_field(value: object, *, field_name: str, max_length: int, required: bool = False) -> str:
    normalized = str(value or "").strip()
    if required and not normalized:
        raise ValueError(f"{field_name} fehlt.")
    if len(normalized) > max_length:
        raise ValueError(f"{field_name} ist zu lang (max. {max_length} Zeichen).")
    return normalized


def format_evidence_details(entry: dict[str, object]) -> str:
    operator = str(entry.get("operator") or "Operator unbekannt")
    notes = str(entry.get("notes") or "")
    evidence_ref = str(entry.get("evidenceRef") or "")
    detail_parts = [f"Manuell protokolliert durch {operator}."]
    if evidence_ref:
        detail_parts.append(f"Evidenz: {evidence_ref}.")
    if notes:
        detail_parts.append(f"Notiz: {notes}")
    return " ".join(detail_parts).strip()


def build_commissioning_evidence_entry(payload: dict[str, object]) -> dict[str, object]:
    test_id = normalize_text_field(payload.get("testId"), field_name="testId", max_length=120, required=True)
    match = find_commissioning_test(test_id)
    if not match:
        raise ValueError("Unbekannter Testfall.")

    group, test = match
    status = normalize_text_field(payload.get("status"), field_name="status", max_length=40, required=True)
    if status not in ALLOWED_EVIDENCE_STATUSES:
        raise ValueError("status muss pass, fail oder manual_required sein.")

    operator = normalize_text_field(payload.get("operator"), field_name="operator", max_length=120, required=True)
    notes = normalize_text_field(payload.get("notes"), field_name="notes", max_length=4000)
    evidence_ref = normalize_text_field(payload.get("evidenceRef"), field_name="evidenceRef", max_length=500)
    documentation_checked = bool_from_payload(payload.get("documentationChecked"), default=False)
    created_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    return {
        "entryId": f"evidence-{uuid4().hex[:12]}",
        "createdAt": created_at,
        "testId": test_id,
        "testTitle": str(test.get("title") or test_id),
        "groupId": str(group.get("id") or ""),
        "groupTitle": str(group.get("title") or ""),
        "automationType": str(test.get("automationType") or "automatic"),
        "source": str(test.get("source") or ""),
        "status": status,
        "operator": operator,
        "notes": notes,
        "evidenceRef": evidence_ref,
        "documentation": str(test.get("documentation") or ""),
        "documentationChecked": documentation_checked,
        "details": format_evidence_details(
            {
                "operator": operator,
                "notes": notes,
                "evidenceRef": evidence_ref,
            }
        ),
    }


def get_commissioning_test_catalog() -> dict[str, object]:
    groups: list[dict[str, object]] = []
    automated_count = 0
    manual_count = 0
    command_count = 0
    documented_count = 0

    for group in COMMISSIONING_TEST_GROUPS:
        tests: list[dict[str, object]] = []
        for test in cast(tuple[dict[str, object], ...], group["tests"]):
            test_copy = dict(test)
            automation_type = str(test_copy.get("automationType", "automatic"))
            if automation_type == "command":
                command_count += 1
            elif automation_type == "documented":
                documented_count += 1
            elif automation_type == "manual":
                manual_count += 1
            else:
                automated_count += 1
            tests.append(test_copy)

        groups.append(
            {
                "id": str(group["id"]),
                "title": str(group["title"]),
                "description": str(group["description"]),
                "tests": tests,
            }
        )

    return {
        "groups": groups,
        "summary": {
            "groupCount": len(groups),
            "testCount": automated_count + manual_count + command_count + documented_count,
            "automatedCount": automated_count,
            "manualCount": manual_count,
            "commandCount": command_count,
            "documentedCount": documented_count,
        },
    }


def append_commissioning_evidence_log(entry: dict[str, object]) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with COMMISSIONING_EVIDENCE_LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_commissioning_evidence_history(limit: int, *, test_id: str | None = None) -> list[dict[str, object]]:
    if not COMMISSIONING_EVIDENCE_LOG_FILE.exists():
        return []

    lines = COMMISSIONING_EVIDENCE_LOG_FILE.read_text(encoding="utf-8").splitlines()
    history: list[dict[str, object]] = []
    filter_test_id = (test_id or "").strip()
    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if filter_test_id and str(entry.get("testId") or "").strip() != filter_test_id:
            continue
        history.append(entry)
        if len(history) >= limit:
            break
    return history


def load_latest_commissioning_evidence() -> dict[str, dict[str, object]]:
    latest: dict[str, dict[str, object]] = {}
    if not COMMISSIONING_EVIDENCE_LOG_FILE.exists():
        return latest

    lines = COMMISSIONING_EVIDENCE_LOG_FILE.read_text(encoding="utf-8").splitlines()
    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        test_id = str(entry.get("testId") or "").strip()
        if not test_id or test_id in latest:
            continue
        latest[test_id] = entry
    return latest


def collect_static_analysis_checks() -> list[dict[str, object]]:
    static_results = {
        f"static-{str(item.get('id') or '').strip()}": item
        for item in run_static_readiness_checks()
        if str(item.get("id") or "").strip()
    }
    collected: list[dict[str, object]] = []

    for _group, test in iter_commissioning_tests():
        automation_type = str(test.get("automationType") or "automatic")
        source = str(test.get("source") or "")
        if automation_type != "automatic" or source != "static-analysis":
            continue

        test_id = str(test.get("id") or "")
        lookup_id = STATIC_ANALYSIS_RESULT_ALIASES.get(test_id, test_id)
        static_result = static_results.get(lookup_id)
        if static_result is None:
            collected.append(
                make_check(
                    test_id,
                    str(test.get("title") or test_id),
                    False,
                    "Kein statisches Analyseergebnis verfügbar.",
                    source="static-analysis",
                )
            )
            continue

        collected.append(
            {
                "id": test_id,
                "title": str(test.get("title") or static_result.get("title") or test_id),
                "status": str(static_result.get("status") or "fail"),
                "details": str(static_result.get("details") or ""),
                "source": "static-analysis",
            }
        )

    return collected


def read_repo_text(relative_path: str) -> str:
    target = REPO_ROOT / relative_path
    if not target.exists() or not target.is_file():
        return ""
    return target.read_text(encoding="utf-8", errors="replace")


def count_marker(text: str, marker: str) -> int:
    return text.count(marker) if text else 0


def build_docs_validation_checks() -> list[dict[str, object]]:
    reviewer_guide = read_repo_text("docs/APP_ACCESS_REVIEWER_GUIDE.md")
    release_register = read_repo_text("docs/RELEASE_EVIDENCE_REGISTER.md")
    permissions_checklist = read_repo_text("docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md")
    store_listing = read_repo_text("docs/STORE_LISTING_AND_IARC_READINESS.md")

    reviewer_placeholders = count_marker(reviewer_guide, "EXTERNAL_INPUT_REQUIRED")
    reviewer_open_checkboxes = count_marker(reviewer_guide, "- [ ]")
    release_open_boxes = count_marker(release_register, "⬜")
    release_open_words = len(re.findall(r"\boffen\b", release_register, re.IGNORECASE)) if release_register else 0
    permissions_not_submitted = len(re.findall(r"Not submitted|\| ⬜ \|", permissions_checklist, re.IGNORECASE)) if permissions_checklist else 0
    store_open_checkboxes = count_marker(store_listing, "- [ ]")

    def docs_check(check_id: str, title: str, passed: bool, details: str) -> dict[str, object]:
        return {
            "id": check_id,
            "title": title,
            "status": "pass" if passed else "fail",
            "details": details,
            "source": "docs-validation",
        }

    return [
        docs_check(
            "doc-reviewer-test-credentials",
            "Reviewer-Test-Credentials verifizieren",
            bool(reviewer_guide) and reviewer_placeholders == 0,
            "Reviewer-Guide ohne Platzhalter in Credentials/Kontaktbereichen."
            if reviewer_guide and reviewer_placeholders == 0 else
            f"Reviewer-Guide enthaelt noch {reviewer_placeholders} Platzhalter vom Typ EXTERNAL_INPUT_REQUIRED.",
        ),
        docs_check(
            "doc-reviewer-submission-checklist",
            "Submission-Checklist fuer Reviewer-Access abgleichen",
            bool(reviewer_guide) and reviewer_placeholders == 0 and reviewer_open_checkboxes == 0,
            "Reviewer-Guide hat keine offenen Checkboxen oder Platzhalter mehr."
            if reviewer_guide and reviewer_placeholders == 0 and reviewer_open_checkboxes == 0 else
            f"Reviewer-Guide hat noch {reviewer_open_checkboxes} offene Checkboxen und {reviewer_placeholders} Platzhalter.",
        ),
        docs_check(
            "doc-release-evidence-register",
            "Release-Evidence-Register abgleichen",
            bool(release_register) and release_open_boxes == 0 and release_open_words == 0,
            "Release-Evidence-Register enthaelt keine offenen Restpunkte mehr."
            if release_register and release_open_boxes == 0 and release_open_words == 0 else
            f"Release-Evidence-Register enthaelt noch {release_open_boxes} offene Checkboxen und {release_open_words} offene Statusmarkierungen.",
        ),
        docs_check(
            "p0-play-permissions",
            "Permissions Declaration eingereicht",
            bool(permissions_checklist) and permissions_not_submitted == 0,
            "Permissions-Checklist enthaelt keine offenen Submission-Marker mehr."
            if permissions_checklist and permissions_not_submitted == 0 else
            f"Permissions-Checklist enthaelt noch {permissions_not_submitted} Marker fuer nicht eingereichte oder offene Submission-Schritte.",
        ),
        docs_check(
            "p0-play-app-access",
            "App Access Guide hinterlegt",
            bool(reviewer_guide) and reviewer_placeholders == 0 and reviewer_open_checkboxes == 0,
            "Reviewer-Guide ist vollstaendig ausgefuellt und finalisiert."
            if reviewer_guide and reviewer_placeholders == 0 and reviewer_open_checkboxes == 0 else
            f"App-Access-Guide ist noch nicht final: {reviewer_placeholders} Platzhalter, {reviewer_open_checkboxes} offene Checkboxen.",
        ),
        docs_check(
            "p0-play-listing",
            "Store Listing final",
            bool(store_listing) and store_open_checkboxes == 0,
            "Store-Listing-Guide enthaelt keine offenen Finalisierungs-Checkboxen mehr."
            if store_listing and store_open_checkboxes == 0 else
            f"Store-Listing-Guide enthaelt noch {store_open_checkboxes} offene Checkboxen.",
        ),
    ]


def run_commissioning_commands(run_commands: bool, timeout_sec: int) -> list[dict[str, object]]:
    if not run_commands:
        return []

    results: list[dict[str, object]] = []
    for command_def in COMMISSIONING_COMMANDS:
        command_request = CommandRequest(
            command=str(command_def["command"]),
            cwd=sanitize_cwd(str(command_def["cwd"])),
        )
        started = time.time()
        command_result = run_command(command_request, timeout_sec=timeout_sec)
        duration_ms = int((time.time() - started) * 1000)
        output = str(command_result.get("output", ""))
        exit_code = parse_int(command_result.get("code"), default=1, min_value=-9999, max_value=9999)
        results.append(
            {
                "id": command_def["id"],
                "label": command_def["label"],
                "command": command_def["command"],
                "cwd": str(command_request.cwd),
                "code": exit_code,
                "status": "pass" if exit_code == 0 else "fail",
                "durationMs": duration_ms,
                "output": trim_output(output),
            }
        )
        if exit_code != 0:
            break
    return results


def append_commissioning_log(entry: dict[str, object]) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with COMMISSIONING_LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_commissioning_history(limit: int) -> list[dict[str, object]]:
    if not COMMISSIONING_LOG_FILE.exists():
        return []

    lines = COMMISSIONING_LOG_FILE.read_text(encoding="utf-8").splitlines()
    history: list[dict[str, object]] = []
    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            history.append(json.loads(line))
        except json.JSONDecodeError:
            continue
        if len(history) >= limit:
            break
    return history


def save_commissioning_evidence(payload: dict[str, object]) -> dict[str, object]:
    entry = build_commissioning_evidence_entry(payload)
    append_commissioning_evidence_log(entry)
    return entry


def evaluate_evidence_coverage(
    evidence_index: dict[str, dict[str, object]]
) -> dict[str, object]:
    """Bewertet, ob alle manuellen und dokumentierten Testfaelle durch Nachweise abgedeckt sind."""
    covered: list[dict[str, object]] = []
    uncovered: list[dict[str, object]] = []
    failed_evidence: list[dict[str, object]] = []

    for group, test in iter_commissioning_tests():
        automation_type = str(test.get("automationType") or "automatic")
        if automation_type not in ("manual", "documented"):
            continue

        test_id = str(test.get("id") or "")
        test_title = str(test.get("title") or test_id)
        group_title = str(group.get("title") or "")
        entry = evidence_index.get(test_id)

        if entry is None:
            uncovered.append(
                {
                    "testId": test_id,
                    "testTitle": test_title,
                    "groupTitle": group_title,
                    "automationType": automation_type,
                    "status": "not_verified",
                    "details": f"Kein Nachweis fuer '{test_title}' vorhanden.",
                }
            )
        elif str(entry.get("status") or "") == "fail":
            failed_evidence.append(
                {
                    "testId": test_id,
                    "testTitle": test_title,
                    "groupTitle": group_title,
                    "automationType": automation_type,
                    "status": "fail",
                    "operator": str(entry.get("operator") or ""),
                    "details": format_evidence_details(entry),
                }
            )
        else:
            covered.append(
                {
                    "testId": test_id,
                    "testTitle": test_title,
                    "groupTitle": group_title,
                    "automationType": automation_type,
                    "status": str(entry.get("status") or "pass"),
                    "operator": str(entry.get("operator") or ""),
                    "details": format_evidence_details(entry),
                }
            )

    total = len(covered) + len(uncovered) + len(failed_evidence)
    coverage_score = round(len(covered) / total * 100) if total > 0 else 100

    evidence_overall: str
    if failed_evidence:
        evidence_overall = "fail"
    elif uncovered:
        evidence_overall = "manual_required"
    else:
        evidence_overall = "pass"

    return {
        "covered": covered,
        "uncovered": uncovered,
        "failedEvidence": failed_evidence,
        "counts": {
            "total": total,
            "covered": len(covered),
            "uncovered": len(uncovered),
            "failed": len(failed_evidence),
        },
        "coverageScore": coverage_score,
        "overall": evidence_overall,
    }


def run_commissioning_suite(
    context: dict[str, object], *, run_commands: bool, timeout_sec: int
) -> dict[str, object]:
    started_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    run_id = f"run-{uuid4().hex[:12]}"

    evaluation = evaluate_commissioning_context(context)
    evaluation_checks = list(cast(list[dict[str, object]], evaluation.get("checks", [])))
    evaluation_checks.extend(collect_static_analysis_checks())
    evaluation_checks.extend(build_docs_validation_checks())
    evaluation = summarize_commissioning_checks(evaluation_checks)
    command_results = run_commissioning_commands(run_commands, timeout_sec)
    evidence_index = load_latest_commissioning_evidence()
    evidence_coverage = evaluate_evidence_coverage(evidence_index)

    command_counts = {
        "pass": sum(1 for item in command_results if item["status"] == "pass"),
        "fail": sum(1 for item in command_results if item["status"] == "fail"),
    }

    pending = list(cast(list[dict[str, object]], evaluation.get("pending", [])))
    for command_result in command_results:
        if command_result["status"] != "pass":
            pending.append(
                {
                    "title": f"Kommando fehlgeschlagen: {command_result['label']}",
                    "status": "fail",
                    "details": f"Exit-Code {command_result['code']} bei '{command_result['command']}'.",
                }
            )

    failed_evidence_items = cast(list[dict[str, object]], evidence_coverage["failedEvidence"])
    for item in failed_evidence_items:
        pending.append(
            {
                "title": f"Nachweis fehlgeschlagen: {item['testTitle']}",
                "status": "fail",
                "details": item["details"],
                "source": "evidence",
            }
        )

    uncovered_items = cast(list[dict[str, object]], evidence_coverage["uncovered"])
    for item in uncovered_items:
        pending.append(
            {
                "title": f"Kein Nachweis: {item['testTitle']}",
                "status": "manual_required",
                "details": item["details"],
                "source": "evidence",
            }
        )

    overall = evaluation["overall"]
    if command_counts["fail"] > 0 or evidence_coverage["overall"] == "fail":
        overall = "fail"
    elif overall == "pass" and evidence_coverage["overall"] == "manual_required":
        overall = "manual_required"

    finished_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    result = {
        "runId": run_id,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "overall": overall,
        "evaluation": evaluation,
        "evidenceCoverage": evidence_coverage,
        "commands": {
            "executed": run_commands,
            "timeoutSec": timeout_sec,
            "results": command_results,
            "statusCounts": command_counts,
        },
        "pending": pending,
        "logFile": str(COMMISSIONING_LOG_FILE),
    }

    append_commissioning_log(result)
    return result


def build_commissioning_run_index(run: dict[str, object] | None) -> dict[str, dict[str, object]]:
    index: dict[str, dict[str, object]] = {}
    if not run:
        return index

    evaluation = as_dict(run.get("evaluation"))
    for item in cast(list[dict[str, object]], evaluation.get("checks") or []):
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue
        index[item_id] = {
            "status": str(item.get("status") or "not_run"),
            "details": str(item.get("details") or ""),
            "updatedAt": str(run.get("finishedAt") or run.get("startedAt") or ""),
            "storage": str(COMMISSIONING_LOG_FILE),
            "origin": "commissioning-run",
        }

    commands = as_dict(run.get("commands"))
    for item in cast(list[dict[str, object]], commands.get("results") or []):
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue
        index[item_id] = {
            "status": str(item.get("status") or "not_run"),
            "details": str(item.get("output") or item.get("details") or ""),
            "updatedAt": str(run.get("finishedAt") or run.get("startedAt") or ""),
            "storage": str(COMMISSIONING_LOG_FILE),
            "origin": "commissioning-command",
        }

    return index


def suite_result_to_register_state(entry: dict[str, object]) -> dict[str, object]:
    result = as_dict(entry.get("result"))
    result_status = str(result.get("status") or "").strip().lower()
    run_status = str(entry.get("status") or "").strip().lower()

    if run_status == "running":
        return {
            "status": "not_run",
            "details": "Suite läuft gerade.",
        }
    if run_status == "error":
        return {
            "status": "fail",
            "details": str(entry.get("error") or "Suite-Lauf mit Fehler beendet."),
        }
    if result_status == "passed":
        return {
            "status": "pass",
            "details": f"Suite erfolgreich beendet (Exit-Code {result.get('returncode', 0)}).",
        }
    if result_status == "failed":
        return {
            "status": "fail",
            "details": str(result.get("reason") or result.get("stderr") or "Suite fehlgeschlagen."),
        }
    if result_status == "skipped":
        return {
            "status": "not_run",
            "details": str(result.get("reason") or "Suite wurde übersprungen."),
        }
    return {
        "status": "not_run",
        "details": "Noch kein Suite-Ergebnis protokolliert.",
    }


def load_latest_suite_results() -> dict[str, dict[str, object]]:
    latest: dict[str, dict[str, object]] = {}
    for entry in load_suite_run_history(limit=MAX_HISTORY_LIMIT):
        suite_id = str(entry.get("suiteId") or entry.get("suite_id") or "").strip()
        if not suite_id or suite_id in latest:
            continue
        latest[suite_id] = entry
    return latest


def repo_relative_path(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def normalize_repo_test_id(relative_path: str) -> str:
    return "repo-" + relative_path.replace("/", "-").replace(".", "-").replace("_", "-")


def repo_test_suite_ref(relative_path: str) -> str | None:
    if relative_path == "test/firestore-rules.test.ts":
        return "backend-rules-structural"
    if relative_path == "test/firestore-rules.emulator.test.ts":
        return "backend-rules-emulator"
    if relative_path.startswith("test/"):
        return "backend-jest"
    if relative_path.startswith("masterApp/src/test/java/"):
        return "android-unit-master"
    if relative_path.startswith("childApp/src/test/java/"):
        return "android-unit-child"
    if relative_path.startswith("masterApp/src/androidTest/java/"):
        return "android-usb-master"
    if relative_path.startswith("childApp/src/androidTest/java/"):
        return "android-usb-child"
    if relative_path == "scripts/tests/test_app_suites.py":
        return "python-tests-app-suites"
    if relative_path == "scripts/tests/test_adb_client.py":
        return "python-tests-adb-client"
    if relative_path == "scripts/tests/test_debug_token.py":
        return "python-tests-debug-token"
    if relative_path == "scripts/tests/test_dual_device_runner.py":
        return "python-tests-dual-device-runner"
    if relative_path == "scripts/tests/test_integration.py":
        return "python-tests-integration"
    if relative_path == "scripts/tests/test_usb_test_runner.py":
        return "python-tests-usb-runner"
    return None


def repo_test_group_title(relative_path: str) -> str:
    if relative_path.startswith("test/integration/"):
        return "Repo-Tests: Integration"
    if relative_path.startswith("test/system/"):
        return "Repo-Tests: System"
    if relative_path.startswith("test/module/"):
        return "Repo-Tests: Module & Hilfsfunktionen"
    if relative_path in {
        "test/admin-panel-helpers.test.ts",
        "test/commissioning-readiness.test.ts",
        "test/web-control-ui.test.ts",
        "test/start-page.test.ts",
    }:
        return "Repo-Tests: Operator- & Web-Panel"
    if relative_path.startswith("test/firestore-rules"):
        return "Repo-Tests: Firestore Rules & Security"
    if relative_path.startswith("test/branch-coverage") or relative_path in {
        "test/coverage-high-impact.test.ts",
        "test/deep-coverage-gaps.test.ts",
        "test/new-coverage.test.ts",
    }:
        return "Repo-Tests: Coverage & Regression"
    if relative_path.startswith("test/") and any(token in relative_path for token in ("support", "legal", "audit")):
        return "Repo-Tests: Support, Legal & Audit"
    if relative_path.startswith("test/"):
        return "Repo-Tests: Backend & Flows"
    if relative_path.startswith("masterApp/src/test/java/"):
        return "Repo-Tests: Android Unit MasterApp"
    if relative_path.startswith("childApp/src/test/java/"):
        return "Repo-Tests: Android Unit ChildApp"
    if relative_path.startswith("masterApp/src/androidTest/java/"):
        return "Repo-Tests: Android Device MasterApp"
    if relative_path.startswith("childApp/src/androidTest/java/"):
        return "Repo-Tests: Android Device ChildApp"
    if relative_path.startswith("iosMasterApp/Tests/"):
        return "Repo-Tests: iOS Unit ParentApp"
    if relative_path.startswith("iosChildApp/Tests/"):
        return "Repo-Tests: iOS Unit ChildApp"
    if relative_path.startswith("scripts/tests/"):
        return "Repo-Tests: Python QA-Infrastruktur"
    return "Repo-Tests: Unsupported / Not Yet Mapped"


def repo_test_description(relative_path: str) -> str:
    if relative_path.startswith("scripts/tests/"):
        return "Automatischer Python-QA-Test aus der lokalen Testinfrastruktur."
    if "/androidTest/" in relative_path:
        return "Automatischer Android-Instrumentation-/Device-Test aus der Codebasis."
    if "/src/test/" in relative_path:
        return "Automatischer Android-Unit-Test aus der Codebasis."
    if relative_path.startswith("iosMasterApp/Tests/") or relative_path.startswith("iosChildApp/Tests/"):
        return "Automatischer iOS-XCTest aus der Codebasis; aktuell ohne direkte Suite-Anbindung im Python-QA-Backend."
    return "Automatischer Repo-Test aus der Codebasis."


def iter_repo_test_inventory_paths() -> list[Path]:
    discovered: list[Path] = []
    for pattern in (
        "test/**/*.test.ts",
        "masterApp/src/test/java/**/*.kt",
        "childApp/src/test/java/**/*.kt",
        "masterApp/src/androidTest/java/**/*Test.kt",
        "childApp/src/androidTest/java/**/*Test.kt",
        "iosMasterApp/Tests/**/*.swift",
        "iosChildApp/Tests/**/*.swift",
        "scripts/tests/test_*.py",
    ):
        for path in REPO_ROOT.glob(pattern):
            if path.is_file():
                discovered.append(path)
    return sorted(set(discovered), key=lambda item: repo_relative_path(item))


def suite_state_for_register_test(
    suite_ref: str | None,
    suite_catalog_index: dict[str, dict[str, object]],
    latest_suite_results: dict[str, dict[str, object]],
) -> tuple[dict[str, object], dict[str, object]]:
    suite_meta = suite_catalog_index.get(suite_ref or "", {}) if suite_ref else {}
    latest_suite = latest_suite_results.get(suite_ref or "", {}) if suite_ref else {}
    if latest_suite:
        state = suite_result_to_register_state(latest_suite)
    elif suite_ref:
        detail = str(suite_meta.get("prereqReason") or "Noch kein Suite-Ergebnis protokolliert.")
        state = {
            "status": "not_run",
            "details": detail,
        }
    else:
        state = {
            "status": "not_run",
            "details": "Noch keine Zuordnung zu einer ausführbaren Suite vorhanden.",
        }
    return state, suite_meta


def build_repo_test_inventory_entries(
    suite_catalog_index: dict[str, dict[str, object]],
    latest_suite_results: dict[str, dict[str, object]],
) -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for path in iter_repo_test_inventory_paths():
        relative_path = repo_relative_path(path)
        suite_ref = repo_test_suite_ref(relative_path)
        register_state, suite_meta = suite_state_for_register_test(suite_ref, suite_catalog_index, latest_suite_results)
        unsupported = not suite_ref
        group_title = "Repo-Tests: Unsupported / Not Yet Mapped" if unsupported else repo_test_group_title(relative_path)
        group_id = "repo-tests-unsupported" if unsupported else group_title.lower().replace(" ", "-").replace(":", "")
        items.append(
            {
                "id": normalize_repo_test_id(relative_path),
                "entryKind": "repo-test",
                "title": relative_path,
                "groupId": group_id,
                "groupTitle": group_title,
                "automationType": "automatic",
                "source": "repo-inventory",
                "status": str(register_state.get("status") or "not_run"),
                "details": str(register_state.get("details") or ""),
                "updatedAt": str(latest_suite_results.get(suite_ref or "", {}).get("timestamp") or latest_suite_results.get(suite_ref or "", {}).get("finishedAt") or ""),
                "storage": str(SUITE_RUN_LOG_FILE if suite_ref else REPO_ROOT / relative_path),
                "origin": "suite-run" if suite_ref else "repo-inventory",
                "documentation": relative_path,
                "successCriteria": f"Die zugeordnete Suite {suite_ref} laeuft fehlerfrei durch." if suite_ref else "Der Test ist im QA-Register inventarisiert und muss separat ausgeführt werden.",
                "description": repo_test_description(relative_path),
                "action": "suite-run" if suite_ref else "commissioning-run",
                "suiteRef": suite_ref or "",
                "command": str(suite_meta.get("command") or ""),
                "prereqsMet": suite_meta.get("prereqsMet") if suite_ref else None,
                "prereqReason": str(suite_meta.get("prereqReason") or "") if suite_ref else "",
                **infer_register_metadata(
                    entry_kind="repo-test",
                    automation_type="automatic",
                    group_id=group_id,
                    group_title=group_title,
                    source="repo-inventory",
                    suite_ref=suite_ref or "",
                    updated_at=str(latest_suite_results.get(suite_ref or "", {}).get("timestamp") or latest_suite_results.get(suite_ref or "", {}).get("finishedAt") or ""),
                    status=str(register_state.get("status") or "not_run"),
                    documentation=relative_path,
                    command=str(suite_meta.get("command") or ""),
                    prereq_reason=str(suite_meta.get("prereqReason") or ""),
                ),
            }
        )
    return items


def build_testing_register() -> dict[str, object]:
    commissioning_catalog = get_commissioning_test_catalog()
    latest_commissioning_run = load_commissioning_history(1)
    latest_commissioning = latest_commissioning_run[0] if latest_commissioning_run else None
    commissioning_index = build_commissioning_run_index(latest_commissioning)
    evidence_index = load_latest_commissioning_evidence()
    suite_catalog = get_suite_catalog()
    latest_suite_results = load_latest_suite_results()
    static_analysis_index = {
        str(item.get("id") or ""): {
            "status": str(item.get("status") or "not_run"),
            "details": str(item.get("details") or ""),
            "updatedAt": "",
            "storage": str(REPO_ROOT / "build" / "test-automation" / "static-readiness-summary.json"),
            "origin": "static-analysis",
        }
        for item in collect_static_analysis_checks()
        if str(item.get("id") or "")
    }
    docs_validation_index = {
        str(item.get("id") or ""): {
            "status": str(item.get("status") or "not_run"),
            "details": str(item.get("details") or ""),
            "updatedAt": "",
            "storage": str(REPO_ROOT / "docs"),
            "origin": "docs-validation",
        }
        for item in build_docs_validation_checks()
        if str(item.get("id") or "")
    }
    suite_catalog_index = {
        str(item.get("suiteId") or ""): item
        for item in cast(list[dict[str, object]], suite_catalog.get("suites") or [])
        if str(item.get("suiteId") or "")
    }

    items: list[dict[str, object]] = []

    for group in cast(list[dict[str, object]], commissioning_catalog.get("groups") or []):
        for test in cast(list[dict[str, object]], group.get("tests") or []):
            test_id = str(test.get("id") or "")
            automation_type = str(test.get("automationType") or "automatic")
            suite_ref = str(test.get("suiteRef") or "")
            register_state = commissioning_index.get(test_id)
            evidence_entry = evidence_index.get(test_id)
            suite_meta: dict[str, object] = {}

            if register_state is None and evidence_entry is not None:
                register_state = {
                    "status": str(evidence_entry.get("status") or "not_run"),
                    "details": str(evidence_entry.get("details") or ""),
                    "updatedAt": str(evidence_entry.get("createdAt") or ""),
                    "storage": str(COMMISSIONING_EVIDENCE_LOG_FILE),
                    "origin": "commissioning-evidence",
                }

            if register_state is None and str(test.get("source") or "") == "static-analysis":
                register_state = static_analysis_index.get(test_id)

            if register_state is None and str(test.get("source") or "") == "docs-validation":
                register_state = docs_validation_index.get(test_id)

            if register_state is None and suite_ref:
                suite_state, suite_meta = suite_state_for_register_test(
                    suite_ref,
                    suite_catalog_index,
                    latest_suite_results,
                )
                latest_suite = latest_suite_results.get(suite_ref, {})
                register_state = {
                    "status": str(suite_state.get("status") or "not_run"),
                    "details": str(suite_state.get("details") or ""),
                    "updatedAt": str(latest_suite.get("timestamp") or latest_suite.get("finishedAt") or ""),
                    "storage": str(SUITE_RUN_LOG_FILE),
                    "origin": "suite-run",
                }

            if register_state is None:
                if automation_type in {"manual", "documented"}:
                    register_state = {
                        "status": "manual_required",
                        "details": "Noch kein manueller Nachweis gespeichert.",
                        "updatedAt": "",
                        "storage": str(COMMISSIONING_EVIDENCE_LOG_FILE),
                        "origin": "commissioning-evidence",
                    }
                else:
                    register_state = {
                        "status": "not_run",
                        "details": "Noch kein automatischer Lauf protokolliert.",
                        "updatedAt": "",
                        "storage": str(COMMISSIONING_LOG_FILE),
                        "origin": "commissioning-run",
                    }

            if not suite_meta and suite_ref:
                suite_meta = suite_catalog_index.get(suite_ref, {})

            action = "protocol" if automation_type in {"manual", "documented"} else ("suite-run" if suite_ref else "commissioning-run")

            items.append(
                {
                    "id": test_id,
                    "entryKind": "commissioning",
                    "title": str(test.get("title") or test_id),
                    "groupId": str(group.get("id") or ""),
                    "groupTitle": str(group.get("title") or ""),
                    "automationType": automation_type,
                    "source": str(test.get("source") or ""),
                    "status": str(register_state.get("status") or "not_run"),
                    "details": str(register_state.get("details") or ""),
                    "updatedAt": str(register_state.get("updatedAt") or ""),
                    "storage": str(register_state.get("storage") or COMMISSIONING_LOG_FILE),
                    "origin": str(register_state.get("origin") or "commissioning"),
                    "documentation": str(test.get("documentation") or ""),
                    "successCriteria": str(test.get("successCriteria") or ""),
                    "action": action,
                    "suiteRef": suite_ref,
                    "command": str(test.get("command") or suite_meta.get("command") or ""),
                    "prereqsMet": suite_meta.get("prereqsMet") if suite_ref else None,
                    "prereqReason": str(suite_meta.get("prereqReason") or "") if suite_ref else "",
                    **infer_register_metadata(
                        entry_kind="commissioning",
                        automation_type=automation_type,
                        group_id=str(group.get("id") or ""),
                        group_title=str(group.get("title") or ""),
                        source=str(test.get("source") or ""),
                        suite_ref=suite_ref,
                        updated_at=str(register_state.get("updatedAt") or ""),
                        status=str(register_state.get("status") or "not_run"),
                        documentation=str(test.get("documentation") or ""),
                        command=str(test.get("command") or suite_meta.get("command") or ""),
                        prereq_reason=str(suite_meta.get("prereqReason") or ""),
                    ),
                }
            )

    for suite in cast(list[dict[str, object]], suite_catalog.get("suites") or []):
        suite_id = str(suite.get("suiteId") or "")
        latest_suite = latest_suite_results.get(suite_id, {})
        register_state = suite_result_to_register_state(latest_suite)
        items.append(
            {
                "id": suite_id,
                "entryKind": "suite",
                "title": str(suite.get("title") or suite_id),
                "groupId": str(suite.get("group") or ""),
                "groupTitle": f"Testsuite: {str(suite.get('group') or 'sonstige')}",
                "automationType": "automatic",
                "source": "suite",
                "status": str(register_state.get("status") or "not_run"),
                "details": str(register_state.get("details") or suite.get("prereqReason") or ""),
                "updatedAt": str(latest_suite.get("timestamp") or latest_suite.get("finishedAt") or ""),
                "storage": str(SUITE_RUN_LOG_FILE),
                "origin": "suite-run",
                "command": str(suite.get("command") or ""),
                "prereqsMet": bool(suite.get("prereqsMet")),
                "prereqReason": str(suite.get("prereqReason") or ""),
                "action": "suite-run",
                **infer_register_metadata(
                    entry_kind="suite",
                    automation_type="automatic",
                    group_id=str(suite.get("group") or ""),
                    group_title=f"Testsuite: {str(suite.get('group') or 'sonstige')}",
                    source="suite",
                    suite_ref=suite_id,
                    updated_at=str(latest_suite.get("timestamp") or latest_suite.get("finishedAt") or ""),
                    status=str(register_state.get("status") or "not_run"),
                    command=str(suite.get("command") or ""),
                    prereq_reason=str(suite.get("prereqReason") or ""),
                ),
            }
        )

    items.extend(build_repo_test_inventory_entries(suite_catalog_index, latest_suite_results))

    summary = {
        "total": len(items),
        "pass": sum(1 for item in items if item["status"] == "pass"),
        "fail": sum(1 for item in items if item["status"] == "fail"),
        "manualRequired": sum(1 for item in items if item["status"] == "manual_required"),
        "notRun": sum(1 for item in items if item["status"] == "not_run"),
        "automatic": sum(1 for item in items if item["automationType"] in {"automatic", "command"}),
        "manual": sum(1 for item in items if item["automationType"] in {"manual", "documented"}),
        "critical": sum(1 for item in items if item.get("severity") == "critical"),
        "high": sum(1 for item in items if item.get("severity") == "high"),
        "blocking": sum(1 for item in items if item.get("blockingForRelease")),
        "stale": sum(1 for item in items if item.get("staleEvidence")),
        "withoutSuccess": sum(1 for item in items if not item.get("hasSuccessfulRun")),
        "unsupported": sum(1 for item in items if item.get("groupId") == "repo-tests-unsupported"),
    }

    return {
        "items": items,
        "summary": summary,
        "storage": {
            "commissioningRuns": str(COMMISSIONING_LOG_FILE),
            "commissioningEvidence": str(COMMISSIONING_EVIDENCE_LOG_FILE),
            "suiteRuns": str(SUITE_RUN_LOG_FILE),
            "latestSummary": str(REPO_ROOT / "build" / "test-automation" / "latest-summary.json"),
        },
    }



def split_command_lines(command: str) -> list[str]:
    return [line.strip() for line in command.splitlines() if line.strip()]



def normalize_program(program: str) -> str:
    return program.strip().strip('"').rstrip().lower()



def ensure_command_allowed(command: str) -> None:
    lines = split_command_lines(command)
    if not lines:
        raise ValueError("Kein Befehl angegeben.")

    for line in lines:
        try:
            parts = shlex.split(line, posix=os.name != "nt")
        except ValueError as exc:
            raise ValueError(f"Befehl konnte nicht geparst werden: {line}") from exc
        if not parts:
            continue
        program = normalize_program(Path(parts[0]).name or parts[0])
        full_program = normalize_program(parts[0])
        if program not in ALLOWED_COMMANDS and full_program not in ALLOWED_COMMANDS:
            allowed = ", ".join(sorted(ALLOWED_COMMANDS))
            raise ValueError(f"Befehl nicht erlaubt: {parts[0]}. Erlaubt: {allowed}")



def run_command(request: CommandRequest, timeout_sec: int | None = None) -> dict[str, object]:
    ensure_command_allowed(request.command)
    if not request.cwd.exists() or not request.cwd.is_dir():
        raise ValueError(f"Arbeitsverzeichnis nicht gefunden: {request.cwd}")

    combined_output: list[str] = []
    exit_code = 0

    for line in split_command_lines(request.command):
        parts = shlex.split(line, posix=os.name != "nt")
        combined_output.append(f"$ {line}\n")
        try:
            process = subprocess.run(
                parts,
                cwd=str(request.cwd),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                env=os.environ.copy(),
                timeout=timeout_sec if timeout_sec and timeout_sec > 0 else None,
            )
            if process.stdout:
                combined_output.append(process.stdout)
            if process.stderr:
                combined_output.append(process.stderr)
            exit_code = process.returncode
            if exit_code != 0:
                break
        except FileNotFoundError:
            if os.name != "nt":
                raise

            # Windows fallback: some tools (npm/firebase) may not resolve directly
            # in this runtime, but work through cmd.exe command resolution.
            process = subprocess.run(
                ["cmd", "/c", line],
                cwd=str(request.cwd),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
                env=os.environ.copy(),
                timeout=timeout_sec if timeout_sec and timeout_sec > 0 else None,
            )
            if process.stdout:
                combined_output.append(process.stdout)
            if process.stderr:
                combined_output.append(process.stderr)
            exit_code = process.returncode
            if exit_code != 0:
                break
        except subprocess.TimeoutExpired as exc:
            if exc.stdout:
                timed_out_stdout = exc.stdout.decode("utf-8", errors="replace") if isinstance(exc.stdout, bytes) else exc.stdout
                combined_output.append(timed_out_stdout)
            if exc.stderr:
                timed_out_stderr = exc.stderr.decode("utf-8", errors="replace") if isinstance(exc.stderr, bytes) else exc.stderr
                combined_output.append(timed_out_stderr)
            combined_output.append(f"\n[timeout] Befehl nach {timeout_sec} Sekunden beendet.\n")
            exit_code = 124
            break

    return {
        "code": exit_code,
        "output": "".join(combined_output),
    }


# ── Testsuite-API-Infrastruktur ──────────────────────────────────────────────

_active_suite_runs: dict[str, dict[str, object]] = {}
_active_suite_lock = threading.Lock()
SUITE_RUN_LOG_FILE = LOG_DIR / "suite_runs.jsonl"


def get_suite_catalog() -> dict[str, object]:
    """Gibt den vollständigen Suite-Katalog als JSON-Struktur zurück."""
    suites_list: list[dict[str, object]] = []
    for suite in TA_SUITES:
        ok, reason = ta_check_prereqs(suite.required_prereqs)
        suites_list.append({
            "suiteId": suite.suite_id,
            "title": suite.title,
            "group": suite.group,
            "command": " ".join(suite.command),
            "prereqs": list(suite.required_prereqs),
            "prereqsMet": ok,
            "prereqReason": reason,
            "timeoutSec": suite.timeout_sec,
        })

    groups: dict[str, list[dict[str, object]]] = {}
    for s in suites_list:
        g = str(s["group"])
        if g not in groups:
            groups[g] = []
        groups[g].append(s)

    return {
        "suites": suites_list,
        "groups": groups,
        "summary": {
            "total": len(suites_list),
            "ready": sum(1 for s in suites_list if s["prereqsMet"]),
            "notReady": sum(1 for s in suites_list if not s["prereqsMet"]),
            "byGroup": {g: len(items) for g, items in groups.items()},
        },
    }


def get_device_status() -> dict[str, object]:
    """Gibt den Status angeschlossener ADB-Geräte zurück."""
    if not adb_available():
        return {"adbAvailable": False, "devices": [], "count": 0}

    devices = AdbClient.list_devices()
    device_list: list[dict[str, object]] = []
    for dev in devices:
        info: dict[str, object] = {
            "serial": dev.serial,
            "state": dev.state,
            "ready": dev.is_ready,
        }
        if dev.is_ready:
            client = AdbClient(serial=dev.serial)
            info["model"] = client.get_device_model()
            info["androidVersion"] = client.get_android_version()
        device_list.append(info)

    return {
        "adbAvailable": True,
        "devices": device_list,
        "count": len(device_list),
        "readyCount": sum(1 for d in device_list if d.get("ready")),
    }


def _run_suite_background(run_id: str, suite_id: str, strict_skips: bool) -> None:
    """Führt eine Suite im Hintergrund-Thread aus."""
    suite_map = {s.suite_id: s for s in TA_SUITES}
    suite = suite_map.get(suite_id)
    if suite is None:
        with _active_suite_lock:
            _active_suite_runs[run_id]["status"] = "error"
            _active_suite_runs[run_id]["error"] = f"Suite nicht gefunden: {suite_id}"
        return

    with _active_suite_lock:
        _active_suite_runs[run_id]["status"] = "running"
        _active_suite_runs[run_id]["startedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    result = ta_run_suite(suite, strict_skips=strict_skips)

    with _active_suite_lock:
        _active_suite_runs[run_id]["status"] = "finished"
        _active_suite_runs[run_id]["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        _active_suite_runs[run_id]["result"] = asdict(result)

    # Log speichern
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_entry = {
        "runId": run_id,
        "suiteId": suite_id,
        "result": asdict(result),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    with SUITE_RUN_LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")


def start_suite_run(suite_id: str, strict_skips: bool = False) -> dict[str, object]:
    """Startet eine Suite asynchron und gibt die Run-ID zurück."""
    run_id = f"suite-{uuid4().hex[:12]}"
    with _active_suite_lock:
        _active_suite_runs[run_id] = {
            "runId": run_id,
            "suiteId": suite_id,
            "status": "queued",
            "startedAt": None,
            "finishedAt": None,
            "result": None,
            "error": None,
        }

    thread = threading.Thread(
        target=_run_suite_background,
        args=(run_id, suite_id, strict_skips),
        daemon=True,
    )
    thread.start()

    return {"runId": run_id, "suiteId": suite_id, "status": "queued"}


def get_suite_run_status(run_id: str) -> dict[str, object] | None:
    """Gibt den Status eines Suite-Laufs zurück."""
    with _active_suite_lock:
        run = _active_suite_runs.get(run_id)
        if run is None:
            return None
        return dict(run)


def load_suite_run_history(limit: int = 25) -> list[dict[str, object]]:
    """Lädt die letzten Suite-Laufergebnisse."""
    if not SUITE_RUN_LOG_FILE.exists():
        return []
    lines = SUITE_RUN_LOG_FILE.read_text(encoding="utf-8").splitlines()
    history: list[dict[str, object]] = []
    for line in reversed(lines):
        if not line.strip():
            continue
        try:
            history.append(json.loads(line))
        except json.JSONDecodeError:
            continue
        if len(history) >= limit:
            break
    return history


def _run_usb_test_background(run_id: str, kwargs: dict[str, object]) -> None:
    """Führt einen USB-Testlauf im Hintergrund-Thread aus."""
    with _active_suite_lock:
        _active_suite_runs[run_id]["status"] = "running"
        _active_suite_runs[run_id]["startedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    try:
        result = run_usb_test(**kwargs, verbose=False)
        with _active_suite_lock:
            _active_suite_runs[run_id]["status"] = "finished"
            _active_suite_runs[run_id]["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            _active_suite_runs[run_id]["result"] = result.to_dict()
    except Exception as exc:
        with _active_suite_lock:
            _active_suite_runs[run_id]["status"] = "error"
            _active_suite_runs[run_id]["error"] = str(exc)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with _active_suite_lock:
        log_entry = dict(_active_suite_runs[run_id])
    with SUITE_RUN_LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")


def _run_dual_device_background(run_id: str, kwargs: dict[str, object]) -> None:
    """Führt einen Dual-Device-Lauf im Hintergrund-Thread aus."""
    with _active_suite_lock:
        _active_suite_runs[run_id]["status"] = "running"
        _active_suite_runs[run_id]["startedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    try:
        result = run_dual_device(**kwargs, verbose=False)
        with _active_suite_lock:
            _active_suite_runs[run_id]["status"] = "finished"
            _active_suite_runs[run_id]["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            _active_suite_runs[run_id]["result"] = result.to_dict()
    except Exception as exc:
        with _active_suite_lock:
            _active_suite_runs[run_id]["status"] = "error"
            _active_suite_runs[run_id]["error"] = str(exc)

    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with _active_suite_lock:
        log_entry = dict(_active_suite_runs[run_id])
    with SUITE_RUN_LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")


class MiniMasterAdminHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/":
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", "/admin-panel/")
            self.end_headers()
            return

        if parsed.path == "/api/runtime-info":
            return self._write_json(
                HTTPStatus.OK,
                {
                    "isOperatorContext": True,
                    "runtime": "python",
                    "repoRoot": str(REPO_ROOT),
                },
            )

        if parsed.path == "/api/commissioning/history":
            query = parse_qs(parsed.query)
            limit = parse_int(
                query.get("limit", [DEFAULT_HISTORY_LIMIT])[0],
                DEFAULT_HISTORY_LIMIT,
                min_value=1,
                max_value=MAX_HISTORY_LIMIT,
            )
            return self._write_json(
                HTTPStatus.OK,
                {
                    "runs": load_commissioning_history(limit),
                    "count": limit,
                },
            )

        if parsed.path == "/api/commissioning/catalog":
            return self._write_json(HTTPStatus.OK, get_commissioning_test_catalog())

        if parsed.path == "/api/testing/register":
            return self._write_json(HTTPStatus.OK, build_testing_register())

        if parsed.path == "/api/commissioning/evidence":
            query = parse_qs(parsed.query)
            limit = parse_int(
                query.get("limit", [DEFAULT_EVIDENCE_LIMIT])[0],
                DEFAULT_EVIDENCE_LIMIT,
                min_value=1,
                max_value=MAX_EVIDENCE_LIMIT,
            )
            test_id = str(query.get("testId", [""])[0]).strip() or None
            return self._write_json(
                HTTPStatus.OK,
                {
                    "entries": load_commissioning_evidence_history(limit, test_id=test_id),
                    "latestByTestId": load_latest_commissioning_evidence(),
                    "count": limit,
                },
            )

        if parsed.path == "/admin-panel":
            self.path = "/admin-panel/"

        # ── Testsuite-API (GET) ──────────────────────────────────────────
        if parsed.path == "/api/readiness/static":
            return self._write_json(HTTPStatus.OK, static_readiness_summary())

        if parsed.path == "/api/suites":
            return self._write_json(HTTPStatus.OK, get_suite_catalog())

        if parsed.path == "/api/suites/devices":
            return self._write_json(HTTPStatus.OK, get_device_status())

        if parsed.path == "/api/suites/history":
            query = parse_qs(parsed.query)
            limit = parse_int(
                query.get("limit", [25])[0], 25, min_value=1, max_value=200,
            )
            return self._write_json(HTTPStatus.OK, {
                "runs": load_suite_run_history(limit),
                "count": limit,
            })

        if parsed.path.startswith("/api/suites/status/"):
            run_id = parsed.path.split("/api/suites/status/", 1)[1].strip("/")
            status = get_suite_run_status(run_id)
            if status is None:
                return self._write_json(HTTPStatus.NOT_FOUND, {"error": "Run nicht gefunden."})
            return self._write_json(HTTPStatus.OK, status)

        return super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/api/commands/run":
            return self._handle_run_command()
        if parsed.path == "/api/commissioning/run":
            return self._handle_run_commissioning()
        if parsed.path == "/api/commissioning/evidence":
            return self._handle_save_commissioning_evidence()

        # ── Testsuite-API (POST) ─────────────────────────────────────────
        if parsed.path == "/api/suites/run":
            return self._handle_run_suite()
        if parsed.path == "/api/suites/usb-test":
            return self._handle_usb_test()
        if parsed.path == "/api/suites/dual-device":
            return self._handle_dual_device_test()

        self._write_json(HTTPStatus.NOT_FOUND, {"error": "Route nicht gefunden."})

    def _handle_run_command(self) -> None:
        try:
            payload = self._read_json_body()
            request = CommandRequest(
                command=str(payload.get("command") or "").strip(),
                cwd=sanitize_cwd(cast(str | None, payload.get("cwd"))),
            )
            result = run_command(request)
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive HTTP boundary
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

        return self._write_json(HTTPStatus.OK, result)

    def _handle_run_commissioning(self) -> None:
        try:
            payload = self._read_json_body()
            context = as_dict(payload.get("context"))
            options = as_dict(payload.get("options"))

            run_commands = bool_from_payload(options.get("runCommands"), default=True)
            timeout_sec = parse_int(
                options.get("timeoutSec"),
                default=DEFAULT_COMMAND_TIMEOUT_SEC,
                min_value=30,
                max_value=7200,
            )

            result = run_commissioning_suite(
                context,
                run_commands=run_commands,
                timeout_sec=timeout_sec,
            )
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive HTTP boundary
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

        return self._write_json(HTTPStatus.OK, result)

    def _handle_save_commissioning_evidence(self) -> None:
        try:
            payload = self._read_json_body()
            entry = save_commissioning_evidence(payload)
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover - defensive HTTP boundary
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})

        return self._write_json(HTTPStatus.OK, entry)

    def _handle_run_suite(self) -> None:
        try:
            payload = self._read_json_body()
            suite_id = str(payload.get("suiteId") or "").strip()
            if not suite_id:
                return self._write_json(HTTPStatus.BAD_REQUEST, {"error": "suiteId fehlt."})
            strict_skips = bool_from_payload(payload.get("strictSkips"), default=False)
            result = start_suite_run(suite_id, strict_skips=strict_skips)
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return self._write_json(HTTPStatus.OK, result)

    def _handle_usb_test(self) -> None:
        try:
            payload = self._read_json_body()
            app_id = str(payload.get("appId") or "").strip()
            if app_id not in ("master", "child"):
                return self._write_json(HTTPStatus.BAD_REQUEST, {"error": "appId muss 'master' oder 'child' sein."})

            run_id = f"usb-{uuid4().hex[:12]}"
            kwargs = {
                "app_id": app_id,
                "serial": str(payload.get("serial") or "auto").strip(),
                "suite": str(payload.get("suite") or "commissioning").strip(),
                "test_filter": str(payload.get("testFilter") or "").strip(),
                "skip_activation": bool_from_payload(payload.get("skipActivation"), default=False),
                "install_apk": bool_from_payload(payload.get("installApk"), default=False),
                "apk_path": str(payload.get("apkPath") or "").strip(),
                "uninstall_first": bool_from_payload(payload.get("uninstallFirst"), default=False),
                "timeout_sec": parse_int(payload.get("timeoutSec"), default=3600, min_value=60, max_value=7200),
            }

            with _active_suite_lock:
                _active_suite_runs[run_id] = {
                    "runId": run_id,
                    "type": "usb-test",
                    "appId": app_id,
                    "status": "queued",
                    "startedAt": None,
                    "finishedAt": None,
                    "result": None,
                    "error": None,
                }

            thread = threading.Thread(
                target=_run_usb_test_background, args=(run_id, kwargs), daemon=True,
            )
            thread.start()
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return self._write_json(HTTPStatus.OK, {"runId": run_id, "status": "queued"})

    def _handle_dual_device_test(self) -> None:
        try:
            payload = self._read_json_body()
            master_serial = str(payload.get("masterSerial") or "").strip()
            child_serial = str(payload.get("childSerial") or "").strip()
            if not master_serial or not child_serial:
                return self._write_json(HTTPStatus.BAD_REQUEST, {
                    "error": "masterSerial und childSerial sind erforderlich."
                })

            run_id = f"dual-{uuid4().hex[:12]}"
            kwargs = {
                "master_serial": master_serial,
                "child_serial": child_serial,
                "install_apk": bool_from_payload(payload.get("installApk"), default=False),
                "master_apk_path": str(payload.get("masterApkPath") or "").strip(),
                "child_apk_path": str(payload.get("childApkPath") or "").strip(),
                "uninstall_first": bool_from_payload(payload.get("uninstallFirst"), default=False),
                "timeout_sec": parse_int(payload.get("timeoutSec"), default=7200, min_value=60, max_value=14400),
                "parallel": bool_from_payload(payload.get("parallel"), default=False),
            }

            with _active_suite_lock:
                _active_suite_runs[run_id] = {
                    "runId": run_id,
                    "type": "dual-device",
                    "status": "queued",
                    "startedAt": None,
                    "finishedAt": None,
                    "result": None,
                    "error": None,
                }

            thread = threading.Thread(
                target=_run_dual_device_background, args=(run_id, kwargs), daemon=True,
            )
            thread.start()
        except ValueError as exc:
            return self._write_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
        except Exception as exc:  # pragma: no cover
            return self._write_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(exc)})
        return self._write_json(HTTPStatus.OK, {"runId": run_id, "status": "queued"})

    def _read_json_body(self) -> dict[str, object]:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError as exc:
            raise ValueError("Ungültiger JSON-Body.") from exc

    def _write_json(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def guess_type(self, path: str | os.PathLike[str]) -> str:
        path_text = str(path)
        if path_text.endswith(".webmanifest"):
            return "application/manifest+json"
        return mimetypes.guess_type(path_text)[0] or "application/octet-stream"



def main(argv: Iterable[str] | None = None) -> int:
    _ = list(argv or sys.argv[1:])
    server = ThreadingHTTPServer((DEFAULT_HOST, DEFAULT_PORT), MiniMasterAdminHandler)
    print(f"MiniMaster Python Admin läuft auf http://{DEFAULT_HOST}:{DEFAULT_PORT}/admin-panel/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer wird beendet…")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
