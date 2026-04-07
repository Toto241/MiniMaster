#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import cast
from uuid import uuid4

from qa_catalog import load_android_version_matrix, load_device_profiles


REPO_ROOT = Path(__file__).resolve().parent.parent
RESERVATION_FILE = REPO_ROOT / "build" / "test-automation" / "emulator-reservations.json"
IS_WINDOWS = os.name == "nt"


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
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


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
        api_level = int(version_entry.get("apiLevel", 0) or 0)
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
        "apiLevel": int(version_entry.get("apiLevel", 0) or 0),
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
        "reservations": reservations,
        "reservationCount": len(reservations),
        "matrixPlan": plan,
        "matrixPlanCount": len(plan),
    }
