#!/usr/bin/env python3
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from dual_device_runner import run_dual_device
from emulator_manager import create_reservation, ensure_emulator_pool, release_reservation
from emulator_orchestrator import EmulatorOrchestrator, build_artifact_path
from usb_test_runner import run_usb_test


def _slugify(value: str) -> str:
    safe = [char.lower() if char.isalnum() else "-" for char in value.strip()]
    normalized = "".join(safe).strip("-")
    return normalized or "scenario"


def _write_log_file(path: Path, lines: list[str]) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return str(path)


def _collect_device_artifacts(
    orchestrator: EmulatorOrchestrator,
    *,
    app_id: str,
    serial: str,
    android_version: str,
    label: str,
    capture_video: bool = False,
) -> dict[str, object]:
    normalized_label = _slugify(label)
    log_path = build_artifact_path(app_id, f"{android_version}-{normalized_label}-{serial}-logcat.txt")
    screenshot_path = build_artifact_path(app_id, f"{android_version}-{normalized_label}-{serial}.png")
    logs_result = orchestrator.capture_logs("android", serial, tag=None, since_seconds=30, max_lines=400)
    written_log_path = _write_log_file(log_path, list(logs_result.get("details", {}).get("lines") or []))
    screenshot_result = orchestrator.capture_screenshot("android", serial, screenshot_path)
    artifacts: dict[str, object] = {
        "logcatPath": written_log_path,
        "screenshotPath": str(screenshot_result.get("details", {}).get("path") or screenshot_path),
    }
    if capture_video:
        video_path = build_artifact_path(app_id, f"{android_version}-{normalized_label}-{serial}.mp4")
        video_result = orchestrator.record_video("android", serial, video_path, time_limit_sec=15)
        artifacts["videoPath"] = str(video_result.get("details", {}).get("path") or video_path)
    return artifacts


def run_single_device_matrix_entry(
    *,
    run_id: str,
    android_version: str,
    app_id: str,
    profile_id: str,
    serial: str,
    suite: str,
    selected_test_classes: list[str] | None = None,
    skip_activation: bool = False,
    install_apk: bool = False,
    apk_path: str = "",
    uninstall_first: bool = False,
    timeout_sec: int = 3600,
    deep_link_url: str = "",
    deep_link_package: str = "",
    capture_video: bool = False,
) -> dict[str, object]:
    orchestrator = EmulatorOrchestrator()
    reservation_id = ""
    provisioning: list[dict[str, object]] = []
    target_serial = serial.strip() or "auto"
    label = selected_test_classes[0] if selected_test_classes else suite

    try:
        if target_serial == "auto":
            reservation = create_reservation(
                profile_id,
                android_version,
                owner=run_id,
                purpose=f"single:{app_id}:{label}",
            )
            reservation_id = str(reservation.get("reservationId") or "")
            provisioning = ensure_emulator_pool(
                profile_id,
                android_version,
                device_count=1,
                timeout_sec=timeout_sec,
                reservation_id=reservation_id,
            )
            target_serial = str(provisioning[0].get("serial") or "")

        if deep_link_url:
            orchestrator.open_deep_link("android", target_serial, deep_link_url, package=deep_link_package or None)

        result = run_usb_test(
            app_id=app_id,
            serial=target_serial,
            suite=suite,
            selected_test_classes=selected_test_classes,
            skip_activation=skip_activation,
            install_apk=install_apk,
            apk_path=apk_path,
            uninstall_first=uninstall_first,
            timeout_sec=timeout_sec,
            expected_android_version=android_version,
            verbose=False,
        )
        artifacts = _collect_device_artifacts(
            orchestrator,
            app_id=app_id,
            serial=target_serial,
            android_version=android_version,
            label=label,
            capture_video=capture_video,
        )
        return {
            "status": result.overall_status,
            "result": result.to_dict(),
            "provisioning": provisioning,
            "reservationId": reservation_id,
            "artifacts": artifacts,
            "serial": target_serial,
        }
    finally:
        if reservation_id:
            release_reservation(reservation_id)


def run_dual_device_matrix_entry(
    *,
    run_id: str,
    android_version: str,
    profile_id: str,
    master_serial: str,
    child_serial: str,
    scenario_id: str,
    fault_modes: list[str] | None = None,
    install_apk: bool = False,
    master_apk_path: str = "",
    child_apk_path: str = "",
    uninstall_first: bool = False,
    timeout_sec: int = 7200,
    parallel: bool = False,
    capture_video: bool = False,
) -> dict[str, object]:
    orchestrator = EmulatorOrchestrator()
    reservation_id = ""
    provisioning: list[dict[str, object]] = []
    effective_master_serial = master_serial.strip() or "auto"
    effective_child_serial = child_serial.strip() or "auto"

    try:
        if effective_master_serial == "auto" or effective_child_serial == "auto":
            reservation = create_reservation(
                profile_id,
                android_version,
                owner=run_id,
                purpose=f"dual:{scenario_id or 'default'}",
            )
            reservation_id = str(reservation.get("reservationId") or "")
            provisioning = ensure_emulator_pool(
                profile_id,
                android_version,
                device_count=2,
                timeout_sec=timeout_sec,
                reservation_id=reservation_id,
            )
            if effective_master_serial == "auto":
                effective_master_serial = str(provisioning[0].get("serial") or "")
            if effective_child_serial == "auto":
                effective_child_serial = str(provisioning[1].get("serial") or "")

        result = run_dual_device(
            master_serial=effective_master_serial,
            child_serial=effective_child_serial,
            install_apk=install_apk,
            master_apk_path=master_apk_path,
            child_apk_path=child_apk_path,
            uninstall_first=uninstall_first,
            timeout_sec=timeout_sec,
            parallel=parallel,
            scenario_id=scenario_id,
            profile_id=profile_id,
            fault_modes=fault_modes or [],
            expected_android_version=android_version,
            verbose=False,
        )
        artifacts = {
            "master": _collect_device_artifacts(
                orchestrator,
                app_id="master",
                serial=effective_master_serial,
                android_version=android_version,
                label=f"{scenario_id or 'dual'}-master",
                capture_video=capture_video,
            ),
            "child": _collect_device_artifacts(
                orchestrator,
                app_id="child",
                serial=effective_child_serial,
                android_version=android_version,
                label=f"{scenario_id or 'dual'}-child",
                capture_video=capture_video,
            ),
        }
        return {
            "status": result.overall_status,
            "result": result.to_dict(),
            "provisioning": provisioning,
            "reservationId": reservation_id,
            "artifacts": artifacts,
            "masterSerial": effective_master_serial,
            "childSerial": effective_child_serial,
        }
    finally:
        if reservation_id:
            release_reservation(reservation_id)
