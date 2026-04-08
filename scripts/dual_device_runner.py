#!/usr/bin/env python3
"""
Python Dual-Device Commissioning-Runner für MiniMaster.

Ersetzt `run-dual-device-commissioning.ps1` vollständig.
Orchestriert Commissioning-Testsuiten auf zwei physischen Geräten
(Master + Child) mit optionaler Parallelisierung.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, cast

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qa_catalog import load_device_profiles, load_dual_device_scenarios  # noqa: E402
from usb_test_runner import UsbTestRunResult, run_usb_test  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "test-automation" / "dual-device-latest.json"


@dataclass
class DualDeviceResult:
    master_serial: str
    child_serial: str
    android_version: str = ""
    scenario_id: str = ""
    scenario_title: str = ""
    profile_id: str = ""
    fault_modes: list[str] | None = None
    execution_plan: list[dict[str, object]] | None = None
    timeline: list[dict[str, object]] | None = None
    master_result: UsbTestRunResult | None = None
    child_result: UsbTestRunResult | None = None
    overall_status: str = "not_started"
    duration_sec: float = 0.0

    def to_dict(self) -> dict[str, object]:
        return {
            "masterSerial": self.master_serial,
            "childSerial": self.child_serial,
            "androidVersion": self.android_version,
            "scenarioId": self.scenario_id,
            "scenarioTitle": self.scenario_title,
            "profileId": self.profile_id,
            "faultModes": list(self.fault_modes or []),
            "executionPlan": list(self.execution_plan or []),
            "timeline": list(self.timeline or []),
            "masterResult": self.master_result.to_dict() if self.master_result else None,
            "childResult": self.child_result.to_dict() if self.child_result else None,
            "overallStatus": self.overall_status,
            "durationSec": self.duration_sec,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }


def _resolve_profile_definition(profile_id: str) -> dict[str, object] | None:
    normalized = profile_id.strip()
    if not normalized:
        return None
    for profile in load_device_profiles():
        if str(profile.get("profileId", "")).strip() == normalized:
            return profile
    raise ValueError(f"Unbekannte Geräteprofil-ID: {profile_id}")


def _validate_profile(profile: dict[str, object] | None) -> None:
    if profile is None:
        return
    if str(profile.get("deviceMode", "")).strip() != "dual-device":
        raise ValueError(
            f"Profil {profile.get('profileId', '')} ist kein Dual-Device-Profil."
        )


def _build_execution_plan(
    scenario: dict[str, object] | None,
    profile: dict[str, object] | None,
    fault_modes: list[str],
) -> list[dict[str, object]]:
    plan: list[dict[str, object]] = [
        {
            "stepId": "preflight",
            "title": "Preflight und Katalogvalidierung",
            "role": "system",
            "kind": "validation",
        },
        {
            "stepId": "master-commissioning",
            "title": "Commissioning-Suite auf Master-Gerät",
            "role": "master",
            "kind": "suite-run",
            "suiteHints": list(cast(list[object], scenario.get("suiteHints", []))) if scenario else [],
        },
        {
            "stepId": "child-commissioning",
            "title": "Commissioning-Suite auf Child-Gerät",
            "role": "child",
            "kind": "suite-run",
            "suiteHints": list(cast(list[object], scenario.get("suiteHints", []))) if scenario else [],
        },
    ]

    for fault_mode in fault_modes:
        plan.append(
            {
                "stepId": f"fault:{fault_mode}",
                "title": f"Fault Mode vorbereiten: {fault_mode}",
                "role": "system",
                "kind": "fault-mode",
                "faultMode": fault_mode,
                "status": "planned",
            }
        )

    if profile is not None:
        plan.append(
            {
                "stepId": "profile",
                "title": f"Geräteprofil anwenden: {profile.get('displayName', profile.get('profileId', ''))}",
                "role": "system",
                "kind": "profile",
                "deviceMode": str(profile.get("deviceMode", "")),
                "networkProfile": str(profile.get("networkProfile", "")),
            }
        )
    return plan


def _emit_event(
    result: DualDeviceResult,
    phase: str,
    status: str,
    message: str,
    *,
    role: str = "system",
    callback: Callable[[dict[str, object]], None] | None = None,
    metadata: dict[str, object] | None = None,
) -> None:
    event: dict[str, object] = {
        "phase": phase,
        "status": status,
        "role": role,
        "message": message,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    if metadata:
        event.update(metadata)
    if result.timeline is None:
        result.timeline = []
    result.timeline.append(event)
    if callback:
        callback(event)


def _resolve_scenario_definition(scenario_id: str) -> dict[str, object] | None:
    normalized = scenario_id.strip()
    if not normalized:
        return None
    for scenario in load_dual_device_scenarios():
        if str(scenario.get("scenarioId", "")).strip() == normalized:
            return scenario
    raise ValueError(f"Unbekannte Dual-Device-Szenario-ID: {scenario_id}")


def _validate_fault_modes(scenario: dict[str, object] | None, fault_modes: list[str] | None) -> list[str]:
    normalized = [mode.strip() for mode in (fault_modes or []) if mode and mode.strip()]
    if scenario is None or not normalized:
        return normalized

    allowed = {
        str(mode).strip()
        for mode in cast(list[object], scenario.get("failureModes", []))
        if str(mode).strip()
    }
    invalid = [mode for mode in normalized if mode not in allowed]
    if invalid:
        invalid_list = ", ".join(invalid)
        allowed_list = ", ".join(sorted(allowed)) or "keine"
        raise ValueError(
            f"Fault Modes fuer Szenario {scenario.get('scenarioId', '')} ungueltig: {invalid_list}. Erlaubt: {allowed_list}."
        )
    return normalized


def run_dual_device(
    master_serial: str,
    child_serial: str,
    install_apk: bool = False,
    master_apk_path: str = "",
    child_apk_path: str = "",
    uninstall_first: bool = False,
    timeout_sec: int = 7200,
    parallel: bool = False,
    scenario_id: str = "",
    profile_id: str = "",
    fault_modes: list[str] | None = None,
    expected_android_version: str = "",
    on_event: Callable[[dict[str, object]], None] | None = None,
    verbose: bool = True,
) -> DualDeviceResult:
    """
    Führt Commissioning-Tests auf zwei Geräten aus.

    Args:
        master_serial: Serial des Master-Geräts
        child_serial: Serial des Child-Geräts
        install_apk: APKs installieren
        master_apk_path: Expliziter APK-Pfad für Master
        child_apk_path: Expliziter APK-Pfad für Child
        uninstall_first: Apps vor Install deinstallieren
        timeout_sec: Timeout pro Gerät
        parallel: Beide Geräte parallel testen
        verbose: Console-Ausgabe

    Returns: DualDeviceResult
    """
    started = time.perf_counter()
    scenario = _resolve_scenario_definition(scenario_id)
    profile = _resolve_profile_definition(profile_id)
    _validate_profile(profile)
    normalized_fault_modes = _validate_fault_modes(scenario, fault_modes)
    result = DualDeviceResult(
        master_serial=master_serial,
        child_serial=child_serial,
        android_version=expected_android_version.strip(),
        scenario_id=scenario_id.strip(),
        scenario_title=str(scenario.get("title", "")) if scenario else "",
        profile_id=profile_id.strip(),
        fault_modes=normalized_fault_modes,
        execution_plan=_build_execution_plan(scenario, profile, normalized_fault_modes),
        timeline=[],
    )

    def _print(msg: str) -> None:
        if verbose:
            print(msg)

    _print("")
    _print("=" * 48)
    _print("  MINIMASTER DUAL-DEVICE COMMISSIONING (Python)")
    _print("=" * 48)
    _print(f"  Master-Gerät: {master_serial}")
    _print(f"  Child-Gerät:  {child_serial}")
    _print(f"  Modus:        {'Parallel' if parallel else 'Sequentiell'}")
    if result.scenario_id:
        _print(f"  Szenario:     {result.scenario_id} ({result.scenario_title or 'ohne Titel'})")
    if result.profile_id:
        _print(f"  Profil:       {result.profile_id}")
    if normalized_fault_modes:
        _print(f"  Fault Modes:  {', '.join(normalized_fault_modes)}")
    _print("")

    _emit_event(
        result,
        "preflight",
        "running",
        "Dual-Device-Orchestrierung vorbereitet.",
        callback=on_event,
        metadata={
            "scenarioId": result.scenario_id,
            "profileId": result.profile_id,
            "faultModes": list(normalized_fault_modes),
        },
    )
    if normalized_fault_modes:
        _emit_event(
            result,
            "fault-modes",
            "planned",
            f"Fault Modes eingeplant: {', '.join(normalized_fault_modes)}",
            callback=on_event,
        )
    _emit_event(
        result,
        "preflight",
        "passed",
        "Preflight erfolgreich abgeschlossen.",
        callback=on_event,
    )

    def _run_master() -> UsbTestRunResult:
        _emit_event(result, "master", "running", "Master-Commissioning gestartet.", role="master", callback=on_event)
        return run_usb_test(
            app_id="master",
            serial=master_serial,
            suite="commissioning",
            install_apk=install_apk,
            apk_path=master_apk_path,
            uninstall_first=uninstall_first,
            timeout_sec=timeout_sec,
            expected_android_version=expected_android_version,
            verbose=verbose and not parallel,
        )

    def _run_child() -> UsbTestRunResult:
        _emit_event(result, "child", "running", "Child-Commissioning gestartet.", role="child", callback=on_event)
        return run_usb_test(
            app_id="child",
            serial=child_serial,
            suite="commissioning",
            install_apk=install_apk,
            apk_path=child_apk_path,
            uninstall_first=uninstall_first,
            timeout_sec=timeout_sec,
            expected_android_version=expected_android_version,
            verbose=verbose and not parallel,
        )

    try:
        if parallel:
            _print("[Parallel] Starte beide Commissioning-Suiten gleichzeitig...")
            with ThreadPoolExecutor(max_workers=2) as executor:
                future_master = executor.submit(_run_master)
                future_child = executor.submit(_run_child)

                for future in as_completed([future_master, future_child]):
                    try:
                        completed_result = future.result()
                        role = "master" if completed_result.app_id == "master" else "child"
                        _emit_event(
                            result,
                            role,
                            completed_result.overall_status,
                            f"{role.title()}-Commissioning {completed_result.overall_status}.",
                            role=role,
                            callback=on_event,
                        )
                    except Exception as exc:
                        _print(f"✘  Ein Testlauf ist fehlgeschlagen: {exc}")
                        _emit_event(result, "parallel", "error", str(exc), callback=on_event)
                        raise

                result.master_result = future_master.result()
                result.child_result = future_child.result()
        else:
            _print("[1/2] Master Commissioning-Suite")
            result.master_result = _run_master()
            _emit_event(
                result,
                "master",
                result.master_result.overall_status,
                f"Master-Commissioning {result.master_result.overall_status}.",
                role="master",
                callback=on_event,
            )

            _print("")
            _print("[2/2] Child Commissioning-Suite")
            result.child_result = _run_child()
            _emit_event(
                result,
                "child",
                result.child_result.overall_status,
                f"Child-Commissioning {result.child_result.overall_status}.",
                role="child",
                callback=on_event,
            )
    except Exception as exc:
        result.duration_sec = round(time.perf_counter() - started, 2)
        result.overall_status = "failed"
        _emit_event(result, "summary", "error", str(exc), callback=on_event)
        raise

    # ── Gesamtergebnis ────────────────────────────────────────────────────
    result.duration_sec = round(time.perf_counter() - started, 2)

    master_ok = result.master_result and result.master_result.overall_status == "passed"
    child_ok = result.child_result and result.child_result.overall_status == "passed"

    if master_ok and child_ok:
        result.overall_status = "passed"
    else:
        result.overall_status = "failed"

    _emit_event(
        result,
        "summary",
        result.overall_status,
        f"Dual-Device-Orchestrierung {result.overall_status}.",
        callback=on_event,
        metadata={"durationSec": result.duration_sec},
    )

    _print("")
    _print("=" * 48)
    _print("  GESAMTERGEBNIS")
    _print("=" * 48)
    if result.overall_status == "passed":
        _print("  BESTANDEN: Beide Commissioning-Suiten erfolgreich.")
    else:
        _print("  FEHLGESCHLAGEN: Mindestens eine Suite fehlgeschlagen.")
        if result.master_result:
            _print(f"  Master: {result.master_result.overall_status}")
        if result.child_result:
            _print(f"  Child:  {result.child_result.overall_status}")
    _print(f"  Dauer: {result.duration_sec:.1f}s")
    _print("=" * 48)
    _print("")

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="MiniMaster Dual-Device Commissioning (Python)")
    parser.add_argument("--master-serial", required=True, help="Serial des Master-Geräts")
    parser.add_argument("--child-serial", required=True, help="Serial des Child-Geräts")
    parser.add_argument("--install-apk", action="store_true", help="APKs installieren")
    parser.add_argument("--master-apk-path", default="", help="APK-Pfad für Master")
    parser.add_argument("--child-apk-path", default="", help="APK-Pfad für Child")
    parser.add_argument("--uninstall-first", action="store_true", help="Apps vor Install deinstallieren")
    parser.add_argument("--timeout", type=int, default=7200, help="Timeout pro Gerät (Sekunden)")
    parser.add_argument("--parallel", action="store_true", help="Beide Geräte parallel testen")
    parser.add_argument("--scenario-id", default="", help="Kanonische Szenario-ID aus qa/catalog/dual-device-scenarios.json")
    parser.add_argument("--profile-id", default="", help="Optionales Geräteprofil aus qa/catalog/device-profiles.json")
    parser.add_argument("--fault-mode", action="append", default=[], help="Optionaler Fault Mode. Kann mehrfach angegeben werden.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT, help="JSON-Ergebnis speichern")
    args = parser.parse_args()

    result = run_dual_device(
        master_serial=args.master_serial,
        child_serial=args.child_serial,
        install_apk=args.install_apk,
        master_apk_path=args.master_apk_path,
        child_apk_path=args.child_apk_path,
        uninstall_first=args.uninstall_first,
        timeout_sec=args.timeout,
        parallel=args.parallel,
        scenario_id=args.scenario_id,
        profile_id=args.profile_id,
        fault_modes=args.fault_mode,
    )

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(result.to_dict(), indent=2), encoding="utf-8")
    print(f"JSON-Ergebnis: {args.json_out}")

    return 0 if result.overall_status == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
