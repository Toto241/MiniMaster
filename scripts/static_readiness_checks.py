#!/usr/bin/env python3
"""Static code/config analysis for platform readiness checks.

Performs automated verification of MasterApp, ChildApp, and Desktop-App
readiness items by scanning source files, manifests, and build configs.
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class CheckResult:
    check_id: str
    title: str
    passed: bool
    details: str
    source: str


def _file_contains(path: Path, pattern: str, flags: int = 0) -> tuple[bool, list[str]]:
    """Return (found, matching_lines) for a regex pattern in a file."""
    if not path.exists():
        return False, []
    text = path.read_text(encoding="utf-8", errors="replace")
    matches = re.findall(f".*{pattern}.*", text, flags)
    return bool(matches), matches


def _any_kt_contains(base: Path, pattern: str) -> tuple[bool, list[Path]]:
    """Search all .kt files under base for a regex pattern."""
    hits: list[Path] = []
    if not base.exists():
        return False, hits
    for kt_file in base.rglob("*.kt"):
        text = kt_file.read_text(encoding="utf-8", errors="replace")
        if re.search(pattern, text):
            hits.append(kt_file)
    return bool(hits), hits


def _manifest_contains(app_dir: Path, pattern: str) -> bool:
    manifest = app_dir / "src" / "main" / "AndroidManifest.xml"
    if not manifest.exists():
        return False
    return bool(re.search(pattern, manifest.read_text(encoding="utf-8", errors="replace")))


# ── MasterApp Checks ─────────────────────────────────────────────────────

def check_ma_proguard() -> CheckResult:
    build_gradle = REPO_ROOT / "masterApp" / "build.gradle"
    if not build_gradle.exists():
        return CheckResult("ma-proguard-enabled", "ProGuard/R8 in Release-Build", False,
                           "masterApp/build.gradle nicht gefunden.", "static")
    text = build_gradle.read_text(encoding="utf-8", errors="replace")
    # Look for minifyEnabled true in release block
    release_match = re.search(r"release\s*\{[^}]*minifyEnabled\s+(true|false)", text, re.DOTALL)
    if release_match:
        enabled = release_match.group(1) == "true"
        return CheckResult("ma-proguard-enabled", "ProGuard/R8 in Release-Build", enabled,
                           "minifyEnabled=true im Release-Block." if enabled
                           else "minifyEnabled=false → R8/ProGuard ist im Release NICHT aktiv.", "static")
    # Fallback: check isMinifyEnabled
    release_match = re.search(r"release\s*\{[^}]*isMinifyEnabled\s*=\s*(true|false)", text, re.DOTALL)
    if release_match:
        enabled = release_match.group(1) == "true"
        return CheckResult("ma-proguard-enabled", "ProGuard/R8 in Release-Build", enabled,
                           "isMinifyEnabled=true im Release-Block." if enabled
                           else "isMinifyEnabled=false → R8/ProGuard ist im Release NICHT aktiv.", "static")
    return CheckResult("ma-proguard-enabled", "ProGuard/R8 in Release-Build", False,
                       "Keine minifyEnabled-Konfiguration im Release-Block gefunden.", "static")


def check_ma_credentials_encrypted() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "masterApp" / "src" / "main",
                                    r"EncryptedSharedPreferences")
    return CheckResult("ma-credentials-encrypted", "IMEI/SecretKey verschlüsselt gespeichert", found,
                       f"EncryptedSharedPreferences in {len(files)} Datei(en) gefunden." if found
                       else "EncryptedSharedPreferences wird NICHT verwendet – Credentials-Verschlüsselung fehlt.",
                       "static")


def check_ma_imei_fallback() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "masterApp" / "src" / "main",
                                    r"(SDK_INT\s*>=\s*29|SDK_INT\s*>=\s*Build\.VERSION_CODES\.Q|Settings\.Secure\.getString|ANDROID_ID)")
    return CheckResult("ma-imei-fallback", "IMEI-Fallback für Android 10+", found,
                       f"IMEI-Fallback-Logik in {len(files)} Datei(en) gefunden." if found
                       else "Kein IMEI-Fallback für Android 10+ (SDK 29) implementiert.", "static")


def check_ma_debug_hidden() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "masterApp" / "src" / "main",
                                    r"BuildConfig\.DEBUG")
    return CheckResult("ma-debug-hidden", "Debug-Infos in Release-Builds ausgeblendet", found,
                       f"BuildConfig.DEBUG-Guards in {len(files)} Datei(en) gefunden." if found
                       else "Kein BuildConfig.DEBUG-Guard gefunden – Debug-Infos könnten in Release sichtbar sein.",
                       "static")


def check_ma_billing() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "masterApp" / "src" / "main",
                                    r"(BillingClient|queryPurchases|queryProductDetails)")
    return CheckResult("ma-subscription-check", "Abo-Status wird beim Start geprüft", found,
                       f"BillingClient in {len(files)} Datei(en) gefunden." if found
                       else "Kein BillingClient/queryPurchases gefunden.", "static")


def check_ma_fcm() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "masterApp" / "src" / "main",
                                    r"(FirebaseMessaging|onMessageReceived|FcmService)")
    return CheckResult("ma-fcm-working", "FCM Push-Empfang implementiert", found,
                       f"FCM-Service in {len(files)} Datei(en) gefunden." if found
                       else "Kein FCM-Service gefunden.", "static")


def check_ma_appcheck() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "masterApp" / "src" / "main",
                                    r"(FirebaseAppCheck|AppCheckProviderFactory|PlayIntegrity)")
    return CheckResult("ma-firebase-appcheck", "Firebase App Check implementiert", found,
                       f"App Check in {len(files)} Datei(en) gefunden." if found
                       else "Kein Firebase App Check gefunden.", "static")


def check_ma_usage_rules_nav() -> CheckResult:
    patterns = (
        (REPO_ROOT / "masterApp" / "src" / "main" / "java" / "com" / "minimaster" / "masterapp" / "DashboardScreen.kt", r"onUsageRulesClick|onNavigateToUsageRules"),
        (REPO_ROOT / "masterApp" / "src" / "main" / "java" / "com" / "minimaster" / "masterapp" / "MainActivity.kt", r'composable\("usageRules/\{childId\}"\)|navController\.navigate\("usageRules/\$childId"\)'),
        (REPO_ROOT / "masterApp" / "src" / "main" / "java" / "com" / "minimaster" / "masterapp" / "UsageRulesViewModel.kt", r'getHttpsCallable\("setUsageRules"\)'),
    )
    matched_files = []
    for path, pattern in patterns:
        found, _ = _file_contains(path, pattern, re.MULTILINE)
        if found:
            matched_files.append(path.name)
    passed = len(matched_files) == len(patterns)
    return CheckResult(
        "ma-usage-rules-nav",
        "UsageRules-Navigation und Datenspeicherung implementiert",
        passed,
        "Navigation, Screen-Route und setUsageRules-Callable sind vorhanden."
        if passed else
        f"Usage-Rules-Fluss unvollständig; Treffer in: {', '.join(matched_files) or 'keiner Datei' }.",
        "static",
    )


# ── ChildApp Checks ───────────────────────────────────────────────────────

def check_ca_accessibility() -> CheckResult:
    found = _manifest_contains(REPO_ROOT / "childApp", r"AccessibilityService")
    return CheckResult("ca-accessibility-active", "AccessibilityService deklariert", found,
                       "AccessibilityService ist im Manifest deklariert." if found
                       else "AccessibilityService fehlt im Manifest.", "static")


def check_ca_boot_receiver() -> CheckResult:
    found = _manifest_contains(REPO_ROOT / "childApp", r"RECEIVE_BOOT_COMPLETED")
    return CheckResult("ca-boot-receiver", "BootReceiver deklariert", found,
                       "BOOT_COMPLETED-Receiver ist im Manifest registriert." if found
                       else "Kein BOOT_COMPLETED-Receiver im Manifest.", "static")


def check_ca_device_admin() -> CheckResult:
    manifest_found = _manifest_contains(REPO_ROOT / "childApp", r"DeviceAdminReceiver|BIND_DEVICE_ADMIN")
    code_found, _ = _any_kt_contains(
        REPO_ROOT / "childApp" / "src" / "main",
        r"DevicePolicyManager|getSystemService.*DEVICE_POLICY|: DeviceAdminReceiver\(|class\s+\w+\s*:\s*DeviceAdminReceiver",
    )
    return CheckResult("ca-device-admin-code", "DevicePolicyManager implementiert", manifest_found and code_found,
                       "Manifest-Deklaration + Kotlin-Code vorhanden." if (manifest_found and code_found)
                       else ("Manifest deklariert, aber kein DevicePolicyManager-Code vorhanden." if manifest_found
                             else "DeviceAdminReceiver fehlt im Manifest."), "static")


def check_ca_heartbeat() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "childApp" / "src" / "main",
                                    r"(PeriodicWorkRequest|HeartbeatWorker|WorkManager)")
    return CheckResult("ca-heartbeat", "HeartbeatWorker (WorkManager) implementiert", found,
                       f"WorkManager/HeartbeatWorker in {len(files)} Datei(en) gefunden." if found
                       else "Kein WorkManager/HeartbeatWorker gefunden.", "static")


def check_ca_fcm_sync() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "childApp" / "src" / "main",
                                    r"(FirebaseMessaging|onMessageReceived|RuleSyncService)")
    return CheckResult("ca-fcm-sync", "FCM-Regelempfang implementiert", found,
                       f"FCM-Receiver in {len(files)} Datei(en) gefunden." if found
                       else "Kein FCM-Regelempfang gefunden.", "static")


def check_ca_uninstall_prevention() -> CheckResult:
    found, _ = _any_kt_contains(REPO_ROOT / "childApp" / "src" / "main",
                                r"setUninstallBlocked|setApplicationRestrictions")
    return CheckResult("ca-uninstall-prevention", "App-Deinstallation verhindert (Code)", found,
                       "setUninstallBlocked ist implementiert." if found
                       else "setUninstallBlocked ist NICHT implementiert – Deinstallationsschutz fehlt.", "static")


def check_ca_overlay() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "childApp" / "src" / "main",
                                    r"(BlockingOverlay|TYPE_APPLICATION_OVERLAY|SYSTEM_ALERT_WINDOW)")
    return CheckResult("ca-overlay-secure", "BlockingOverlay implementiert", found,
                       f"Overlay-Code in {len(files)} Datei(en) gefunden." if found
                       else "Kein BlockingOverlay/Overlay-Code gefunden.", "static")


def check_ca_tamper_detection() -> CheckResult:
    found, files = _any_kt_contains(REPO_ROOT / "childApp" / "src" / "main",
                                    r"(Settings\.Secure|accessibility_enabled|tamper|TamperDetect)")
    return CheckResult("ca-tamper-detection", "Manipulationserkennung implementiert", found,
                       f"Tamper-Detection in {len(files)} Datei(en) gefunden." if found
                       else "Keine Manipulationserkennung gefunden.", "static")


def check_ca_usage_limits() -> CheckResult:
    patterns = (
        (REPO_ROOT / "childApp" / "src" / "main" / "java" / "com" / "google" / "pairing" / "child" / "ChildProtectionPolicy.kt", r"dailyLimitSeconds|appLimits|perAppLimitsMillis|currentDayUsageMillis > dailyLimitMillis|currentAppUsageMillis > appLimit"),
        (REPO_ROOT / "childApp" / "src" / "main" / "java" / "com" / "google" / "pairing" / "child" / "MiniMasterAccessibilityService.kt", r"dailyLimitMillis|perAppLimitsMillis|parseUsageRules"),
        (REPO_ROOT / "childApp" / "src" / "main" / "java" / "com" / "google" / "pairing" / "RuleSyncService.kt", r"usageRules|updateUsageRules"),
    )
    matched_files = []
    for path, pattern in patterns:
        found, _ = _file_contains(path, pattern, re.MULTILINE)
        if found:
            matched_files.append(path.name)
    passed = len(matched_files) == len(patterns)
    return CheckResult(
        "ca-usage-limits",
        "Usage-Limits werden aus Policy-Code abgeleitet",
        passed,
        "Policy-Parsing, Service-Uebernahme und Sync fuer Usage-Limits sind implementiert."
        if passed else
        f"Usage-Limit-Kette unvollständig; Treffer in: {', '.join(matched_files) or 'keiner Datei' }.",
        "static",
    )


def check_ca_time_windows() -> CheckResult:
    patterns = (
        (REPO_ROOT / "childApp" / "src" / "main" / "java" / "com" / "google" / "pairing" / "child" / "ChildProtectionPolicy.kt", r"allowedHours|allowedStartMinutes|allowedEndMinutes|parseClockMinutes|isOutsideAllowedWindow"),
        (REPO_ROOT / "childApp" / "src" / "main" / "java" / "com" / "google" / "pairing" / "child" / "MiniMasterAccessibilityService.kt", r"allowedStartMinutes|allowedEndMinutes|parseUsageRules"),
        (REPO_ROOT / "childApp" / "src" / "main" / "java" / "com" / "google" / "pairing" / "RuleSyncService.kt", r"usageRules|updateUsageRules"),
    )
    matched_files = []
    for path, pattern in patterns:
        found, _ = _file_contains(path, pattern, re.MULTILINE)
        if found:
            matched_files.append(path.name)
    passed = len(matched_files) == len(patterns)
    return CheckResult(
        "ca-time-windows",
        "Zeitfenster-Policies werden aus Policy-Code abgeleitet",
        passed,
        "Zeitfenster-Parsing, Service-Uebernahme und Sync sind implementiert."
        if passed else
        f"Zeitfenster-Kette unvollständig; Treffer in: {', '.join(matched_files) or 'keiner Datei' }.",
        "static",
    )


# ── Desktop Checks ────────────────────────────────────────────────────────

def check_dt_csp() -> CheckResult:
    desktop = REPO_ROOT / "desktop"
    if not desktop.exists():
        return CheckResult("dt-csp-headers", "CSP in HTML-Dateien", False,
                           "desktop/ Verzeichnis nicht gefunden.", "static")
    found = False
    for html in desktop.glob("*.html"):
        text = html.read_text(encoding="utf-8", errors="replace")
        if re.search(r"Content-Security-Policy", text, re.IGNORECASE):
            found = True
            break
    return CheckResult("dt-csp-headers", "Content Security Policy gesetzt", found,
                       "CSP-Meta-Tag in Desktop-HTML gefunden." if found
                       else "Kein Content-Security-Policy-Meta-Tag in desktop/*.html gefunden.", "static")


def check_dt_sri() -> CheckResult:
    desktop = REPO_ROOT / "desktop"
    if not desktop.exists():
        return CheckResult("dt-sri-hashes", "SRI-Hashes vorhanden", False,
                           "desktop/ Verzeichnis nicht gefunden.", "static")
    found = False
    external_script_found = False
    for html in desktop.glob("*.html"):
        text = html.read_text(encoding="utf-8", errors="replace")
        if re.search(r"<script[^>]+src=['\"]https?://", text, re.IGNORECASE):
            external_script_found = True
        if re.search(r'integrity\s*=\s*["\']sha', text, re.IGNORECASE):
            found = True
            break

    if not external_script_found:
        return CheckResult(
            "dt-sri-hashes",
            "SRI-Hashes für CDN-Scripts",
            True,
            "Keine externen Script-CDNs in desktop/*.html gefunden; SRI nicht erforderlich.",
            "static",
        )

    return CheckResult("dt-sri-hashes", "SRI-Hashes für CDN-Scripts", found,
                       "SRI integrity-Attribute in Desktop-HTML gefunden." if found
                       else "Externe Scripts gefunden, aber ohne SRI integrity-Attribut.", "static")


def check_dt_electron_builder() -> CheckResult:
    desktop = REPO_ROOT / "desktop"
    pkg = desktop / "package.json" if desktop.exists() else None
    if pkg and pkg.exists():
        text = pkg.read_text(encoding="utf-8", errors="replace")
        found = "electron-builder" in text or "build" in text
        return CheckResult("dt-electron-builder", "electron-builder konfiguriert", found,
                           "electron-builder Konfiguration gefunden." if found
                           else "Keine electron-builder Konfiguration in desktop/package.json.", "static")
    return CheckResult("dt-electron-builder", "electron-builder konfiguriert", False,
                       "desktop/package.json nicht vorhanden – kein Build-System eingerichtet.", "static")


def check_dt_credential_security() -> CheckResult:
    desktop = REPO_ROOT / "desktop"
    if not desktop.exists():
        return CheckResult("dt-credential-security", "Credentials sicher gespeichert", False,
                           "desktop/ Verzeichnis nicht gefunden.", "static")
    found = False
    unsafe_persistence = False
    suspicious_patterns = [
        r"\blocalStorage\b",
        r"\bsessionStorage\b",
        r"\.setItem\s*\(",
        r"\b(password|secret)\b",
        r"\b(access|refresh|auth|api)[-_ ]?token\b",
        r"credentials?",
    ]
    for js_file in desktop.glob("*.js"):
        text = js_file.read_text(encoding="utf-8", errors="replace")
        if re.search(r"(keytar|safeStorage|electron\.safeStorage)", text):
            found = True
            break
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in suspicious_patterns):
            unsafe_persistence = True

    if found:
        return CheckResult(
            "dt-credential-security",
            "Credentials nicht als Klartext",
            True,
            "keytar/safeStorage wird für Credential-Speicherung verwendet.",
            "static",
        )

    if not unsafe_persistence:
        return CheckResult(
            "dt-credential-security",
            "Credentials nicht als Klartext",
            True,
            "Keine Hinweise auf persistente Credential-Speicherung im Desktop-Code gefunden.",
            "static",
        )

    return CheckResult(
        "dt-credential-security",
        "Credentials nicht als Klartext",
        False,
        "Persistente Speicher-/Credential-Muster erkannt, aber keine keytar/safeStorage-Nutzung gefunden.",
        "static",
    )


def check_dt_session_timeout() -> CheckResult:
    desktop = REPO_ROOT / "desktop"
    if not desktop.exists():
        return CheckResult("dt-session-timeout", "Session-Timeout implementiert", False,
                           "desktop/ Verzeichnis nicht gefunden.", "static")
    found = False
    for candidate in list(desktop.glob("*.js")) + list(desktop.glob("*.html")):
        text = candidate.read_text(encoding="utf-8", errors="replace")
        if re.search(r"(sessionTimeout|idleTimeout|auto.?logout|inactivity)", text, re.IGNORECASE):
            found = True
            break
    return CheckResult("dt-session-timeout", "Session-Timeout implementiert", found,
                       "Session-Timeout-Logik im Desktop-Code gefunden." if found
                       else "Keine Session-Timeout-Implementierung im Desktop-Code gefunden.", "static")


def check_dt_ipc_messaging() -> CheckResult:
    patterns = (
        (REPO_ROOT / "desktop" / "operator-preload.js", r"contextBridge\.exposeInMainWorld|ipcRenderer\.invoke\(\"run-cli\"|ipcRenderer\.on\(\"cli-output\""),
        (REPO_ROOT / "desktop" / "main.js", r"ipcMain\.handle\(\"run-cli\"|ipcMain\.handle\(\"abort-cli\""),
    )
    matched_files = []
    for path, pattern in patterns:
        found, _ = _file_contains(path, pattern, re.MULTILINE)
        if found:
            matched_files.append(path.name)
    passed = len(matched_files) == len(patterns)
    return CheckResult(
        "dt-ipc-messaging",
        "Electron-IPC zwischen Main und Panels implementiert",
        passed,
        "Preload-Bridge und ipcMain-Handler fuer CLI-/Panel-Kommunikation sind vorhanden."
        if passed else
        f"IPC-Fluss unvollständig; Treffer in: {', '.join(matched_files) or 'keiner Datei' }.",
        "static",
    )


# ── Aggregation ───────────────────────────────────────────────────────────

ALL_CHECKS = [
    # MasterApp
    check_ma_proguard,
    check_ma_credentials_encrypted,
    check_ma_imei_fallback,
    check_ma_debug_hidden,
    check_ma_billing,
    check_ma_fcm,
    check_ma_appcheck,
    check_ma_usage_rules_nav,
    # ChildApp
    check_ca_accessibility,
    check_ca_boot_receiver,
    check_ca_device_admin,
    check_ca_heartbeat,
    check_ca_fcm_sync,
    check_ca_uninstall_prevention,
    check_ca_overlay,
    check_ca_tamper_detection,
    check_ca_usage_limits,
    check_ca_time_windows,
    # Desktop
    check_dt_csp,
    check_dt_sri,
    check_dt_electron_builder,
    check_dt_credential_security,
    check_dt_session_timeout,
    check_dt_ipc_messaging,
]


def run_all_checks() -> list[CheckResult]:
    """Run all static readiness checks and return results."""
    return [check() for check in ALL_CHECKS]


def run_checks_as_dicts() -> list[dict[str, object]]:
    """Run all checks and return as serializable dicts."""
    results = run_all_checks()
    return [
        {
            "id": r.check_id,
            "title": r.title,
            "status": "pass" if r.passed else "fail",
            "details": r.details,
            "source": r.source,
        }
        for r in results
    ]


def summary(results: list[CheckResult] | None = None) -> dict[str, object]:
    """Return a summary of all static checks."""
    if results is None:
        results = run_all_checks()
    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    return {
        "total": len(results),
        "passed": passed,
        "failed": failed,
        "percent": round(passed / len(results) * 100) if results else 0,
        "checks": [
            {
                "id": r.check_id,
                "title": r.title,
                "passed": r.passed,
                "details": r.details,
                "source": r.source,
            }
            for r in results
        ],
    }


if __name__ == "__main__":
    import json

    # Ensure Windows terminals can print non-ASCII readiness details reliably.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

    result = summary()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    raise SystemExit(0 if result["failed"] == 0 else 1)
