"""Integrationstests: Zusammenspiel der Module adb_client → debug_token → usb_test_runner → dual_device_runner."""
from __future__ import annotations

import hashlib
import hmac
import sys
import textwrap
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from adb_client import AdbClient, AdbDevice, AdbResult
from debug_token import compute_debug_token, SUFFIXES, PACKAGES
from usb_test_runner import UsbTestRunResult, parse_junit_xml, run_usb_test
from dual_device_runner import DualDeviceResult, run_dual_device


# ═══════════════════════════════════════════════════════════════════
#  Integration: debug_token + adb_client
# ═══════════════════════════════════════════════════════════════════

class TestTokenAdbIntegration:
    """Prüft dass Token aus compute_debug_token das Format hat,
    das adb activate_debug_session als Broadcast-Extra erwartet."""

    def test_token_format_master(self):
        secret = "integration_test_secret"
        challenge = "abc123"
        token = compute_debug_token(secret, challenge, "master")
        # Token muss 64-Zeichen Hex sein
        assert len(token) == 64
        int(token, 16)  # Valid hex

    def test_token_roundtrip_verification(self):
        """Verifiziert: gleiche Eingaben → gleicher Token (deterministisch)."""
        secret = "roundtrip_secret"
        challenge = "roundtrip_challenge"
        t1 = compute_debug_token(secret, challenge, "master")
        t2 = compute_debug_token(secret, challenge, "master")
        assert t1 == t2

    def test_token_differs_per_app(self):
        """Master und Child Tokens müssen sich unterscheiden bei gleicher Challenge/Secret."""
        secret = "shared_secret"
        challenge = "same_challenge"
        t_master = compute_debug_token(secret, challenge, "master")
        t_child = compute_debug_token(secret, challenge, "child")
        assert t_master != t_child

    def test_packages_match_between_modules(self):
        """PACKAGES in debug_token müssen die gleichen Pakete sein, die
        adb_client bei debug-Aktionen verwendet."""
        assert "com.minimaster.masterapp" == PACKAGES["master"]
        assert "com.google.pairing" == PACKAGES["child"]


# ═══════════════════════════════════════════════════════════════════
#  Integration: usb_test_runner + parse_junit_xml
# ═══════════════════════════════════════════════════════════════════

class TestUsbRunnerJunitIntegration:
    def test_parse_junit_produces_summary_for_usb_result(self, tmp_path: Path):
        """JUnit-Ergebnis wird korrekt in InstrumentedTestSummary übersetzt."""
        xml = textwrap.dedent("""\
            <?xml version="1.0"?>
            <testsuite tests="4" failures="1" errors="0" skipped="1">
                <testcase classname="com.minimaster.TestA" name="pass1"/>
                <testcase classname="com.minimaster.TestA" name="pass2"/>
                <testcase classname="com.minimaster.TestA" name="skip1"><skipped/></testcase>
                <testcase classname="com.minimaster.TestA" name="fail1">
                    <failure>AssertionError: expected true</failure>
                </testcase>
            </testsuite>
        """)
        (tmp_path / "TEST-suite.xml").write_text(xml, encoding="utf-8")
        summary = parse_junit_xml(tmp_path)

        assert summary.total == 4
        assert summary.passed == 2
        assert summary.failed == 1
        assert summary.skipped == 1
        assert summary.ok is False
        assert len(summary.failures) == 1
        assert summary.failures[0].classname == "com.minimaster.TestA"


# ═══════════════════════════════════════════════════════════════════
#  Integration: run_usb_test vollständiger Pfad (alle Schritte gemockt)
# ═══════════════════════════════════════════════════════════════════

