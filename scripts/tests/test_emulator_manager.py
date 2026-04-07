from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock

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
        monkeypatch.setattr(emulator_manager, "list_running_emulators", lambda: [{"serial": "emulator-5554", "state": "device"}])
        overview = emulator_manager.get_emulator_lab_overview()

        assert overview["sdkConfigured"] is True
        assert overview["emulatorBinaryAvailable"] is True
        assert overview["availableAvdCount"] == 2
        assert overview["runningEmulatorCount"] == 1
        assert overview["matrixPlanCount"] >= 1


class TestRunningEmulators:
    def test_list_running_emulators_parses_adb_devices(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_manager, "_adb_binary", lambda: "adb")

        completed = subprocess.CompletedProcess(
            args=["adb", "devices", "-l"],
            returncode=0,
            stdout="List of devices attached\nemulator-5554 device product:sdk_gphone64_x86_64 model:Pixel_8 device:emu64xa transport_id:5\n",
            stderr="",
        )
        monkeypatch.setattr(emulator_manager.subprocess, "run", lambda *args, **kwargs: completed)

        result = emulator_manager.list_running_emulators()

        assert len(result) == 1
        assert result[0]["serial"] == "emulator-5554"
        assert result[0]["model"] == "Pixel_8"


class TestEmulatorLifecycle:
    def test_start_emulator_launches_process(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_manager, "list_avds", lambda: ["Pixel_8_API_34"])
        monkeypatch.setattr(emulator_manager, "emulator_binary_path", lambda: Path("C:/Android/Sdk/emulator/emulator.exe"))

        popen_calls: list[tuple[list[str], dict[str, object]]] = []

        class DummyProcess:
            pid = 4242

        def fake_popen(command, **kwargs):
            popen_calls.append((command, kwargs))
            return DummyProcess()

        monkeypatch.setattr(emulator_manager.subprocess, "Popen", fake_popen)

        result = emulator_manager.start_emulator("Pixel_8_API_34")

        assert result["started"] is True
        assert result["pid"] == 4242
        assert popen_calls[0][0][1:3] == ["-avd", "Pixel_8_API_34"]

    def test_stop_emulator_calls_adb_kill(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_manager, "_adb_binary", lambda: "adb")
        completed = subprocess.CompletedProcess(
            args=["adb", "-s", "emulator-5554", "emu", "kill"],
            returncode=0,
            stdout="OK\n",
            stderr="",
        )
        monkeypatch.setattr(emulator_manager.subprocess, "run", lambda *args, **kwargs: completed)

        result = emulator_manager.stop_emulator("emulator-5554")

        assert result["stopped"] is True
        assert result["serial"] == "emulator-5554"

    def test_create_avd_uses_profile_and_android_version(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_manager, "list_avds", lambda: [])
        monkeypatch.setattr(emulator_manager, "avdmanager_binary_path", lambda: Path("C:/Android/Sdk/cmdline-tools/latest/bin/avdmanager.bat"))
        monkeypatch.setattr(emulator_manager, "resolve_android_sdk", lambda: Path("C:/Android/Sdk"))

        completed = subprocess.CompletedProcess(
            args=["avdmanager"],
            returncode=0,
            stdout="Created AVD\n",
            stderr="",
        )
        run_calls: list[tuple[list[str], dict[str, object]]] = []

        def fake_run(command, **kwargs):
            run_calls.append((command, kwargs))
            return completed

        monkeypatch.setattr(emulator_manager.subprocess, "run", fake_run)

        result = emulator_manager.create_avd(
            "Pixel_8_API_34_QA",
            profile_id="phone-standard",
            android_version="14",
        )

        assert result["created"] is True
        assert result["apiLevel"] == 34
        assert result["systemImagePackage"] == "system-images;android-34;google_apis;x86_64"
        assert "--name" in run_calls[0][0]
