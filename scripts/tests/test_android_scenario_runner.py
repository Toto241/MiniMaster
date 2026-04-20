from __future__ import annotations

import sys
from pathlib import Path

import pytest


SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import android_scenario_runner


class _FakeUsbResult:
    overall_status = "passed"

    def to_dict(self):
        return {"overallStatus": self.overall_status}


class _FakeDualResult:
    overall_status = "passed"

    def to_dict(self):
        return {"overallStatus": self.overall_status}


class TestAndroidScenarioRunner:
    def test_single_device_auto_run_uses_reservation_and_collects_artifacts(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        released: list[str] = []
        deep_links: list[tuple[str, str | None]] = []

        class FakeOrchestrator:
            def open_deep_link(self, platform, serial, url, package=None):
                deep_links.append((url, package))
                return {"ok": True, "details": {}}

            def capture_logs(self, platform, target_id, **kwargs):
                return {"ok": True, "details": {"lines": ["a", "b"]}}

            def capture_screenshot(self, platform, target_id, destination):
                Path(destination).write_bytes(b"png")
                return {"ok": True, "details": {"path": str(destination)}}

        monkeypatch.setattr(android_scenario_runner, "EmulatorOrchestrator", FakeOrchestrator)
        monkeypatch.setattr(android_scenario_runner, "create_reservation", lambda *args, **kwargs: {"reservationId": "emu-123"})
        monkeypatch.setattr(android_scenario_runner, "ensure_emulator_pool", lambda *args, **kwargs: [{"serial": "emulator-5554", "androidVersion": "14", "profileId": "phone-standard"}])
        monkeypatch.setattr(android_scenario_runner, "release_reservation", lambda reservation_id: released.append(reservation_id) or True)
        monkeypatch.setattr(android_scenario_runner, "run_usb_test", lambda **kwargs: _FakeUsbResult())
        monkeypatch.setattr(android_scenario_runner, "build_artifact_path", lambda app_id, filename: tmp_path / app_id / filename)

        result = android_scenario_runner.run_single_device_matrix_entry(
            run_id="compat-1",
            android_version="14",
            app_id="master",
            profile_id="phone-standard",
            serial="auto",
            suite="commissioning",
            selected_test_classes=["master.PairingTest"],
            deep_link_url="minimaster://pair/token",
            deep_link_package="com.minimaster.master",
        )

        assert result["status"] == "passed"
        assert result["provisioning"][0]["serial"] == "emulator-5554"
        assert "reservationId" not in result
        assert Path(str(result["artifacts"]["logcatPath"])).exists()
        assert deep_links == [("minimaster://pair/token", "com.minimaster.master")]
        assert released == ["emu-123"]

    def test_dual_device_auto_run_uses_orchestrator_artifacts(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        released: list[str] = []

        class FakeOrchestrator:
            def capture_logs(self, platform, target_id, **kwargs):
                return {"ok": True, "details": {"lines": [target_id]}}

            def capture_screenshot(self, platform, target_id, destination):
                Path(destination).write_bytes(b"png")
                return {"ok": True, "details": {"path": str(destination)}}

        monkeypatch.setattr(android_scenario_runner, "EmulatorOrchestrator", FakeOrchestrator)
        monkeypatch.setattr(android_scenario_runner, "create_reservation", lambda *args, **kwargs: {"reservationId": "emu-456"})
        monkeypatch.setattr(android_scenario_runner, "ensure_emulator_pool", lambda *args, **kwargs: [{"serial": "emulator-5554"}, {"serial": "emulator-5556"}])
        monkeypatch.setattr(android_scenario_runner, "release_reservation", lambda reservation_id: released.append(reservation_id) or True)
        monkeypatch.setattr(android_scenario_runner, "run_dual_device", lambda **kwargs: _FakeDualResult())
        monkeypatch.setattr(android_scenario_runner, "build_artifact_path", lambda app_id, filename: tmp_path / app_id / filename)

        result = android_scenario_runner.run_dual_device_matrix_entry(
            run_id="compat-2",
            android_version="14",
            profile_id="dual-device-balanced",
            master_serial="auto",
            child_serial="auto",
            scenario_id="pairing",
        )

        assert result["status"] == "passed"
        assert result["masterSerial"] == "emulator-5554"
        assert result["childSerial"] == "emulator-5556"
        assert "reservationId" not in result
        assert Path(str(result["artifacts"]["master"]["logcatPath"])).exists()
        assert released == ["emu-456"]
