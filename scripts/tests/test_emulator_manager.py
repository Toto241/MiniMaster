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

    def test_create_reservation_rejects_conflicting_active_reservation(self):
        emulator_manager.create_reservation(
            "dual-device-balanced",
            "14",
            owner="QA",
            purpose="nightly",
        )

        with pytest.raises(ValueError, match="bereits eine aktive Reservierung"):
            emulator_manager.create_reservation(
                "dual-device-balanced",
                "14",
                owner="QA-2",
                purpose="rerun",
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

    def test_ensure_emulator_pool_binds_allocated_targets_to_reservation(self, monkeypatch: pytest.MonkeyPatch):
        reservation = emulator_manager.create_reservation(
            "dual-device-balanced",
            "14",
            owner="QA",
            purpose="nightly",
        )

        def fake_ensure(profile_id, android_version, *, slot=1, **kwargs):
            return {
                "serial": f"emulator-{slot}",
                "profileId": profile_id,
                "androidVersion": android_version,
                "avdName": f"qa-{slot}",
            }

        monkeypatch.setattr(emulator_manager, "ensure_emulator_available", fake_ensure)

        emulator_manager.ensure_emulator_pool(
            "dual-device-balanced",
            "14",
            device_count=2,
            reservation_id=str(reservation["reservationId"]),
        )

        active = emulator_manager.load_active_reservations()
        assert len(active) == 1
        assert active[0]["assignedTargets"][0]["serial"] == "emulator-1"
        assert active[0]["assignedTargets"][1]["avdName"] == "qa-2"


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

        def fake_run(command, **kwargs):
            if command[:3] == ["adb", "devices", "-l"]:
                return subprocess.CompletedProcess(
                    args=command,
                    returncode=0,
                    stdout="List of devices attached\nemulator-5554 device product:sdk_gphone64_x86_64 model:Pixel_8 device:emu64xa transport_id:5\n",
                    stderr="",
                )
            if command[-1] == "ro.build.version.release":
                return subprocess.CompletedProcess(args=command, returncode=0, stdout="14\n", stderr="")
            if command[-1] in {"ro.boot.qemu.avd_name", "qemu.avd_name"}:
                return subprocess.CompletedProcess(args=command, returncode=0, stdout="MiniMaster_phone_standard_API_14_1\n", stderr="")
            raise AssertionError(command)

        monkeypatch.setattr(emulator_manager.subprocess, "run", fake_run)

        result = emulator_manager.list_running_emulators()

        assert len(result) == 1
        assert result[0]["serial"] == "emulator-5554"
        assert result[0]["model"] == "Pixel_8"
        assert result[0]["androidVersion"] == "14"
        assert result[0]["avdName"] == "MiniMaster_phone_standard_API_14_1"


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

    def test_ensure_emulator_available_reuses_matching_running_emulator(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_manager, "list_running_emulators", lambda: [{"serial": "emulator-5554", "state": "device", "avdName": "MiniMaster_phone_standard_API_14_1", "androidVersion": "14"}])

        result = emulator_manager.ensure_emulator_available("phone-standard", "14")

        assert result["reused"] is True
        assert result["serial"] == "emulator-5554"

    def test_ensure_emulator_available_starts_requested_slot_when_other_slot_is_running(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(
            emulator_manager,
            "list_running_emulators",
            lambda: [{"serial": "emulator-5554", "state": "device", "avdName": "MiniMaster_phone_standard_API_14_2", "androidVersion": "14"}],
        )
        monkeypatch.setattr(emulator_manager, "list_avds", lambda: ["MiniMaster_phone_standard_API_14_1"])
        monkeypatch.setattr(emulator_manager, "start_emulator", lambda *args, **kwargs: {"started": True})
        monkeypatch.setattr(emulator_manager, "wait_for_emulator_ready", lambda serial, timeout_sec=240: {"ready": True, "serial": serial, "androidVersion": "14"})
        monkeypatch.setattr(emulator_manager, "_wait_for_serial_for_avd_name", lambda avd_name, **kwargs: "emulator-5556")

        result = emulator_manager.ensure_emulator_available("phone-standard", "14", slot=1)

        assert result["reused"] is False
        assert result["serial"] == "emulator-5556"

    def test_ensure_emulator_available_creates_and_waits_for_new_emulator(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_manager, "list_avds", lambda: [])
        monkeypatch.setattr(emulator_manager, "create_avd", lambda avd_name, profile_id, android_version: {"created": True, "avdName": avd_name, "profileId": profile_id, "androidVersion": android_version})
        monkeypatch.setattr(emulator_manager, "start_emulator", lambda *args, **kwargs: {"started": True})
        monkeypatch.setattr(emulator_manager, "wait_for_emulator_ready", lambda serial, timeout_sec=240: {"ready": True, "serial": serial, "androidVersion": "14"})
        monkeypatch.setattr(emulator_manager, "list_running_emulators", lambda: [])
        monkeypatch.setattr(emulator_manager, "_wait_for_serial_for_avd_name", lambda avd_name, **kwargs: "emulator-5556")

        result = emulator_manager.ensure_emulator_available("phone-standard", "14")

        assert result["created"] is True
        assert result["started"] is True
        assert result["serial"] == "emulator-5556"

    def test_ensure_emulator_pool_allocates_multiple_slots(self, monkeypatch: pytest.MonkeyPatch):
        calls: list[int] = []

        def fake_ensure(profile_id, android_version, *, slot=1, **kwargs):
            calls.append(slot)
            return {"serial": f"emulator-{slot}", "profileId": profile_id, "androidVersion": android_version}

        monkeypatch.setattr(emulator_manager, "ensure_emulator_available", fake_ensure)

        result = emulator_manager.ensure_emulator_pool("dual-device-balanced", "14", device_count=2)

        assert calls == [1, 2]
        assert len(result) == 2
