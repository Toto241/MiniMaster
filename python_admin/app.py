#!/usr/bin/env python3
from __future__ import annotations

import json
import mimetypes
import os
import shlex
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass
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
from test_automation import SUITES as TA_SUITES, SuiteResult, run_suite as ta_run_suite, check_prereqs as ta_check_prereqs  # noqa: E402
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
                "id": "firebase-services-approved",
                "title": "Firebase Service-Freigaben",
                "description": "Authentication, Firestore, Storage, Functions und Messaging sind aktiviert oder bewusst freigegeben.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Alle Pflicht-Freigaben sind im Operator-Panel bestätigt.",
            },
            {
                "id": "android-app-registration",
                "title": "Android App-Registrierung",
                "description": "MasterApp und ChildApp sind im Projekt registriert und für Tests verwendbar.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Beide Android-App-Registrierungen sind bestätigt.",
            },
            {
                "id": "firebase-project-binding",
                "title": "Firebase Projekt lokal gebunden",
                "description": "Das lokale Arbeitsverzeichnis wurde mit dem produktiven Projekt verknüpft.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "firebase use --add wurde lokal durchgeführt.",
            },
            {
                "id": "service-account-ready",
                "title": "Service Account für Setup bereit",
                "description": "Der lokale Setup-Operator kann mit dem vorgesehenen Service Account arbeiten.",
                "automationType": "manual",
                "source": "attestation",
                "successCriteria": "Der Service-Account-Nachweis ist vorhanden.",
            },
        ),
    },
    {
        "id": "release-readiness",
        "title": "Release & Store-Readiness",
        "description": "Deckt die bereits identifizierten Go-Live-Blocker rund um Play Store und Gesamtsystem ab.",
        "tests": (
            {
                "id": "play-store-readiness",
                "title": "Play Store Readiness",
                "description": "Alle Play-Store-Pflichtpunkte sowie Privacy-URL und Support-Adresse sind gepflegt.",
                "automationType": "manual",
                "source": "playstore",
                "successCriteria": "Alle Play-Store-Checks sind erfüllt und die Metadaten sind gültig.",
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
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-11-master-app-registration--auth",
            },
            {
                "id": "doc-generate-pairing-code",
                "title": "Test 1.2: Generate Pairing Code",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-12-generate-pairing-code",
            },
            {
                "id": "doc-child-app-registration-code",
                "title": "Test 1.3: Child App Registration via Code",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-13-child-app-registration-via-code",
            },
            {
                "id": "doc-create-task",
                "title": "Test 2.1: Create a Task",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-21-create-a-task",
            },
            {
                "id": "doc-child-submits-task-photo",
                "title": "Test 2.2: Child Submits Task with Photo",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-22-child-submits-task-with-photo",
            },
            {
                "id": "doc-task-approval-workflow",
                "title": "Test 2.3: Complete Task Approval Workflow",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
                "documentation": "docs/PHYSICAL_COMMISSIONING_CHECKLIST.md#test-23-complete-task-approval-workflow",
            },
            {
                "id": "doc-create-app-blocking-rule",
                "title": "Test 3.1: Create App Blocking Rule",
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
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
                "description": "Manueller Abnahmetest aus der Physical Commissioning Checklist.",
                "automationType": "documented",
                "source": "docs",
                "successCriteria": "Ablauf gemaess docs/PHYSICAL_COMMISSIONING_CHECKLIST.md erfolgreich durchlaufen und dokumentiert.",
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
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Store Listing ist in der Play Console als vollstaendig markiert.",
            },
            {
                "id": "p0-play-permissions",
                "title": "Permissions Declaration eingereicht",
                "description": "Accessibility/Usage/Overlay-Begruendungen sind eingereicht.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "Permissions Declaration ist eingereicht und consistent mit App-Verhalten.",
            },
            {
                "id": "p0-play-app-access",
                "title": "App Access Guide hinterlegt",
                "description": "Reviewer-Anleitung mit Test-Credentials ist in der Play Console hinterlegt.",
                "automationType": "manual",
                "source": "p0-blocker",
                "successCriteria": "App Access Guide ist hochgeladen und aktuell.",
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

    firebase_services_ok = all(
        bool_attestation(attestations, key)
        for key in [
            "firebase-auth-enabled",
            "firestore-enabled",
            "storage-enabled",
            "functions-enabled",
            "messaging-enabled",
        ]
    )
    checks.append(
        make_check(
            "firebase-services-approved",
            "Firebase Service-Freigaben",
            firebase_services_ok,
            "Alle erforderlichen Firebase-Services sind bestaetigt."
            if firebase_services_ok
            else "Mindestens eine Service-Freigabe fehlt in den manuellen Nachweisen.",
            source="attestation",
            manual_if_failed=True,
        )
    )

    app_registration_ok = bool_attestation(attestations, "android-master-registered") and bool_attestation(
        attestations, "android-child-registered"
    )
    checks.append(
        make_check(
            "android-app-registration",
            "Android App-Registrierung",
            app_registration_ok,
            "MasterApp und ChildApp sind registriert."
            if app_registration_ok
            else "Mindestens eine Android-App-Registrierung ist offen.",
            source="attestation",
            manual_if_failed=True,
        )
    )

    project_binding_ok = bool_attestation(attestations, "firebase-project-bound")
    checks.append(
        make_check(
            "firebase-project-binding",
            "Firebase Projekt lokal gebunden",
            project_binding_ok,
            "firebase use --add wurde bestaetigt."
            if project_binding_ok
            else "Lokale Firebase-Projektbindung ist noch nicht bestaetigt.",
            source="attestation",
            manual_if_failed=True,
        )
    )

    service_account_ok = bool_attestation(attestations, "service-account-ready")
    checks.append(
        make_check(
            "service-account-ready",
            "Service Account fuer Setup bereit",
            service_account_ok,
            "Service Account Nachweis liegt vor."
            if service_account_ok
            else "serviceAccountKey Nachweis fehlt.",
            source="attestation",
            manual_if_failed=True,
        )
    )

    play_checks_ok = all(bool_from_payload(value) for value in play_checks.values()) if play_checks else False
    privacy_url = str_value(play_store, "privacyUrl")
    support_email = str_value(play_store, "supportEmail")
    play_meta_ok = is_https_url(privacy_url) and is_email(support_email)
    checks.append(
        make_check(
            "play-store-readiness",
            "Play Store Readiness",
            play_checks_ok and play_meta_ok,
            "Play Store Readiness ist vollstaendig."
            if play_checks_ok and play_meta_ok
            else "Play-Store Checks, Privacy-URL (https) oder Support-E-Mail sind unvollstaendig.",
            source="playstore",
            manual_if_failed=True,
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


def build_testing_register() -> dict[str, object]:
    commissioning_catalog = get_commissioning_test_catalog()
    latest_commissioning_run = load_commissioning_history(1)
    latest_commissioning = latest_commissioning_run[0] if latest_commissioning_run else None
    commissioning_index = build_commissioning_run_index(latest_commissioning)
    evidence_index = load_latest_commissioning_evidence()
    suite_catalog = get_suite_catalog()
    latest_suite_results = load_latest_suite_results()

    items: list[dict[str, object]] = []

    for group in cast(list[dict[str, object]], commissioning_catalog.get("groups") or []):
        for test in cast(list[dict[str, object]], group.get("tests") or []):
            test_id = str(test.get("id") or "")
            automation_type = str(test.get("automationType") or "automatic")
            register_state = commissioning_index.get(test_id)
            evidence_entry = evidence_index.get(test_id)

            if register_state is None and evidence_entry is not None:
                register_state = {
                    "status": str(evidence_entry.get("status") or "not_run"),
                    "details": str(evidence_entry.get("details") or ""),
                    "updatedAt": str(evidence_entry.get("createdAt") or ""),
                    "storage": str(COMMISSIONING_EVIDENCE_LOG_FILE),
                    "origin": "commissioning-evidence",
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
                    "action": "protocol" if automation_type in {"manual", "documented"} else "commissioning-run",
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
            }
        )

    summary = {
        "total": len(items),
        "pass": sum(1 for item in items if item["status"] == "pass"),
        "fail": sum(1 for item in items if item["status"] == "fail"),
        "manualRequired": sum(1 for item in items if item["status"] == "manual_required"),
        "notRun": sum(1 for item in items if item["status"] == "not_run"),
        "automatic": sum(1 for item in items if item["automationType"] in {"automatic", "command"}),
        "manual": sum(1 for item in items if item["automationType"] in {"manual", "documented"}),
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
