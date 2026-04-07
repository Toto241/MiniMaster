"""Tests für dual_device_runner.py — Dual-Device Commissioning."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dual_device_runner import DualDeviceResult, run_dual_device


# ═══════════════════════════════════════════════════════════════════
#  DualDeviceResult
# ═══════════════════════════════════════════════════════════════════

class TestDualDeviceResult:
    def test_default_values(self):
        r = DualDeviceResult(master_serial="M1", child_serial="C1")
        assert r.overall_status == "not_started"
        assert r.master_result is None
        assert r.child_result is None
        assert r.scenario_id == ""

    def test_to_dict_structure(self):
        r = DualDeviceResult(master_serial="M1", child_serial="C1")
        d = r.to_dict()
        assert d["masterSerial"] == "M1"
        assert d["childSerial"] == "C1"
        assert d["scenarioId"] == ""
        assert "timestamp" in d
        assert d["masterResult"] is None
        assert d["childResult"] is None

    def test_to_dict_with_results(self):
        from usb_test_runner import UsbTestRunResult
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "passed"

        r = DualDeviceResult(
            master_serial="M1",
            child_serial="C1",
            master_result=master_res,
            child_result=child_res,
            overall_status="passed",
            scenario_id="pairing-token-happy-path",
            scenario_title="Pairing per Token Happy Path",
            profile_id="dual-device-balanced",
            fault_modes=["timeout"],
        )
        d = r.to_dict()
        assert d["masterResult"] is not None
        assert d["childResult"] is not None
        assert d["overallStatus"] == "passed"
        assert d["scenarioId"] == "pairing-token-happy-path"
        assert d["profileId"] == "dual-device-balanced"
        assert d["faultModes"] == ["timeout"]
        assert d["executionPlan"] == []
        assert d["timeline"] == []


# ═══════════════════════════════════════════════════════════════════
#  run_dual_device — sequentiell
# ═══════════════════════════════════════════════════════════════════

class TestRunDualDeviceSequential:
    @patch("dual_device_runner.run_usb_test")
    def test_both_pass(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "passed"

        mock_run.side_effect = [master_res, child_res]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            verbose=False,
        )
        assert result.overall_status == "passed"
        assert result.master_result is master_res
        assert result.child_result is child_res
        assert mock_run.call_count == 2

    @patch("dual_device_runner.run_usb_test")
    def test_master_fails(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "failed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "passed"

        mock_run.side_effect = [master_res, child_res]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            verbose=False,
        )
        assert result.overall_status == "failed"

    @patch("dual_device_runner.run_usb_test")
    def test_child_fails(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "failed"

        mock_run.side_effect = [master_res, child_res]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            verbose=False,
        )
        assert result.overall_status == "failed"

    @patch("dual_device_runner.run_usb_test")
    def test_both_fail(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "failed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "failed"

        mock_run.side_effect = [master_res, child_res]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            verbose=False,
        )
        assert result.overall_status == "failed"

    @patch("dual_device_runner.run_usb_test")
    def test_duration_recorded(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        mock_run.return_value = UsbTestRunResult(
            app_id="master", serial="X", suite="commissioning",
        )
        mock_run.return_value.overall_status = "passed"

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            verbose=False,
        )
        assert result.duration_sec >= 0

    @patch("dual_device_runner.run_usb_test")
    def test_passes_install_options(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        mock_run.return_value = UsbTestRunResult(
            app_id="master", serial="X", suite="commissioning",
        )
        mock_run.return_value.overall_status = "passed"

        run_dual_device(
            master_serial="M1",
            child_serial="C1",
            install_apk=True,
            master_apk_path="/apk/master.apk",
            child_apk_path="/apk/child.apk",
            uninstall_first=True,
            verbose=False,
        )

        calls = mock_run.call_args_list
        assert calls[0][1]["install_apk"] is True
        assert calls[0][1]["apk_path"] == "/apk/master.apk"
        assert calls[0][1]["uninstall_first"] is True
        assert calls[1][1]["install_apk"] is True
        assert calls[1][1]["apk_path"] == "/apk/child.apk"

    @patch("dual_device_runner.run_usb_test")
    def test_accepts_known_scenario_and_fault_mode(self, mock_run):
        from usb_test_runner import UsbTestRunResult
        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "passed"
        mock_run.side_effect = [master_res, child_res]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            scenario_id="offline-online-resync",
            profile_id="dual-device-balanced",
            fault_modes=["disconnect"],
            verbose=False,
        )

        assert result.scenario_id == "offline-online-resync"
        assert result.profile_id == "dual-device-balanced"
        assert result.fault_modes == ["disconnect"]
        assert result.execution_plan
        assert any(step["kind"] == "fault-mode" for step in result.execution_plan)
        assert result.timeline
        assert result.timeline[-1]["phase"] == "summary"

    def test_rejects_non_dual_device_profile(self):
        try:
            run_dual_device(
                master_serial="M1",
                child_serial="C1",
                profile_id="phone-standard",
                verbose=False,
            )
        except ValueError as exc:
            assert "kein Dual-Device-Profil" in str(exc)
        else:
            raise AssertionError("Expected ValueError for non-dual profile")

    @patch("dual_device_runner.run_usb_test")
    def test_emits_events_via_callback(self, mock_run):
        from usb_test_runner import UsbTestRunResult

        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "passed"
        mock_run.side_effect = [master_res, child_res]

        events: list[dict[str, object]] = []
        run_dual_device(
            master_serial="M1",
            child_serial="C1",
            scenario_id="offline-online-resync",
            profile_id="dual-device-balanced",
            fault_modes=["disconnect"],
            on_event=events.append,
            verbose=False,
        )

        assert events
        assert events[0]["phase"] == "preflight"
        assert events[-1]["phase"] == "summary"

    def test_rejects_unknown_scenario(self):
        try:
            run_dual_device(
                master_serial="M1",
                child_serial="C1",
                scenario_id="does-not-exist",
                verbose=False,
            )
        except ValueError as exc:
            assert "Unbekannte Dual-Device-Szenario-ID" in str(exc)
        else:
            raise AssertionError("Expected ValueError for unknown scenario")

    def test_rejects_fault_mode_not_allowed_by_scenario(self):
        try:
            run_dual_device(
                master_serial="M1",
                child_serial="C1",
                scenario_id="pairing-code-expiry",
                fault_modes=["disconnect"],
                verbose=False,
            )
        except ValueError as exc:
            assert "Fault Modes" in str(exc)
            assert "Erlaubt" in str(exc)
        else:
            raise AssertionError("Expected ValueError for invalid fault mode")


# ═══════════════════════════════════════════════════════════════════
#  run_dual_device — parallel
# ═══════════════════════════════════════════════════════════════════

class TestRunDualDeviceParallel:
    @patch("dual_device_runner.run_usb_test")
    def test_parallel_both_pass(self, mock_run):
        from usb_test_runner import UsbTestRunResult

        def _make_result(**kwargs):
            r = UsbTestRunResult(suite="commissioning", **kwargs)
            r.overall_status = "passed"
            return r

        mock_run.side_effect = [
            _make_result(app_id="master", serial="M1"),
            _make_result(app_id="child", serial="C1"),
        ]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            parallel=True,
            verbose=False,
        )
        assert result.overall_status == "passed"
        assert mock_run.call_count == 2

    @patch("dual_device_runner.run_usb_test")
    def test_parallel_one_fails(self, mock_run):
        from usb_test_runner import UsbTestRunResult

        master_res = UsbTestRunResult(app_id="master", serial="M1", suite="commissioning")
        master_res.overall_status = "passed"
        child_res = UsbTestRunResult(app_id="child", serial="C1", suite="commissioning")
        child_res.overall_status = "failed"

        mock_run.side_effect = [master_res, child_res]

        result = run_dual_device(
            master_serial="M1",
            child_serial="C1",
            parallel=True,
            verbose=False,
        )
        assert result.overall_status == "failed"
