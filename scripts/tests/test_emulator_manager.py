from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest


sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import emulator_manager


class TestBuildEmulatorMatrixPlan:
    def test_plan_contains_entries_for_versions_and_profiles(self):
        plan = emulator_manager.build_emulator_matrix_plan()

        assert plan
        assert any(item["androidVersion"] == "10" for item in plan)
        assert any(item["profileId"] == "dual-device-balanced" for item in plan)
        assert any(item["deviceMode"] == "dual-device" for item in plan)


class TestReservations:
    @pytest.fixture(autouse=True)
    def patch_reservation_file(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        reservation_file = tmp_path / "emulator-reservations.json"
        monkeypatch.setattr(emulator_manager, "RESERVATION_FILE", reservation_file)
        return reservation_file

    def test_create_reservation_persists_entry(self):
        reservation = emulator_manager.create_reservation(
            "dual-device-balanced",
            "14",
            owner="QA",
            purpose="nightly",
            ttl_minutes=60,
        )

        assert reservation["profileId"] == "dual-device-balanced"
        assert reservation["androidVersion"] == "14"
        assert reservation["deviceCount"] == 2
        assert emulator_manager.load_active_reservations()

    def test_create_reservation_rejects_non_recommended_profile(self):
        with pytest.raises(ValueError):
            emulator_manager.create_reservation(
                "phone-compact",
                "16",
                owner="QA",
                purpose="canary",
            )

    def test_release_reservation_removes_entry(self):
        reservation = emulator_manager.create_reservation(
            "phone-standard",
            "12",
            owner="QA",
            purpose="smoke",
        )

        assert emulator_manager.release_reservation(reservation["reservationId"]) is True
        assert emulator_manager.load_active_reservations() == []


class TestOverview:
    def test_overview_contains_matrix_and_reservation_counts(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        monkeypatch.setattr(emulator_manager, "RESERVATION_FILE", tmp_path / "reservations.json")
        monkeypatch.setattr(emulator_manager, "resolve_android_sdk", lambda: Path("C:/Android/Sdk"))
        monkeypatch.setattr(emulator_manager, "emulator_binary_path", lambda: Path("C:/Android/Sdk/emulator/emulator.exe"))
        monkeypatch.setattr(emulator_manager, "avdmanager_binary_path", lambda: Path("C:/Android/Sdk/cmdline-tools/latest/bin/avdmanager.bat"))
        monkeypatch.setattr(emulator_manager, "adb_available", lambda: True)
        monkeypatch.setattr(emulator_manager, "list_avds", lambda: ["Pixel_8_API_34", "Pixel_6_API_31"])
        overview = emulator_manager.get_emulator_lab_overview()

        assert overview["sdkConfigured"] is True
        assert overview["emulatorBinaryAvailable"] is True
        assert overview["availableAvdCount"] == 2
        assert overview["matrixPlanCount"] >= 1
