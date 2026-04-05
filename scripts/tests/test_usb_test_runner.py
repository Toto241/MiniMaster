"""Tests für usb_test_runner.py — USB-Testlauf-Runner."""
from __future__ import annotations

import sys
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from usb_test_runner import (
    APP_MODULES,
    COMMISSIONING_FILTERS,
    UsbTestRunResult,
    parse_junit_xml,
    run_usb_test,
)


# ═══════════════════════════════════════════════════════════════════
#  UsbTestRunResult
# ═══════════════════════════════════════════════════════════════════

class TestUsbTestRunResult:
    def test_default_values(self):
        r = UsbTestRunResult(app_id="master", serial="X", suite="default")
        assert r.overall_status == "not_started"
        assert r.error is None
        assert r.steps == []

    def test_to_dict(self):
        r = UsbTestRunResult(app_id="child", serial="Y", suite="commissioning")
        d = r.to_dict()
        assert d["app_id"] == "child"
        assert d["serial"] == "Y"
        assert isinstance(d["steps"], list)
        assert d["status"] == "not_started"


# ═══════════════════════════════════════════════════════════════════
#  parse_junit_xml
# ═══════════════════════════════════════════════════════════════════

class TestParseJunitXml:
    def test_parses_passing_testsuite(self, tmp_path: Path):
        xml_content = textwrap.dedent("""\
            <?xml version="1.0" encoding="UTF-8"?>
            <testsuite name="com.minimaster.TestSuite" tests="3" failures="0" errors="0" skipped="0">
                <testcase classname="com.minimaster.TestA" name="testOne" />
                <testcase classname="com.minimaster.TestA" name="testTwo" />
                <testcase classname="com.minimaster.TestB" name="testThree" />
            </testsuite>
        """)
        xml_file = tmp_path / "TEST-result.xml"
        xml_file.write_text(xml_content, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.total == 3
        assert summary.passed == 3
        assert summary.failed == 0
        assert summary.ok is True

    def test_parses_failures(self, tmp_path: Path):
        xml_content = textwrap.dedent("""\
            <?xml version="1.0" encoding="UTF-8"?>
            <testsuite name="TestSuite" tests="2" failures="1" errors="0" skipped="0">
                <testcase classname="A" name="pass1" />
                <testcase classname="A" name="fail1">
                    <failure message="expected true">AssertionError</failure>
                </testcase>
            </testsuite>
        """)
        xml_file = tmp_path / "TEST-fail.xml"
        xml_file.write_text(xml_content, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.total == 2
        assert summary.failed == 1
        assert summary.passed == 1
        assert summary.ok is False
        assert len(summary.failures) == 1
        assert summary.failures[0].name == "fail1"

    def test_parses_errors(self, tmp_path: Path):
        xml_content = textwrap.dedent("""\
            <?xml version="1.0" encoding="UTF-8"?>
            <testsuite name="TestSuite" tests="1" failures="0" errors="1" skipped="0">
                <testcase classname="B" name="errTest">
                    <error message="NPE">NullPointerException</error>
                </testcase>
            </testsuite>
        """)
        xml_file = tmp_path / "TEST-err.xml"
        xml_file.write_text(xml_content, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.failed == 1
        assert len(summary.failures) == 1
        assert summary.failures[0].name == "errTest"

    def test_parses_skipped(self, tmp_path: Path):
        xml_content = textwrap.dedent("""\
            <?xml version="1.0" encoding="UTF-8"?>
            <testsuite name="TestSuite" tests="2" failures="0" errors="0" skipped="1">
                <testcase classname="C" name="ok1" />
                <testcase classname="C" name="skip1"><skipped /></testcase>
            </testsuite>
        """)
        xml_file = tmp_path / "TEST-skip.xml"
        xml_file.write_text(xml_content, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.skipped == 1

    def test_returns_empty_when_dir_missing(self, tmp_path: Path):
        summary = parse_junit_xml(tmp_path / "nonexistent")
        assert summary.total == 0

    def test_handles_invalid_xml(self, tmp_path: Path):
        bad_file = tmp_path / "TEST-bad.xml"
        bad_file.write_text("not xml at all", encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.total == 0

    def test_multiple_xml_files(self, tmp_path: Path):
        for i, (tests, fails) in enumerate([(3, 0), (2, 1)]):
            xml = textwrap.dedent(f"""\
                <?xml version="1.0"?>
                <testsuite tests="{tests}" failures="{fails}" errors="0" skipped="0">
                    {"".join(f'<testcase classname="X" name="t{j}" />' for j in range(tests - fails))}
                    {"".join(f'<testcase classname="X" name="f{j}"><failure>nope</failure></testcase>' for j in range(fails))}
                </testsuite>
            """)
            (tmp_path / f"TEST-{i}.xml").write_text(xml, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.total == 5
        assert summary.failed == 1
        assert summary.passed == 4

    def test_nested_testsuites(self, tmp_path: Path):
        """testsuites wrapper around multiple testsuite elements."""
        xml_content = textwrap.dedent("""\
            <?xml version="1.0"?>
            <testsuites>
                <testsuite tests="1" failures="0" errors="0" skipped="0">
                    <testcase classname="A" name="ok1" />
                </testsuite>
                <testsuite tests="1" failures="1" errors="0" skipped="0">
                    <testcase classname="A" name="f1"><failure>x</failure></testcase>
                </testsuite>
            </testsuites>
        """)
        (tmp_path / "TEST-nested.xml").write_text(xml_content, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)
        assert summary.total == 2
        assert summary.failed == 1


# ═══════════════════════════════════════════════════════════════════
#  run_usb_test — Fehlerfälle
# ═══════════════════════════════════════════════════════════════════

class TestRunUsbTestErrors:
    def test_invalid_app_id(self):
        result = run_usb_test(app_id="invalid", verbose=False)
        assert result.overall_status == "error"
        assert "Ungültige App-ID" in (result.error or "")

    @patch("usb_test_runner.AdbClient.list_devices", return_value=[])
    def test_no_devices(self, mock_devices):
        result = run_usb_test(app_id="master", verbose=False)
        assert result.overall_status == "error"
        assert "Kein ADB-Gerät" in (result.error or "")
        assert any(s["id"] == "check-device" and s["status"] == "fail" for s in result.steps)

    @patch("usb_test_runner.AdbClient.list_devices")
    def test_specified_serial_not_found(self, mock_devices):
        from adb_client import AdbDevice
        mock_devices.return_value = [AdbDevice(serial="OTHER", state="device")]
        result = run_usb_test(app_id="master", serial="MISSING", verbose=False)
        assert result.overall_status == "error"
        assert "nicht gefunden" in (result.error or "")


# ═══════════════════════════════════════════════════════════════════
#  run_usb_test — kein Device-Gerät angeschlossen
# ═══════════════════════════════════════════════════════════════════

class TestRunUsbTestNoApk:
    @patch("usb_test_runner.AdbClient")
    def test_install_apk_no_file(self, mock_client_cls):
        from adb_client import AdbDevice
        mock_client_cls.list_devices.return_value = [AdbDevice(serial="DEV1", state="device")]
        mock_client = MagicMock()
        mock_client.get_device_model.return_value = "Pixel"
        mock_client.get_android_version.return_value = "14"
        mock_client_cls.return_value = mock_client

        result = run_usb_test(
            app_id="master",
            serial="DEV1",
            install_apk=True,
            apk_path="/nonexistent/app.apk",
            verbose=False,
        )
        assert result.overall_status == "error"
        assert "Keine APK" in (result.error or "") or "APK" in (result.error or "")

    @patch("usb_test_runner.AdbClient")
    @patch("usb_test_runner.resolve_latest_apk")
    def test_install_apk_user_restricted_is_skipped(self, mock_resolve_apk, mock_client_cls, tmp_path: Path):
        from adb_client import AdbDevice, AdbResult

        apk_path = tmp_path / "master-debug.apk"
        apk_path.write_text("apk", encoding="utf-8")
        mock_resolve_apk.return_value = apk_path
        mock_client_cls.list_devices.return_value = [AdbDevice(serial="DEV1", state="device")]

        mock_client = MagicMock()
        mock_client.get_device_model.return_value = "Xiaomi"
        mock_client.get_android_version.return_value = "15"
        mock_client.install_apk.return_value = AdbResult(
            returncode=1,
            stdout="Performing Streamed Install\n",
            stderr="adb.exe: failed to install app.apk: Failure [INSTALL_FAILED_USER_RESTRICTED: Install canceled by user]",
        )
        mock_client_cls.return_value = mock_client

        result = run_usb_test(
            app_id="master",
            serial="DEV1",
            install_apk=True,
            verbose=False,
        )

        assert result.overall_status == "skipped"
        assert "INSTALL_FAILED_USER_RESTRICTED" in (result.error or "")
        assert "Install via USB" in (result.reason or "")
        assert any(s["id"] == "install-apk" and s["status"] == "skipped" for s in result.steps)


# ═══════════════════════════════════════════════════════════════════
#  run_usb_test — Skip Activation + fehlende Challenge
# ═══════════════════════════════════════════════════════════════════

class TestRunUsbTestActivation:
    @patch("usb_test_runner.subprocess.run")
    @patch("usb_test_runner.AdbClient")
    def test_skip_activation_steps(self, mock_client_cls, mock_subprocess):
        from adb_client import AdbDevice
        mock_client_cls.list_devices.return_value = [AdbDevice(serial="DEV1", state="device")]
        mock_client = MagicMock()
        mock_client.get_device_model.return_value = "Pixel"
        mock_client.get_android_version.return_value = "14"
        mock_client.request_debug_challenge.return_value = None
        mock_client_cls.return_value = mock_client

        # Gradle mock
        mock_subprocess.return_value = MagicMock(returncode=0, stdout="BUILD SUCCESSFUL", stderr="")

        result = run_usb_test(
            app_id="master",
            serial="DEV1",
            skip_activation=True,
            verbose=False,
        )
        # Should proceed past activation steps
        skipped_steps = [s for s in result.steps if s["status"] == "skipped" and "Challenge" in str(s["title"])]
        assert len(skipped_steps) >= 1

    @patch("usb_test_runner.AdbClient")
    def test_challenge_not_found(self, mock_client_cls):
        from adb_client import AdbDevice
        mock_client_cls.list_devices.return_value = [AdbDevice(serial="DEV1", state="device")]
        mock_client = MagicMock()
        mock_client.get_device_model.return_value = "Pixel"
        mock_client.get_android_version.return_value = "14"
        mock_client.request_debug_challenge_result.return_value = MagicMock(
            challenge=None,
            reason="Debug-Interface ist im App-Build deaktiviert.",
            details="Debug interface is DISABLED",
        )
        mock_client_cls.return_value = mock_client

        result = run_usb_test(app_id="master", serial="DEV1", verbose=False)
        assert result.overall_status == "error"
        assert "deaktiviert" in (result.error or "")


# ═══════════════════════════════════════════════════════════════════
#  Konstanten
# ═══════════════════════════════════════════════════════════════════

class TestConstants:
    def test_app_modules(self):
        assert APP_MODULES["master"] == ":masterApp"
        assert APP_MODULES["child"] == ":childApp"

    def test_commissioning_filters(self):
        assert "master" in COMMISSIONING_FILTERS
        assert "child" in COMMISSIONING_FILTERS
        assert len(COMMISSIONING_FILTERS["master"]) > 0
        assert len(COMMISSIONING_FILTERS["child"]) > 0
        for f in COMMISSIONING_FILTERS["master"]:
            assert "." in f  # Fully qualified class name