class TestFullUsbTestFlow:
    """Simuliert einen kompletten USB-Testlauf mit allen Mock-Schichten."""

    @patch("usb_test_runner.subprocess.run")
    @patch("usb_test_runner.generate_token", return_value="a" * 64)
    @patch("usb_test_runner.AdbClient")
    def test_full_master_commissioning_flow(
        self, mock_client_cls, mock_gen_token, mock_subprocess
    ):
        mock_client_cls.list_devices.return_value = [AdbDevice(serial="PIXEL7", state="device")]

        mock_client = MagicMock()
        mock_client.get_device_model.return_value = "Pixel 7"
        mock_client.get_android_version.return_value = "14"
        mock_client.request_debug_challenge.return_value = "challenge_xyz"
        mock_client.activate_debug_session.return_value = True
        mock_client.deactivate_debug_session.return_value = AdbResult(0, "", "")
        mock_client_cls.return_value = mock_client

        mock_subprocess.return_value = MagicMock(returncode=0, stdout="BUILD SUCCESSFUL", stderr="")

        result = run_usb_test(
            app_id="master",
            serial="auto",
            suite="commissioning",
            skip_activation=False,
            verbose=False,
        )

        assert result.serial == "PIXEL7"
        assert result.app_id == "master"
        assert result.gradle_exit_code == 0
        # Challenge, Token, Activate, Deactivate sollten aufgerufen worden sein
        mock_client.request_debug_challenge.assert_called_once()
        mock_gen_token.assert_called_once_with("master", "challenge_xyz")
        mock_client.activate_debug_session.assert_called_once()
        mock_client.deactivate_debug_session.assert_called_once()

    @patch("usb_test_runner.subprocess.run")
    @patch("usb_test_runner.generate_token", return_value="b" * 64)
    @patch("usb_test_runner.AdbClient")
    def test_full_flow_skip_activation(
        self, mock_client_cls, mock_gen_token, mock_subprocess
    ):
        mock_client_cls.list_devices.return_value = [AdbDevice(serial="DEV1", state="device")]

        mock_client = MagicMock()
        mock_client.get_device_model.return_value = "Galaxy"
        mock_client.get_android_version.return_value = "13"
        mock_client_cls.return_value = mock_client

        mock_subprocess.return_value = MagicMock(returncode=0, stdout="OK", stderr="")

        result = run_usb_test(
            app_id="child",
            serial="DEV1",
            skip_activation=True,
            verbose=False,
        )

        mock_client.request_debug_challenge.assert_not_called()
        mock_gen_token.assert_not_called()
        mock_client.activate_debug_session.assert_not_called()
        mock_client.deactivate_debug_session.assert_not_called()


# ═══════════════════════════════════════════════════════════════════
#  Integration: dual_device_runner → usb_test_runner
# ═══════════════════════════════════════════════════════════════════

class TestDualDeviceIntegration:
    @patch("dual_device_runner.run_usb_test")
    def test_dual_calls_usb_with_correct_serials(self, mock_usb_test):
        """Dual-Device gibt korrekte Serials an run_usb_test weiter."""
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "passed"
        mock_usb_test.side_effect = [master_res, child_res]

        result = run_dual_device(master_serial="M1", child_serial="C1", verbose=False)
        assert result.overall_status == "passed"

        calls = mock_usb_test.call_args_list
        assert calls[0][1]["app_id"] == "master"
        assert calls[0][1]["serial"] == "M1"
        assert calls[1][1]["app_id"] == "child"
        assert calls[1][1]["serial"] == "C1"

    @patch("dual_device_runner.run_usb_test")
    def test_dual_result_dict_complete(self, mock_usb_test):
        """to_dict() enthält alle Felder für JSON-Serialisierung."""
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "failed"
        mock_usb_test.side_effect = [master_res, child_res]

        result = run_dual_device(master_serial="M1", child_serial="C1", verbose=False)
        d = result.to_dict()

        assert "masterSerial" in d
        assert "childSerial" in d
        assert "masterResult" in d
        assert "childResult" in d
        assert "overallStatus" in d
        assert "durationSec" in d
        assert "timestamp" in d
        assert d["overallStatus"] == "failed"


# ═══════════════════════════════════════════════════════════════════
#  Integration: UsbTestRunResult Serialisierung
# ═══════════════════════════════════════════════════════════════════

class TestResultSerialization:
    def test_usb_result_json_serializable(self):
        """UsbTestRunResult.to_dict() muss komplett JSON-serialisierbar sein."""
        import json
        r = UsbTestRunResult(app_id="master", serial="X", suite="default")
        r.overall_status = "passed"
        r.steps.append({
            "id": "check",
            "title": "Gerät prüfen",
            "status": "pass",
            "details": "OK",
            "timestamp": "2026-01-01T00:00:00Z",
        })
        d = r.to_dict()
        serialized = json.dumps(d)
        assert isinstance(serialized, str)
        restored = json.loads(serialized)
        assert restored["app_id"] == "master"

    def test_dual_result_json_serializable(self):
        import json
        r = DualDeviceResult(master_serial="M", child_serial="C")
        d = r.to_dict()
        serialized = json.dumps(d)
        assert isinstance(serialized, str)
