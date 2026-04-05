"""Tests für adb_client.py — ADB-Wrapper-Modul."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from adb_client import (
    AdbClient,
    AdbDevice,
    AdbResult,
    ChallengeRequestResult,
    InstrumentedTestSummary,
    TestCaseResult,
    adb_available,
    resolve_latest_apk,
)


# ═══════════════════════════════════════════════════════════════════
#  AdbDevice
# ═══════════════════════════════════════════════════════════════════

class TestAdbDevice:
    def test_ready_device(self):
        dev = AdbDevice(serial="ABC123", state="device")
        assert dev.is_ready is True

    def test_offline_device(self):
        dev = AdbDevice(serial="ABC123", state="offline")
        assert dev.is_ready is False

    def test_unauthorized_device(self):
        dev = AdbDevice(serial="ABC123", state="unauthorized")
        assert dev.is_ready is False

    def test_frozen_dataclass(self):
        dev = AdbDevice(serial="X", state="device")
        with pytest.raises(AttributeError):
            dev.serial = "Y"  # type: ignore[misc]


# ═══════════════════════════════════════════════════════════════════
#  AdbResult
# ═══════════════════════════════════════════════════════════════════

class TestAdbResult:
    def test_ok_result(self):
        r = AdbResult(returncode=0, stdout="OK", stderr="")
        assert r.ok is True
        assert r.output == "OK"

    def test_error_result(self):
        r = AdbResult(returncode=1, stdout="", stderr="error")
        assert r.ok is False
        assert r.output == "error"

    def test_combined_output(self):
        r = AdbResult(returncode=0, stdout="out\n", stderr="err\n")
        assert r.output == "out\nerr"


# ═══════════════════════════════════════════════════════════════════
#  InstrumentedTestSummary
# ═══════════════════════════════════════════════════════════════════

class TestInstrumentedTestSummary:
    def test_ok_when_all_passed(self):
        s = InstrumentedTestSummary(total=5, passed=5, failed=0)
        assert s.ok is True

    def test_not_ok_when_failed(self):
        s = InstrumentedTestSummary(total=5, passed=4, failed=1)
        assert s.ok is False

    def test_not_ok_when_empty(self):
        s = InstrumentedTestSummary()
        assert s.ok is False

    def test_failures_list(self):
        tc = TestCaseResult(classname="Foo", name="test1", passed=False, message="boom")
        s = InstrumentedTestSummary(total=1, failed=1, failures=[tc])
        assert len(s.failures) == 1
        assert s.failures[0].message == "boom"


# ═══════════════════════════════════════════════════════════════════
#  adb_available
# ═══════════════════════════════════════════════════════════════════

class TestAdbAvailable:
    @patch("adb_client.shutil.which", return_value="/usr/bin/adb")
    def test_available(self, mock_which):
        assert adb_available() is True

    @patch("adb_client.shutil.which", return_value=None)
    def test_not_available(self, mock_which):
        assert adb_available() is False


# ═══════════════════════════════════════════════════════════════════
#  AdbClient.run
# ═══════════════════════════════════════════════════════════════════

class TestAdbClientRun:
    @patch("adb_client.subprocess.run")
    def test_successful_command(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="ok", stderr="")
        client = AdbClient(serial="ABC")
        result = client.run(["shell", "echo", "hi"])
        assert result.ok is True
        assert result.stdout == "ok"
        cmd = mock_run.call_args[0][0]
        assert "-s" in cmd
        assert "ABC" in cmd

    @patch("adb_client.subprocess.run")
    def test_command_without_serial(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        client = AdbClient()
        client.run(["devices"])
        cmd = mock_run.call_args[0][0]
        assert "-s" not in cmd

    @patch("adb_client.subprocess.run", side_effect=subprocess.TimeoutExpired("adb", 30))
    def test_timeout(self, mock_run):
        client = AdbClient(serial="X", timeout=30)
        result = client.run(["shell", "sleep", "60"])
        assert result.ok is False
        assert result.returncode == 124
        assert "Timeout" in result.stderr

    @patch("adb_client.subprocess.run", side_effect=FileNotFoundError())
    def test_adb_not_found(self, mock_run):
        client = AdbClient()
        result = client.run(["devices"])
        assert result.ok is False
        assert result.returncode == 127
        assert "nicht gefunden" in result.stderr

    @patch("adb_client.subprocess.run")
    def test_custom_timeout_override(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        client = AdbClient(timeout=10)
        client.run(["install", "foo.apk"], timeout=120)
        assert mock_run.call_args[1]["timeout"] == 120


# ═══════════════════════════════════════════════════════════════════
#  AdbClient.list_devices
# ═══════════════════════════════════════════════════════════════════

class TestListDevices:
    @patch("adb_client.subprocess.run")
    def test_two_devices(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="List of devices attached\nABC123\tdevice\nDEF456\toffline\n\n",
            stderr="",
        )
        devices = AdbClient.list_devices()
        assert len(devices) == 2
        assert devices[0].serial == "ABC123"
        assert devices[0].is_ready is True
        assert devices[1].serial == "DEF456"
        assert devices[1].is_ready is False

    @patch("adb_client.subprocess.run")
    def test_no_devices(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="List of devices attached\n\n",
            stderr="",
        )
        devices = AdbClient.list_devices()
        assert devices == []

    @patch("adb_client.subprocess.run", side_effect=FileNotFoundError())
    def test_adb_missing(self, mock_run):
        devices = AdbClient.list_devices()
        assert devices == []

    @patch("adb_client.subprocess.run", side_effect=subprocess.TimeoutExpired("adb", 10))
    def test_timeout(self, mock_run):
        devices = AdbClient.list_devices()
        assert devices == []


# ═══════════════════════════════════════════════════════════════════
#  AdbClient.first_ready_device
# ═══════════════════════════════════════════════════════════════════

class TestFirstReadyDevice:
    @patch("adb_client.subprocess.run")
    def test_returns_first_ready(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="List of devices attached\nOFF1\toffline\nREADY1\tdevice\nREADY2\tdevice\n",
            stderr="",
        )
        serial = AdbClient.first_ready_device()
        assert serial == "READY1"

    @patch("adb_client.subprocess.run")
    def test_none_when_no_ready(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="List of devices attached\nX\toffline\n",
            stderr="",
        )
        assert AdbClient.first_ready_device() is None


# ═══════════════════════════════════════════════════════════════════
#  AdbClient — Geräte-Info-Methoden
# ═══════════════════════════════════════════════════════════════════

class TestDeviceInfoMethods:
    @patch("adb_client.subprocess.run")
    def test_get_screen_state_on(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="mScreenState=ON", stderr="")
        client = AdbClient(serial="X")
        assert client.get_screen_state() == "ON"

    @patch("adb_client.subprocess.run")
    def test_get_screen_state_off(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="mScreenState=OFF", stderr="")
        client = AdbClient(serial="X")
        assert client.get_screen_state() == "OFF"

    @patch("adb_client.subprocess.run")
    def test_get_screen_state_unknown_on_error(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="err")
        client = AdbClient(serial="X")
        assert client.get_screen_state() == "unknown"

    @patch("adb_client.subprocess.run")
    def test_is_screen_locked_true(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="mDreamingLockscreen=true\nother stuff",
            stderr="",
        )
        client = AdbClient(serial="X")
        assert client.is_screen_locked() is True

    @patch("adb_client.subprocess.run")
    def test_is_screen_locked_false(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="mDreamingLockscreen=false\nother stuff",
            stderr="",
        )
        client = AdbClient(serial="X")
        assert client.is_screen_locked() is False

    @patch("adb_client.subprocess.run")
    def test_is_screen_locked_none_on_error(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="err")
        client = AdbClient(serial="X")
        assert client.is_screen_locked() is None

    @patch("adb_client.subprocess.run")
    def test_get_foreground_activity(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="  mResumedActivity: ActivityRecord{abc u0 com.example/.MainActivity t1}\n",
            stderr="",
        )
        client = AdbClient(serial="X")
        assert client.get_foreground_activity() == "com.example/.MainActivity"

    @patch("adb_client.subprocess.run")
    def test_get_foreground_activity_none_on_error(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="err")
        client = AdbClient(serial="X")
        assert client.get_foreground_activity() is None

    @patch("adb_client.subprocess.run")
    def test_get_device_model(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="Pixel 7\n", stderr="")
        client = AdbClient(serial="X")
        assert client.get_device_model() == "Pixel 7"

    @patch("adb_client.subprocess.run")
    def test_get_android_version(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="14\n", stderr="")
        client = AdbClient(serial="X")
        assert client.get_android_version() == "14"

    @patch("adb_client.subprocess.run")
    def test_get_installed_packages(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="package:com.example\npackage:com.other\n",
            stderr="",
        )
        client = AdbClient(serial="X")
        pkgs = client.get_installed_packages()
        assert "com.example" in pkgs
        assert "com.other" in pkgs

    @patch("adb_client.subprocess.run")
    def test_is_package_installed(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="package:com.minimaster.masterapp\n",
            stderr="",
        )
        client = AdbClient(serial="X")
        assert client.is_package_installed("com.minimaster.masterapp") is True
        assert client.is_package_installed("com.other.app") is False


# ═══════════════════════════════════════════════════════════════════
#  AdbClient — Broadcast und Logcat
# ═══════════════════════════════════════════════════════════════════

class TestBroadcastLogcat:
    @patch("adb_client.subprocess.run")
    def test_send_broadcast_with_extras(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="Broadcasting...", stderr="")
        client = AdbClient(serial="X")
        result = client.send_broadcast("com.test.ACTION", extras={"key": "val"})
        assert result.ok
        cmd = mock_run.call_args[0][0]
        assert "-a" in cmd
        assert "com.test.ACTION" in cmd
        assert "-e" in cmd
        assert "key" in cmd
        assert "val" in cmd

    @patch("adb_client.subprocess.run")
    def test_read_logcat(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="line1\nline2\nline3\n",
            stderr="",
        )
        client = AdbClient(serial="X")
        lines = client.read_logcat("MY_TAG")
        assert len(lines) == 3

    @patch("adb_client.subprocess.run")
    def test_read_logcat_max_lines(self, mock_run):
        many_lines = "\n".join(f"line{i}" for i in range(100))
        mock_run.return_value = MagicMock(returncode=0, stdout=many_lines, stderr="")
        client = AdbClient(serial="X")
        lines = client.read_logcat("TAG", max_lines=10)
        assert len(lines) == 10

    @patch("adb_client.subprocess.run")
    def test_read_logcat_empty_on_error(self, mock_run):
        mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="err")
        client = AdbClient(serial="X")
        assert client.read_logcat("TAG") == []


# ═══════════════════════════════════════════════════════════════════
#  AdbClient — APK-Install
# ═══════════════════════════════════════════════════════════════════

class TestApkInstall:
    @patch("adb_client.subprocess.run")
    def test_install_apk_default_flags(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="Success", stderr="")
        client = AdbClient(serial="X")
        result = client.install_apk("/tmp/app.apk")
        assert result.ok
        cmd = mock_run.call_args[0][0]
        assert "-r" in cmd
        assert "-d" in cmd

    @patch("adb_client.subprocess.run")
    def test_install_apk_no_flags(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="Success", stderr="")
        client = AdbClient(serial="X")
        result = client.install_apk("/tmp/app.apk", reinstall=False, downgrade=False)
        assert result.ok
        cmd = mock_run.call_args[0][0]
        assert "-r" not in cmd
        assert "-d" not in cmd

    @patch("adb_client.subprocess.run")
    def test_uninstall_package(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="Success", stderr="")
        client = AdbClient(serial="X")
        result = client.uninstall_package("com.example")
        assert result.ok


# ═══════════════════════════════════════════════════════════════════
#  AdbClient — Debug-Session
# ═══════════════════════════════════════════════════════════════════

class TestDebugSession:
    @patch("adb_client.time.sleep")
    @patch("adb_client.subprocess.run")
    def test_request_debug_challenge_master(self, mock_run, mock_sleep):
        """Challenge-Anforderung für Master-App."""
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(
                returncode=0,
                stdout="01-01 00:00:00.000 D/MINIMASTER_DEBUG_CHALLENGE(12345): CHALLENGE:abc123def456\n",
                stderr="",
            ),
            MagicMock(returncode=0, stdout="", stderr=""),
        ]
        client = AdbClient(serial="X")
        challenge = client.request_debug_challenge("com.minimaster.masterapp")
        assert challenge == "abc123def456"

    @patch("adb_client.time.sleep")
    @patch("adb_client.subprocess.run")
    def test_request_debug_challenge_child(self, mock_run, mock_sleep):
        """Challenge-Anforderung für Child-App mit anderem Tag."""
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(
                returncode=0,
                stdout="D MINIMASTER_DEBUG_CHALLENGE_CHILD: CHALLENGE:child999\n",
                stderr="",
            ),
            MagicMock(returncode=0, stdout="", stderr=""),
        ]
        client = AdbClient(serial="X")
        challenge = client.request_debug_challenge("com.google.pairing")
        assert challenge == "child999"

    @patch("adb_client.time.sleep")
    @patch("adb_client.time.time")
    @patch("adb_client.subprocess.run")
    def test_request_debug_challenge_not_found(self, mock_run, mock_time, mock_sleep):
        """Challenge nicht im Logcat vorhanden."""
        mock_time.side_effect = [0.0, 0.1, 3.2]
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(returncode=0, stdout="some random log\n", stderr=""),
            MagicMock(returncode=0, stdout="D/MINIMASTER_DEBUG: nothing useful\n", stderr=""),
        ]
        client = AdbClient(serial="X")
        assert client.request_debug_challenge("com.minimaster.masterapp") is None

    @patch("adb_client.time.sleep")
    @patch("adb_client.subprocess.run")
    def test_request_debug_challenge_result_reports_disabled_secret(self, mock_run, mock_sleep):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(returncode=0, stdout="", stderr=""),
            MagicMock(returncode=0, stdout="D/MINIMASTER_DEBUG: Debug interface is DISABLED (secret not configured in local.properties).\n", stderr=""),
        ]
        client = AdbClient(serial="X")
        result = client.request_debug_challenge_result("com.minimaster.masterapp")
        assert isinstance(result, ChallengeRequestResult)
        assert result.ok is False
        assert "deaktiviert" in (result.reason or "")

    @patch("adb_client.time.sleep")
    @patch("adb_client.subprocess.run")
    def test_activate_debug_session_success(self, mock_run, mock_sleep):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(
                returncode=0,
                stdout="D MINIMASTER_DEBUG: Session activated successfully\n",
                stderr="",
            ),
        ]
        client = AdbClient(serial="X")
        assert client.activate_debug_session("com.minimaster.masterapp", "token123") is True

    @patch("adb_client.time.sleep")
    @patch("adb_client.subprocess.run")
    def test_activate_debug_session_failure(self, mock_run, mock_sleep):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(returncode=0, stdout="D MINIMASTER_DEBUG: Invalid token\n", stderr=""),
        ]
        client = AdbClient(serial="X")
        assert client.activate_debug_session("com.minimaster.masterapp", "bad") is False

    @patch("adb_client.time.sleep")
    @patch("adb_client.subprocess.run")
    def test_activate_debug_session_child(self, mock_run, mock_sleep):
        """Child-App nutzt abweichenden Log-Tag."""
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="Broadcasting...", stderr=""),
            MagicMock(
                returncode=0,
                stdout="D MINIMASTER_DEBUG_CHILD: Session activated\n",
                stderr="",
            ),
        ]
        client = AdbClient(serial="X")
        assert client.activate_debug_session("com.google.pairing", "tok") is True

    @patch("adb_client.subprocess.run")
    def test_deactivate_debug_session(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        client = AdbClient(serial="X")
        result = client.deactivate_debug_session("com.minimaster.masterapp")
        assert result.ok


# ═══════════════════════════════════════════════════════════════════
#  resolve_latest_apk
# ═══════════════════════════════════════════════════════════════════

class TestResolveLatestApk:
    def test_finds_newest_apk(self, tmp_repo: Path):
        import time as _t
        apk1 = tmp_repo / "masterApp" / "build" / "outputs" / "apk" / "debug" / "old.apk"
        apk1.write_bytes(b"old")
        _t.sleep(0.05)
        apk2 = tmp_repo / "masterApp" / "build" / "outputs" / "apk" / "debug" / "new.apk"
        apk2.write_bytes(b"new")
        result = resolve_latest_apk("master", repo_root=tmp_repo)
        assert result is not None
        assert result.name == "new.apk"

    def test_returns_none_when_no_apks(self, tmp_repo: Path):
        result = resolve_latest_apk("master", repo_root=tmp_repo)
        assert result is None

    def test_returns_none_when_dir_missing(self, tmp_path: Path):
        result = resolve_latest_apk("master", repo_root=tmp_path)
        assert result is None

    def test_child_apk(self, tmp_repo: Path):
        apk = tmp_repo / "childApp" / "build" / "outputs" / "apk" / "debug" / "child.apk"
        apk.write_bytes(b"child_binary")
        result = resolve_latest_apk("child", repo_root=tmp_repo)
        assert result is not None
        assert result.name == "child.apk"

    def test_prefers_app_apk_over_androidtest_artifact(self, tmp_repo: Path):
        import time as _t

        app_apk = tmp_repo / "childApp" / "build" / "outputs" / "apk" / "debug" / "childApp-debug.apk"
        app_apk.write_bytes(b"app_binary")
        _t.sleep(0.05)
        android_test_apk = tmp_repo / "childApp" / "build" / "outputs" / "apk" / "androidTest" / "debug" / "childApp-debug-androidTest.apk"
        android_test_apk.parent.mkdir(parents=True, exist_ok=True)
        android_test_apk.write_bytes(b"test_binary")

        result = resolve_latest_apk("child", repo_root=tmp_repo)

        assert result is not None
        assert result.name == "childApp-debug.apk"
