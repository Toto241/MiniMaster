from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


SCRIPTS_DIR = Path(__file__).resolve().parent.parent
MODULE_PATH = SCRIPTS_DIR / "emulator_orchestrator.py"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

SPEC = importlib.util.spec_from_file_location("emulator_orchestrator", MODULE_PATH)
assert SPEC and SPEC.loader
emulator_orchestrator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = emulator_orchestrator
SPEC.loader.exec_module(emulator_orchestrator)


class TestAndroidEmulatorAdapter:
    def test_list_targets_merges_avds_and_running_emulators(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_orchestrator.emulator_manager, "list_avds", lambda: ["Pixel_8_API_34"])
        monkeypatch.setattr(
            emulator_orchestrator.emulator_manager,
            "list_running_emulators",
            lambda: [{"serial": "emulator-5554", "state": "device", "model": "Pixel 8", "androidVersion": "14"}],
        )

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        targets = adapter.list_targets()

        assert len(targets) == 1
        assert targets[0]["platform"] == "android"
        assert targets[0]["target_id"] == "Pixel_8_API_34"
        assert targets[0]["serial"] == "emulator-5554"

    def test_boot_target_starts_emulator_and_waits(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(
            emulator_orchestrator.emulator_manager,
            "start_emulator",
            lambda avd_name, **kwargs: {"started": True, "avdName": avd_name},
        )
        monkeypatch.setattr(
            emulator_orchestrator.AndroidEmulatorAdapter,
            "_await_serial",
            lambda self, timeout_sec=240: "emulator-5556",
        )
        monkeypatch.setattr(
            emulator_orchestrator.emulator_manager,
            "wait_for_emulator_ready",
            lambda serial, timeout_sec=240: {"ready": True, "serial": serial, "androidVersion": "14"},
        )

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        result = adapter.boot_target("Pixel_8_API_34")

        assert result["ok"] is True
        assert result["details"]["serial"] == "emulator-5556"

    def test_install_artifact_uses_adb_client(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        apk_path = tmp_path / "app-debug.apk"
        apk_path.write_bytes(b"apk")

        class FakeResult:
            ok = True
            output = "Success"

        class FakeClient:
            def __init__(self, serial: str):
                self.serial = serial

            def install_apk(self, artifact_path):
                assert str(artifact_path) == str(apk_path)
                return FakeResult()

        monkeypatch.setattr(emulator_orchestrator, "AdbClient", FakeClient)

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        result = adapter.install_artifact("emulator-5554", apk_path)

        assert result["ok"] is True
        assert result["details"]["artifactPath"] == str(apk_path)

    def test_open_deep_link_forwards_to_adb(self, monkeypatch: pytest.MonkeyPatch):
        class FakeResult:
            ok = True
            output = "Status: ok"

        calls: list[tuple[str, str | None]] = []

        class FakeClient:
            def __init__(self, serial: str):
                self.serial = serial

            def open_deep_link(self, url: str, package: str | None = None):
                calls.append((url, package))
                return FakeResult()

        monkeypatch.setattr(emulator_orchestrator, "AdbClient", FakeClient)

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        result = adapter.open_deep_link("emulator-5554", "minimaster://pair/token", package="com.google.pairing")

        assert result["ok"] is True
        assert calls == [("minimaster://pair/token", "com.google.pairing")]

    def test_capture_logs_returns_trimmed_lines(self, monkeypatch: pytest.MonkeyPatch):
        class FakeResult:
            ok = True
            stdout = "a\nb\nc\n"
            output = "a\nb\nc"

        class FakeClient:
            def __init__(self, serial: str):
                self.serial = serial

            def capture_logcat(self, **kwargs):
                return FakeResult()

        monkeypatch.setattr(emulator_orchestrator, "AdbClient", FakeClient)

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        result = adapter.capture_logs("emulator-5554", tag="E2E_TEST")

        assert result["details"]["lines"] == ["a", "b", "c"]

    def test_capture_screenshot_returns_path(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        target = tmp_path / "screen.png"

        class FakeResult:
            ok = True
            stdout = str(target)
            output = str(target)
            stderr = ""

        class FakeClient:
            def __init__(self, serial: str):
                self.serial = serial

            def capture_screenshot(self, destination):
                return FakeResult()

        monkeypatch.setattr(emulator_orchestrator, "AdbClient", FakeClient)

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        result = adapter.capture_screenshot("emulator-5554", target)

        assert result["details"]["path"] == str(target)

    def test_record_video_records_pulls_and_cleans_remote_file(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        target = tmp_path / "capture.mp4"
        calls: list[tuple[str, tuple[object, ...]]] = []

        class FakeResult:
            def __init__(self, ok: bool = True, output: str = "ok", stderr: str = ""):
                self.ok = ok
                self.output = output
                self.stderr = stderr

        class FakeClient:
            def __init__(self, serial: str):
                self.serial = serial

            def record_screen(self, remote_path, **kwargs):
                calls.append(("record", (remote_path, kwargs)))
                return FakeResult()

            def pull_file(self, remote_path, local_path):
                calls.append(("pull", (remote_path, str(local_path))))
                return FakeResult()

            def run(self, args, timeout=15):
                calls.append(("run", tuple(args)))
                return FakeResult()

        monkeypatch.setattr(emulator_orchestrator, "AdbClient", FakeClient)

        adapter = emulator_orchestrator.AndroidEmulatorAdapter()
        result = adapter.record_video("emulator-5554", target, time_limit_sec=5)

        assert result["ok"] is True
        assert result["details"]["path"] == str(target)
        assert any(entry[0] == "record" for entry in calls)
        assert any(entry[0] == "pull" for entry in calls)
        assert any(entry[0] == "run" for entry in calls)


class TestEmulatorOrchestrator:
    def test_list_targets_without_platform_flattens_all_adapters(self):
        class FakeAdapter:
            platform = "android"

            def list_targets(self):
                return [{"platform": "android", "target_id": "emu-1"}]

        orchestrator = emulator_orchestrator.EmulatorOrchestrator(adapters=[FakeAdapter()])

        assert orchestrator.list_targets() == [{"platform": "android", "target_id": "emu-1"}]

    def test_unknown_platform_raises_error(self):
        orchestrator = emulator_orchestrator.EmulatorOrchestrator(adapters=[])

        with pytest.raises(ValueError, match="Kein Adapter"):
            orchestrator.list_targets("ios")

    def test_build_artifact_path_uses_default_evidence_dir(self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setattr(emulator_orchestrator, "default_evidence_dir", lambda: tmp_path)

        path = emulator_orchestrator.build_artifact_path("master", "screen.png")

        assert path == tmp_path / "master" / "screen.png"