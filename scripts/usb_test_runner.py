#!/usr/bin/env python3
"""
Python USB-Testlauf-Runner für MiniMaster Android-Apps.

Ersetzt `run-usb-tests.ps1` vollständig. Ablauf:
  1. Gerät prüfen (adb devices)
  2. APK installieren (optional)
  3. Challenge anfordern
  4. HMAC-Token generieren
  5. Debug-Session aktivieren
  6. Instrumented Tests ausführen (Gradle)
  7. Debug-Session deaktivieren
  8. XML-Testergebnisse parsen
  9. JSON-Ergebnis + Ampelausgabe
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import asdict, dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
IS_WINDOWS = os.name == "nt"

# Importiere die lokalen Module
sys.path.insert(0, str(Path(__file__).resolve().parent))
from adb_client import AdbClient, InstrumentedTestSummary, TestCaseResult, resolve_latest_apk  # noqa: E402
from debug_token import generate_token, PACKAGES  # noqa: E402

GRADLE_WRAPPER = REPO_ROOT / ("gradlew.bat" if IS_WINDOWS else "gradlew")

APP_MODULES = {
    "master": ":masterApp",
    "child": ":childApp",
}

COMMISSIONING_FILTERS = {
    "master": [
        "com.minimaster.masterapp.MasterAppE2ETest",
        "com.minimaster.masterapp.CommissioningMasterPhase1UiTest",
        "com.minimaster.masterapp.CommissioningMasterUiFlowTest",
    ],
    "child": [
        "com.google.pairing.PairingScreenUITest",
        "com.google.pairing.DeepLinkE2ETest",
        "com.google.pairing.CommissioningChildUiFlowTest",
    ],
}


def _supported_java_home() -> Path | None:
    """Sucht ein unterstütztes JDK (17 oder 21) für Android-Builds."""
    candidates: list[Path] = []
    for env_name in ("JAVA17_HOME", "JAVA21_HOME", "JAVA_HOME"):
        value = os.environ.get(env_name)
        if value:
            candidates.append(Path(value))

    if IS_WINDOWS:
        candidates.extend([
            Path("C:/Program Files/Android/Android Studio/jbr"),
            Path("C:/Program Files/Android/Android Studio1/jbr"),
            Path("C:/Program Files/Java/jdk-17"),
            Path("C:/Program Files/Java/jdk-21"),
        ])

    for candidate in candidates:
        if not candidate.exists():
            continue
        java_bin = candidate / "bin" / ("java.exe" if IS_WINDOWS else "java")
        if java_bin.exists():
            return candidate
    return None


@dataclass
class UsbTestRunResult:
    app_id: str
    serial: str
    suite: str
    requested_android_version: str = ""
    detected_android_version: str = ""
    steps: list[dict[str, object]] = field(default_factory=list)
    test_summary: InstrumentedTestSummary | None = None
    gradle_exit_code: int = -1
    overall_status: str = "not_started"  # passed, failed, error, skipped
    duration_sec: float = 0.0
    error: str | None = None
    reason: str | None = None

    def to_dict(self) -> dict[str, object]:
        d = asdict(self)
        d["status"] = self.overall_status
        return d


def _log_step(result: UsbTestRunResult, step_id: str, title: str, status: str, details: str = "") -> None:
    result.steps.append({
        "id": step_id,
        "title": title,
        "status": status,
        "details": details,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })


def _known_install_blocker_reason(adb_output: str) -> str | None:
    normalized = adb_output.upper()
    if "INSTALL_FAILED_USER_RESTRICTED" in normalized or "INSTALL CANCELED BY USER" in normalized:
        return (
            "Gerät blockiert die APK-Installation über USB "
            "(INSTALL_FAILED_USER_RESTRICTED). Gerät entsperren und die Installation "
            "am Gerät bestätigen; bei OEM-ROMs wie MIUI/HyperOS zusätzlich 'Install via USB' "
            "bzw. 'USB debugging (Security settings)' aktivieren. Danach den USB-Testlauf erneut starten."
        )
    return None


def parse_junit_xml(xml_dir: Path) -> InstrumentedTestSummary:
    """Parst JUnit-XML-Testergebnisse aus dem Gradle-Ausgabeverzeichnis."""
    summary = InstrumentedTestSummary()
    if not xml_dir.exists():
        return summary

    for xml_file in xml_dir.rglob("*.xml"):
        try:
            tree = ET.parse(xml_file)
        except ET.ParseError:
            continue

        root = tree.getroot()
        for testsuite in ([root] if root.tag == "testsuite" else root.iter("testsuite")):
            summary.total += int(testsuite.get("tests", "0"))
            summary.failed += int(testsuite.get("failures", "0")) + int(testsuite.get("errors", "0"))
            summary.skipped += int(testsuite.get("skipped", "0"))

            for testcase in testsuite.iter("testcase"):
                classname = testcase.get("classname", "")
                name = testcase.get("name", "")
                failure = testcase.find("failure")
                error = testcase.find("error")
                if failure is not None or error is not None:
                    msg_elem = failure if failure is not None else error
                    msg_text = (msg_elem.text or "").strip()[:500] if msg_elem is not None else ""
                    summary.failures.append(TestCaseResult(
                        classname=classname,
                        name=name,
                        passed=False,
                        message=msg_text,
                    ))

    summary.passed = summary.total - summary.failed - summary.skipped
    return summary


def run_usb_test(
    app_id: str,
    serial: str = "auto",
    suite: str = "default",
    test_filter: str = "",
    skip_activation: bool = False,
    install_apk: bool = False,
    apk_path: str = "",
    uninstall_first: bool = False,
    timeout_sec: int = 3600,
    expected_android_version: str = "",
    verbose: bool = True,
) -> UsbTestRunResult:
    """
    Führt den vollständigen USB-Testlauf durch.

    Args:
        app_id: "master" oder "child"
        serial: ADB-Serial ("auto" = erstes Gerät)
        suite: "default" oder "commissioning"
        test_filter: Optionaler Gradle-Testfilter
        skip_activation: Challenge/Token überspringen
        install_apk: APK vor Test installieren
        apk_path: Expliziter APK-Pfad
        uninstall_first: App vor Install deinstallieren
        timeout_sec: Timeout für Gradle-Lauf
        verbose: Console-Ausgabe

    Returns: UsbTestRunResult mit allen Details
    """
    started = time.perf_counter()
    result = UsbTestRunResult(
        app_id=app_id,
        serial=serial,
        suite=suite,
        requested_android_version=str(expected_android_version or "").strip(),
    )
    package = PACKAGES.get(app_id)
    app_module = APP_MODULES.get(app_id)

    if not package or not app_module:
        result.error = f"Ungültige App-ID: {app_id}"
        result.overall_status = "error"
        return result

    def _print(msg: str) -> None:
        if verbose:
            print(msg)

    # ── Schritt 1: Gerät prüfen ──────────────────────────────────────────
    _print("\n▶  Schritt 1/8: ADB-Gerät prüfen")
    devices = AdbClient.list_devices()
    ready_devices = [d for d in devices if d.is_ready]

    if not ready_devices:
        msg = "Kein ADB-Gerät gefunden. USB-Kabel und USB-Debugging prüfen."
        _log_step(result, "check-device", "Gerät prüfen", "fail", msg)
        _print(f"✘  {msg}")
        result.error = msg
        result.overall_status = "error"
        result.duration_sec = round(time.perf_counter() - started, 2)
        return result

    if serial == "auto":
        serial = ready_devices[0].serial
        result.serial = serial
        _print(f"✔  Gerät automatisch gewählt: {serial}")
    else:
        result.serial = serial
        if not any(d.serial == serial for d in ready_devices):
            msg = f"Gerät {serial} nicht gefunden oder nicht bereit."
            _log_step(result, "check-device", "Gerät prüfen", "fail", msg)
            _print(f"✘  {msg}")
            result.error = msg
            result.overall_status = "error"
            result.duration_sec = round(time.perf_counter() - started, 2)
            return result
        _print(f"✔  Gerät: {serial}")

    adb = AdbClient(serial=serial)
    model = adb.get_device_model()
    android_ver = adb.get_android_version()
    result.detected_android_version = android_ver
    _log_step(result, "check-device", "Gerät prüfen", "pass",
              f"{serial} ({model}, Android {android_ver})")

    if result.requested_android_version and android_ver != result.requested_android_version:
        msg = (
            f"Verbundenes Gerät hat Android {android_ver}; erwartet war Android {result.requested_android_version}. "
            "Für einen versionsspezifischen Kompatibilitätslauf bitte passendes Gerät oder AVD verbinden."
        )
        _log_step(result, "check-android-version", "Android-Version prüfen", "fail", msg)
        _print(f"✘  {msg}")
        result.error = msg
        result.reason = msg
        result.overall_status = "error"
        result.duration_sec = round(time.perf_counter() - started, 2)
        return result

    # ── Schritt 2: APK installieren (optional) ───────────────────────────
    if install_apk:
        _print(f"\n▶  Schritt 2/8: APK installieren ({app_id})")
        resolved_apk = Path(apk_path) if apk_path else resolve_latest_apk(app_id)
        if resolved_apk is None or not resolved_apk.exists():
            msg = "Keine APK gefunden. Zuerst bauen oder --apk-path angeben."
            _log_step(result, "install-apk", "APK installieren", "fail", msg)
            _print(f"✘  {msg}")
            result.error = msg
            result.overall_status = "error"
            result.duration_sec = round(time.perf_counter() - started, 2)
            return result

        if uninstall_first:
            _print(f"   Deinstalliere: {package}")
            adb.uninstall_package(package)

        _print(f"   Installiere: {resolved_apk}")
        install_result = adb.install_apk(resolved_apk)
        if not install_result.ok:
            blocker_reason = _known_install_blocker_reason(install_result.output)
            if blocker_reason:
                msg = f"{blocker_reason}\nADB-Ausgabe:\n{install_result.output}"
                _log_step(result, "install-apk", "APK installieren", "skipped", msg)
                _print(f"⚠  {blocker_reason}")
                result.error = install_result.output.strip()
                result.reason = blocker_reason
                result.overall_status = "skipped"
                result.duration_sec = round(time.perf_counter() - started, 2)
                return result

            msg = f"APK-Installation fehlgeschlagen: {install_result.output}"
            _log_step(result, "install-apk", "APK installieren", "fail", msg)
            _print(f"✘  {msg}")
            result.error = msg
            result.overall_status = "error"
            result.duration_sec = round(time.perf_counter() - started, 2)
            return result

        _print("✔  APK installiert.")
        _log_step(result, "install-apk", "APK installieren", "pass", str(resolved_apk))
    else:
        _log_step(result, "install-apk", "APK installieren", "skipped", "Nicht angefordert")

    # ── Schritt 3-5: Challenge → Token → Aktivierung ────────────────────
    if not skip_activation:
        _print(f"\n▶  Schritt 3/8: Challenge anfordern ({app_id})")
        challenge_result = adb.request_debug_challenge_result(package)
        challenge = challenge_result.challenge
        if challenge is None:
            msg = challenge_result.reason or "Challenge nicht aus Logcat lesbar."
            if challenge_result.details:
                msg = f"{msg}\n{challenge_result.details}"
            _log_step(result, "get-challenge", "Challenge anfordern", "fail", msg)
            _print(f"✘  {msg}")
            result.error = msg
            result.reason = challenge_result.reason or msg
            result.overall_status = "error"
            result.duration_sec = round(time.perf_counter() - started, 2)
            return result
        _print(f"✔  Challenge: {challenge}")
        _log_step(result, "get-challenge", "Challenge anfordern", "pass", f"Challenge: {challenge[:16]}...")

        _print("\n▶  Schritt 4/8: HMAC-Token generieren")
        try:
            token = generate_token(app_id, challenge)
        except ValueError as exc:
            msg = str(exc)
            _log_step(result, "generate-token", "Token generieren", "fail", msg)
            _print(f"✘  {msg}")
            result.error = msg
            result.overall_status = "error"
            result.duration_sec = round(time.perf_counter() - started, 2)
            return result
        _print("✔  Token generiert.")
        _log_step(result, "generate-token", "Token generieren", "pass", "HMAC-SHA256 berechnet")

        _print("\n▶  Schritt 5/8: Debug-Session aktivieren")
        activated = adb.activate_debug_session(package, token)
        if not activated:
            msg = "Aktivierung fehlgeschlagen (Token ungültig oder Session abgelaufen)."
            _log_step(result, "activate-session", "Session aktivieren", "fail", msg)
            _print(f"✘  {msg}")
            result.error = msg
            result.overall_status = "error"
            result.duration_sec = round(time.perf_counter() - started, 2)
            return result
        _print("✔  Debug-Session aktiviert.")
        _log_step(result, "activate-session", "Session aktivieren", "pass", "Session aktiv")
    else:
        _print("\n   Schritte 3-5 übersprungen (--skip-activation)")
        _log_step(result, "get-challenge", "Challenge anfordern", "skipped", "Übersprungen")
        _log_step(result, "generate-token", "Token generieren", "skipped", "Übersprungen")
        _log_step(result, "activate-session", "Session aktivieren", "skipped", "Übersprungen")

    # ── Schritt 6: Instrumented Tests ────────────────────────────────────
    _print(f"\n▶  Schritt 6/8: Instrumented Tests ausführen ({app_module})")

    test_filters: list[str] = []
    if test_filter:
        test_filters = [test_filter]
    elif suite == "commissioning":
        test_filters = COMMISSIONING_FILTERS.get(app_id, [])

    xml_results_dir = REPO_ROOT / f"{app_id}App" / "build" / "outputs" / "androidTest-results" / "connected"
    if xml_results_dir.exists():
        import shutil
        shutil.rmtree(xml_results_dir, ignore_errors=True)

    env = os.environ.copy()
    env["ANDROID_SERIAL"] = serial
    java_home = _supported_java_home()
    if java_home:
        env["JAVA_HOME"] = str(java_home)
        env["PATH"] = str(java_home / "bin") + os.pathsep + env.get("PATH", "")

    gradle_exit = 0
    gradle_cmd = [str(GRADLE_WRAPPER)]
    if IS_WINDOWS:
        gradle_cmd = ["cmd", "/c", str(GRADLE_WRAPPER)]

    if not test_filters:
        cmd = gradle_cmd + [f"{app_module}:connectedDebugAndroidTest"]
        _print(f"   Gradle: {' '.join(cmd[-2:])}")
        proc = subprocess.run(
            cmd, cwd=str(REPO_ROOT), capture_output=True, text=True,
            encoding="utf-8", errors="replace", env=env,
            timeout=timeout_sec, check=False,
        )
        gradle_exit = proc.returncode
    else:
        for tf in test_filters:
            _print(f"   Testklasse: {tf}")
            cmd = gradle_cmd + [
                f"{app_module}:connectedDebugAndroidTest",
                f"-Pandroid.testInstrumentationRunnerArguments.class={tf}",
            ]
            proc = subprocess.run(
                cmd, cwd=str(REPO_ROOT), capture_output=True, text=True,
                encoding="utf-8", errors="replace", env=env,
                timeout=timeout_sec, check=False,
            )
            if proc.returncode != 0:
                gradle_exit = proc.returncode
                break

    result.gradle_exit_code = gradle_exit
    _log_step(result, "run-tests", "Instrumented Tests",
              "pass" if gradle_exit == 0 else "fail",
              f"Gradle Exit-Code: {gradle_exit}")

    # ── Schritt 7: Session deaktivieren ──────────────────────────────────
    if not skip_activation:
        _print("\n▶  Schritt 7/8: Debug-Session deaktivieren")
        adb.deactivate_debug_session(package)
        _print("✔  Session deaktiviert.")
        _log_step(result, "deactivate-session", "Session deaktivieren", "pass", "")
    else:
        _log_step(result, "deactivate-session", "Session deaktivieren", "skipped", "")

    # ── Schritt 8: Ergebnisse parsen ─────────────────────────────────────
    _print("\n▶  Schritt 8/8: Testergebnisse auswerten")
    summary = parse_junit_xml(xml_results_dir)
    result.test_summary = summary
    _log_step(result, "parse-results", "Ergebnisse parsen", "pass",
              f"Gesamt: {summary.total}, Bestanden: {summary.passed}, "
              f"Fehlgeschlagen: {summary.failed}, Übersprungen: {summary.skipped}")

    # ── Gesamtstatus ─────────────────────────────────────────────────────
    if gradle_exit != 0 or summary.failed > 0:
        result.overall_status = "failed"
    elif summary.total == 0:
        result.overall_status = "error" if gradle_exit != 0 else "passed"
    else:
        result.overall_status = "passed"

    result.duration_sec = round(time.perf_counter() - started, 2)

    # ── Ampelausgabe ─────────────────────────────────────────────────────
    _print("")
    _print("═" * 46)
    _print(f"  TEST-ERGEBNISSE: {app_id.upper()}-APP")
    _print("═" * 46)

    if summary.total == 0 and gradle_exit != 0:
        _print("  FEHLER (keine XML-Ergebnisse)")
        _print(f"  Gradle-Exit-Code: {gradle_exit}")
    elif summary.failed > 0 or gradle_exit != 0:
        _print("  FEHLGESCHLAGEN")
        _print(f"  Gesamt:         {summary.total}")
        _print(f"  Fehlgeschlagen: {summary.failed}")
        _print(f"  Übersprungen:   {summary.skipped}")
        for tc in summary.failures:
            _print(f"    ✘ {tc.classname}.{tc.name}")
            if tc.message:
                _print(f"      {tc.message[:200]}")
    else:
        _print("  BESTANDEN")
        _print(f"  Gesamt:       {summary.total}")
        _print(f"  Bestanden:    {summary.passed}")
        _print(f"  Übersprungen: {summary.skipped}")

    _print("═" * 46)
    _print("")

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="MiniMaster USB-Testlauf (Python)")
    parser.add_argument("--app-id", required=True, choices=["master", "child"], help="Ziel-App")
    parser.add_argument("--serial", default="auto", help="ADB-Serial (auto = erstes Gerät)")
    parser.add_argument("--suite", default="default", choices=["default", "commissioning"], help="Testsuite")
    parser.add_argument("--test-filter", default="", help="Gradle-Testfilter")
    parser.add_argument("--skip-activation", action="store_true", help="Challenge/Token überspringen")
    parser.add_argument("--install-apk", action="store_true", help="APK vor Test installieren")
    parser.add_argument("--apk-path", default="", help="Expliziter APK-Pfad")
    parser.add_argument("--uninstall-first", action="store_true", help="App vor Install deinstallieren")
    parser.add_argument("--timeout", type=int, default=3600, help="Timeout in Sekunden")
    parser.add_argument("--expected-android-version", default="", help="Erwartete Android-Version fuer Kompatibilitaetslauf")
    parser.add_argument("--json-out", type=Path, default=None, help="JSON-Ergebnis speichern")
    args = parser.parse_args()

    result = run_usb_test(
        app_id=args.app_id,
        serial=args.serial,
        suite=args.suite,
        test_filter=args.test_filter,
        skip_activation=args.skip_activation,
        install_apk=args.install_apk,
        apk_path=args.apk_path,
        uninstall_first=args.uninstall_first,
        timeout_sec=args.timeout,
        expected_android_version=args.expected_android_version,
    )

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
        print(f"JSON-Ergebnis: {args.json_out}")

    return 0 if result.overall_status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
