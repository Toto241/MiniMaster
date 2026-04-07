#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

from qa_catalog import load_android_version_matrix, load_device_profiles


REPO_ROOT = Path(__file__).resolve().parent.parent
RESERVATION_FILE = REPO_ROOT / "build" / "test-automation" / "emulator-reservations.json"
IS_WINDOWS = os.name == "nt"


def _adb_binary() -> str | None:
    adb_name = "adb.exe" if IS_WINDOWS else "adb"
    direct = shutil.which(adb_name)
    if direct:
        return direct
    sdk_root = resolve_android_sdk()
    if sdk_root is None:
        return None
    candidate = sdk_root / "platform-tools" / adb_name
    return str(candidate) if candidate.exists() else None


def resolve_android_sdk() -> Path | None:
    candidates = [os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return Path(candidate)

    local_properties = REPO_ROOT / "local.properties"
    if not local_properties.exists():
        return None

    for line in local_properties.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("sdk.dir="):
            value = line.split("=", 1)[1].strip().replace("\\:", ":").replace("\\\\", "\\")
            sdk_path = Path(value)
            if sdk_path.exists():
                return sdk_path
    return None


def adb_available() -> bool:
    return shutil.which("adb.exe" if IS_WINDOWS else "adb") is not None


def emulator_binary_path() -> Path | None:
    sdk_root = resolve_android_sdk()
    if sdk_root is None:
        return None
    suffix = "emulator.exe" if IS_WINDOWS else "emulator"
    candidate = sdk_root / "emulator" / suffix
    return candidate if candidate.exists() else None


def avdmanager_binary_path() -> Path | None:
    sdk_root = resolve_android_sdk()
    if sdk_root is None:
        return None
    suffix = "avdmanager.bat" if IS_WINDOWS else "avdmanager"
    for parent in (sdk_root / "cmdline-tools", sdk_root / "tools" / "bin"):
        if not parent.exists():
            continue
        if parent.name == "cmdline-tools":
            for child in parent.iterdir():
                candidate = child / "bin" / suffix
                if candidate.exists():
                    return candidate
        else:
            candidate = parent / suffix
            if candidate.exists():
                return candidate
    return None


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(str(value or default))
    except (TypeError, ValueError):
        return default


def list_avds() -> list[str]:
    emulator_path = emulator_binary_path()
    if emulator_path is None:
        return []
    result = subprocess.run(
        [str(emulator_path), "-list-avds"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=20,
    )
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def list_running_emulators() -> list[dict[str, object]]:
    adb_binary = _adb_binary()
    if not adb_binary:
        return []
    result = subprocess.run(
        [adb_binary, "devices", "-l"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=20,
    )
    if result.returncode != 0:
        return []

    devices: list[dict[str, object]] = []
    for raw_line in result.stdout.splitlines()[1:]:
        line = raw_line.strip()
        if not line or not line.startswith("emulator-"):
            continue
        parts = line.split()
        serial = parts[0]
        state = parts[1] if len(parts) > 1 else "unknown"
        details: dict[str, str] = {}
        for token in parts[2:]:
            if ":" not in token:
                continue
            key, value = token.split(":", 1)
            details[key] = value
        devices.append(
            {
                "serial": serial,
                "state": state,
                "model": details.get("model", ""),
                "device": details.get("device", ""),
                "transportId": details.get("transport_id", ""),
            }
        )
    return devices


def start_emulator(
    avd_name: str,
    *,
    headless: bool = True,
    wipe_data: bool = False,
    no_snapshot: bool = True,
) -> dict[str, object]:
    normalized_avd_name = avd_name.strip()
    if not normalized_avd_name:
        raise ValueError("avdName ist erforderlich.")
    if normalized_avd_name not in list_avds():
        raise ValueError(f"AVD {normalized_avd_name} ist nicht vorhanden.")

    emulator_path = emulator_binary_path()
    if emulator_path is None:
        raise ValueError("Emulator-Binary ist nicht verfügbar.")

    command = [str(emulator_path), "-avd", normalized_avd_name]
    if headless:
        command.extend(["-no-window", "-no-audio"])
    if wipe_data:
        command.append("-wipe-data")
    if no_snapshot:
        command.append("-no-snapshot")

    popen_kwargs: dict[str, Any] = {
        "cwd": REPO_ROOT,
        "stdout": subprocess.DEVNULL,
        "stderr": subprocess.DEVNULL,
    }
    if IS_WINDOWS:
        creationflags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        if creationflags:
            popen_kwargs["creationflags"] = creationflags
    else:
        popen_kwargs["start_new_session"] = True

    process = subprocess.Popen(command, **popen_kwargs)
    return {
        "started": True,
        "avdName": normalized_avd_name,
        "pid": process.pid,
        "headless": headless,
        "wipeData": wipe_data,
        "noSnapshot": no_snapshot,
        "command": command,
        "startedAt": _utc_now(),
    }


def create_avd(
    avd_name: str,
    *,
    profile_id: str,
    android_version: str,
) -> dict[str, object]:
    normalized_avd_name = avd_name.strip()
    normalized_profile_id = profile_id.strip()
    normalized_android_version = android_version.strip()
    if not normalized_avd_name:
        raise ValueError("avdName ist erforderlich.")
    if not normalized_profile_id or not normalized_android_version:
        raise ValueError("profileId und androidVersion sind erforderlich.")
    if normalized_avd_name in list_avds():
        raise ValueError(f"AVD {normalized_avd_name} ist bereits vorhanden.")

    avdmanager_path = avdmanager_binary_path()
    sdk_root = resolve_android_sdk()
    if avdmanager_path is None or sdk_root is None:
        raise ValueError("AVD Manager ist nicht verfügbar.")

    profiles = _profile_index()
    matrix = _matrix_index()
    profile = profiles.get(normalized_profile_id)
    version_entry = matrix.get(normalized_android_version)
    if profile is None:
        raise ValueError(f"Unbekanntes Geräteprofil: {profile_id}")
    if version_entry is None:
        raise ValueError(f"Unbekannte Android-Version: {android_version}")

    api_level = _safe_int(version_entry.get("apiLevel"), 0)
    abi = "x86_64"
    tag = "google_apis_playstore" if bool(profile.get("playStore")) else "google_apis"
    package = f"system-images;android-{api_level};{tag};{abi}"
    device_name = "pixel"
    command = [
        str(avdmanager_path),
        "create",
        "avd",
        "--force",
        "--name",
        normalized_avd_name,
        "--package",
        package,
        "--device",
        device_name,
    ]

    result = subprocess.run(
        command,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=120,
        input="no\n",
    )
    if result.returncode != 0:
        error_output = (result.stderr or result.stdout or "AVD konnte nicht erstellt werden.").strip()
        raise ValueError(error_output)

    return {
        "created": True,
        "avdName": normalized_avd_name,
        "profileId": normalized_profile_id,
        "androidVersion": normalized_android_version,
        "apiLevel": api_level,
        "systemImagePackage": package,
        "deviceName": device_name,
        "output": (result.stdout or "").strip(),
    }


def stop_emulator(serial: str) -> dict[str, object]:
    normalized_serial = serial.strip()
    if not normalized_serial:
        raise ValueError("serial ist erforderlich.")

    adb_binary = _adb_binary()
    if not adb_binary:
        raise ValueError("ADB ist nicht verfügbar.")

    result = subprocess.run(
        [adb_binary, "-s", normalized_serial, "emu", "kill"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=20,
    )
    if result.returncode != 0:
        error_output = (result.stderr or result.stdout or "Emulator konnte nicht beendet werden.").strip()
        raise ValueError(error_output)
    return {
        "stopped": True,
        "serial": normalized_serial,
        "output": (result.stdout or "").strip(),
    }


def _load_reservations() -> list[dict[str, object]]:
    if not RESERVATION_FILE.exists():
        return []
    try:
        return cast(list[dict[str, object]], json.loads(RESERVATION_FILE.read_text(encoding="utf-8")))
    except json.JSONDecodeError:
        return []


def _save_reservations(entries: list[dict[str, object]]) -> None:
    RESERVATION_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESERVATION_FILE.write_text(json.dumps(entries, indent=2, ensure_ascii=False), encoding="utf-8")


def _utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _epoch_now() -> int:
    return int(time.time())


def _parse_expiry(value: object) -> int:
    return _safe_int(value, 0)


def load_active_reservations() -> list[dict[str, object]]:
    now = _epoch_now()
    active = [entry for entry in _load_reservations() if _parse_expiry(entry.get("expiresAtEpoch")) > now]
    if len(active) != len(_load_reservations()):
        _save_reservations(active)
    return active


def _profile_index() -> dict[str, dict[str, object]]:
    return {
        str(profile.get("profileId", "")).strip(): profile
        for profile in load_device_profiles()
        if str(profile.get("profileId", "")).strip()
    }


def _matrix_index() -> dict[str, dict[str, object]]:
    return {
        str(entry.get("androidVersion", "")).strip(): entry
        for entry in load_android_version_matrix()
        if str(entry.get("androidVersion", "")).strip()
    }


def build_emulator_matrix_plan() -> list[dict[str, object]]:
    profiles = _profile_index()
    plan: list[dict[str, object]] = []
    for version_entry in load_android_version_matrix():
        android_version = str(version_entry.get("androidVersion", "")).strip()
        api_level = _safe_int(version_entry.get("apiLevel"), 0)
        coverage_tier = str(version_entry.get("coverageTier", "")).strip()
        for profile_id in cast(list[object], version_entry.get("recommendedProfiles", [])):
            normalized_profile_id = str(profile_id).strip()
            profile = profiles.get(normalized_profile_id)
            if profile is None:
                continue
            device_mode = str(profile.get("deviceMode", "single-device")).strip()
            plan.append(
                {
                    "planId": f"{android_version}:{normalized_profile_id}",
                    "androidVersion": android_version,
                    "apiLevel": api_level,
                    "coverageTier": coverage_tier,
                    "profileId": normalized_profile_id,
                    "profileDisplayName": str(profile.get("displayName", normalized_profile_id)),
                    "deviceMode": device_mode,
                    "deviceCount": 2 if device_mode == "dual-device" else 1,
                    "playStore": bool(profile.get("playStore")),
                    "networkProfile": str(profile.get("networkProfile", "wifi-stable")),
                    "snapshotPolicy": str(profile.get("snapshotPolicy", "cold-boot-per-run")),
                }
            )
    return plan


def create_reservation(
    profile_id: str,
    android_version: str,
    *,
    owner: str,
    purpose: str,
    ttl_minutes: int = 120,
) -> dict[str, object]:
    normalized_profile_id = profile_id.strip()
    normalized_version = android_version.strip()
    normalized_owner = owner.strip()
    normalized_purpose = purpose.strip()
    if not normalized_profile_id or not normalized_version:
        raise ValueError("profileId und androidVersion sind erforderlich.")
    if not normalized_owner or not normalized_purpose:
        raise ValueError("owner und purpose sind erforderlich.")

    profiles = _profile_index()
    matrix = _matrix_index()
    profile = profiles.get(normalized_profile_id)
    version_entry = matrix.get(normalized_version)
    if profile is None:
        raise ValueError(f"Unbekanntes Geräteprofil: {profile_id}")
    if version_entry is None:
        raise ValueError(f"Unbekannte Android-Version: {android_version}")

    recommended = {
        str(item).strip() for item in cast(list[object], version_entry.get("recommendedProfiles", [])) if str(item).strip()
    }
    if normalized_profile_id not in recommended:
        raise ValueError(
            f"Profil {normalized_profile_id} ist für Android {normalized_version} nicht als empfohlenes Profil hinterlegt."
        )

    ttl_minutes = max(15, min(int(ttl_minutes), 24 * 60))
    created_at_epoch = _epoch_now()
    reservation = {
        "reservationId": f"emu-{uuid4().hex[:12]}",
        "profileId": normalized_profile_id,
        "androidVersion": normalized_version,
        "apiLevel": _safe_int(version_entry.get("apiLevel"), 0),
        "owner": normalized_owner,
        "purpose": normalized_purpose,
        "deviceMode": str(profile.get("deviceMode", "single-device")),
        "deviceCount": 2 if str(profile.get("deviceMode", "single-device")) == "dual-device" else 1,
        "ttlMinutes": ttl_minutes,
        "createdAt": _utc_now(),
        "createdAtEpoch": created_at_epoch,
        "expiresAtEpoch": created_at_epoch + ttl_minutes * 60,
    }
    reservations = load_active_reservations()
    reservations.append(reservation)
    _save_reservations(reservations)
    return reservation


def release_reservation(reservation_id: str) -> bool:
    normalized = reservation_id.strip()
    if not normalized:
        return False
    reservations = _load_reservations()
    remaining = [entry for entry in reservations if str(entry.get("reservationId", "")).strip() != normalized]
    if len(remaining) == len(reservations):
        return False
    _save_reservations(remaining)
    return True


def get_emulator_lab_overview() -> dict[str, object]:
    sdk_root = resolve_android_sdk()
    emulator_path = emulator_binary_path()
    avdmanager_path = avdmanager_binary_path()
    avds = list_avds()
    running = list_running_emulators()
    reservations = load_active_reservations()
    plan = build_emulator_matrix_plan()

    return {
        "sdkConfigured": sdk_root is not None,
        "sdkRoot": str(sdk_root) if sdk_root is not None else "",
        "adbAvailable": adb_available(),
        "emulatorBinaryAvailable": emulator_path is not None,
        "emulatorBinary": str(emulator_path) if emulator_path is not None else "",
        "avdManagerAvailable": avdmanager_path is not None,
        "avdManagerBinary": str(avdmanager_path) if avdmanager_path is not None else "",
        "availableAvds": avds,
        "availableAvdCount": len(avds),
        "runningEmulators": running,
        "runningEmulatorCount": len(running),
        "reservations": reservations,
        "reservationCount": len(reservations),
        "matrixPlan": plan,
        "matrixPlanCount": len(plan),
    }
