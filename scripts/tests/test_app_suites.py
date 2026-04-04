"""Tests für python_admin/app.py — Suite-API-Endpunkte und Hilfsfunktionen."""
from __future__ import annotations

import json
import sys
import threading
import time
from pathlib import Path
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

# app.py importiert test_automation usw. beim Laden — wir müssen die Abhängigkeiten mocken
SCRIPTS_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent

sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(REPO_ROOT / "python_admin"))


# ═══════════════════════════════════════════════════════════════════
#  Fixtures
# ═══════════════════════════════════════════════════════════════════

@pytest.fixture(autouse=True)
def _clean_active_runs():
    """Reset _active_suite_runs vor und nach jedem Test."""
    import python_admin_app_loader as _  # noqa: F401 – force load
    from app import _active_suite_runs, _active_suite_lock
    with _active_suite_lock:
        _active_suite_runs.clear()
    yield
    with _active_suite_lock:
        _active_suite_runs.clear()


@pytest.fixture()
def suite_log_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Weist SUITE_RUN_LOG_FILE auf ein Temp-Verzeichnis."""
    import app
    log_file = tmp_path / "suite_runs.jsonl"
    monkeypatch.setattr(app, "SUITE_RUN_LOG_FILE", log_file)
    monkeypatch.setattr(app, "LOG_DIR", tmp_path)
    return log_file


# ═══════════════════════════════════════════════════════════════════
#  get_suite_catalog
# ═══════════════════════════════════════════════════════════════════

class TestGetSuiteCatalog:
    def test_returns_dict_with_suites(self):
        from app import get_suite_catalog
        result = get_suite_catalog()
        assert "suites" in result
        assert "summary" in result
        assert isinstance(result["suites"], list)
        assert result["summary"]["total"] == len(result["suites"])

    def test_each_suite_has_required_keys(self):
        from app import get_suite_catalog
        result = get_suite_catalog()
        for s in result["suites"]:
            assert "suiteId" in s
            assert "title" in s
            assert "group" in s
            assert "prereqsMet" in s
            assert isinstance(s["prereqsMet"], bool)

    def test_groups_structure(self):
        from app import get_suite_catalog
        result = get_suite_catalog()
        assert "groups" in result
        assert isinstance(result["groups"], dict)
        # Jede Gruppe muss mindestens 1 Suite enthalten
        for group, items in result["groups"].items():
            assert len(items) >= 1

    def test_summary_counts(self):
        from app import get_suite_catalog
        result = get_suite_catalog()
        summary = result["summary"]
        assert summary["ready"] + summary["notReady"] == summary["total"]


class TestBuildTestingRegister:
    def test_register_exposes_extended_summary_and_metadata(self):
        from app import build_testing_register

        result = build_testing_register()

        assert "summary" in result
        for key in ("critical", "blocking", "stale", "withoutSuccess", "unsupported"):
            assert key in result["summary"]

        items = result["items"]
        assert items
        sample = items[0]
        for key in (
            "owner",
            "severity",
            "blockingForRelease",
            "evidenceRequired",
            "environment",
            "hasSuccessfulRun",
            "staleEvidence",
            "sourceOfTruth",
            "linkedSuite",
            "linkedCommand",
        ):
            assert key in sample

    def test_register_contains_repo_suite_links_or_unsupported_bucket(self):
        from app import build_testing_register

        result = build_testing_register()
        repo_items = [item for item in result["items"] if item.get("entryKind") == "repo-test"]
        assert repo_items

        for item in repo_items:
            if item.get("groupId") == "repo-tests-unsupported":
                assert item.get("groupTitle") == "Repo-Tests: Unsupported / Not Yet Mapped"
            else:
                assert item.get("linkedSuite") == item.get("suiteRef", "")

    def test_register_contains_split_platform_qa_checks(self):
        from app import build_testing_register

        result = build_testing_register()
        ids = {item["id"] for item in result["items"]}
        automation_types = {item["id"]: item["automationType"] for item in result["items"]}

        expected_manual = {
            "firebase-auth-enabled",
            "messaging-enabled",
            "android-master-registered",
            "android-child-registered",
            "parent-panel-verified",
            "device-sync-verified",
            "support-flow-verified",
            "compliance-flow-verified",
            "storage-rules-verified",
        }
        expected_automatic = {
            "cloud-project-id",
            "ai-runtime-config",
            "firestore-enabled",
            "storage-enabled",
            "functions-enabled",
            "firebase-project-bound",
            "service-account-ready",
            "play-store-required-checks-complete",
            "play-store-privacy-url-valid",
            "play-store-support-email-valid",
        }

        assert expected_manual.issubset(ids)
        assert expected_automatic.issubset(ids)
        for test_id in expected_manual:
            assert automation_types[test_id] == "manual"
        for test_id in expected_automatic:
            assert automation_types[test_id] == "automatic"

    def test_register_contains_remaining_platform_readiness_groups(self):
        from app import get_commissioning_test_catalog, build_testing_register

        catalog = get_commissioning_test_catalog()
        group_ids = {group["id"] for group in catalog["groups"]}
        assert {
            "functional-readiness-masterapp",
            "functional-readiness-childapp",
            "functional-readiness-desktop",
        }.issubset(group_ids)

        result = build_testing_register()
        items_by_id = {item["id"]: item for item in result["items"]}

        expected_manual = {
            "ma-registration-flow",
            "ma-pairing-works",
            "ma-lock-unlock",
            "ma-task-create",
            "ma-task-review",
            "ma-task-reject-ui",
            "ma-usage-rules-nav",
            "ma-date-picker",
            "ma-subscription-check",
            "ma-subscription-enforce",
            "ma-fcm-working",
            "ma-firebase-appcheck",
            "ma-offline-handling",
            "ma-qr-pairing",
            "ca-pairing-flow",
            "ca-fcm-sync",
            "ca-accessibility-active",
            "ca-app-blocking-effective",
            "ca-overlay-secure",
            "ca-settings-protection",
            "ca-device-admin-enforced",
            "ca-usage-limits",
            "ca-time-windows",
            "ca-tamper-detection",
            "ca-task-proof",
            "ca-factory-reset-protection",
            "ca-root-detection",
            "ca-permission-onboarding",
            "dt-code-signing",
            "dt-auto-update",
            "dt-system-tray",
            "dt-desktop-notifications",
            "dt-window-persistence",
            "dt-ipc-messaging",
            "dt-parent-panel-login",
            "dt-admin-panel-login",
            "dt-crash-reporting",
        }

        assert expected_manual.issubset(items_by_id.keys())
        for test_id in expected_manual:
            assert items_by_id[test_id]["automationType"] == "manual"
            assert items_by_id[test_id]["source"] == "platform-readiness"

    def test_local_workspace_checks_can_be_evaluated_automatically(self, monkeypatch: pytest.MonkeyPatch):
        import app

        monkeypatch.setattr(app, "load_local_firebase_binding_status", lambda project_id: (True, f"bound:{project_id or 'default'}"))
        monkeypatch.setattr(app, "load_local_service_account_status", lambda: (True, "service-account-ready"))

        result = app.evaluate_commissioning_context(
            {
                "runtimeConfig": {
                    "cloud": {
                        "projectId": "minimaster-28fbd",
                        "appCheckMode": "enforced",
                    },
                    "ai": {
                        "provider": "gemini",
                        "model": "gemini-3.0-flash",
                        "keyRef": "projects/demo/secrets/key",
                        "systemPrompt": "Assist.",
                    },
                },
                "validationSummary": {
                    "errorCount": 0,
                    "checks": {
                        "firestoreAccessOk": True,
                        "storageHealthOk": True,
                        "functionsReachable": True,
                    },
                },
                "attestations": {},
                "playStoreState": {"checks": {}},
            }
        )

        checks = {item["id"]: item for item in result["checks"]}
        assert checks["firestore-enabled"]["status"] == "pass"
        assert checks["storage-enabled"]["status"] == "pass"
        assert checks["functions-enabled"]["status"] == "pass"
        assert checks["firebase-project-bound"]["status"] == "pass"
        assert checks["service-account-ready"]["status"] == "pass"


class TestRunCommand:
    def test_uses_utf8_replace_for_subprocess_output(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        import app

        captured_kwargs: dict[str, object] = {}

        class Completed:
            stdout = "ok"
            stderr = ""
            returncode = 0

        def fake_run(*args, **kwargs):
            captured_kwargs.update(kwargs)
            return Completed()

        monkeypatch.setattr(app.subprocess, "run", fake_run)

        result = app.run_command(app.CommandRequest(command="npm --version", cwd=tmp_path))

        assert result["code"] == 0
        assert result["output"].endswith("ok")
        assert captured_kwargs["text"] is True
        assert captured_kwargs["encoding"] == "utf-8"
        assert captured_kwargs["errors"] == "replace"


# ═══════════════════════════════════════════════════════════════════
#  get_device_status
# ═══════════════════════════════════════════════════════════════════

class TestGetDeviceStatus:
    @patch("app.adb_available", return_value=False)
    def test_adb_not_available(self, mock_adb):
        from app import get_device_status
        result = get_device_status()
        assert result["adbAvailable"] is False
        assert result["devices"] == []

    @patch("app.AdbClient")
    @patch("app.adb_available", return_value=True)
    def test_with_devices(self, mock_adb_avail, mock_client_cls):
        from adb_client import AdbDevice
        mock_client_cls.list_devices.return_value = [
            AdbDevice(serial="DEV1", state="device"),
            AdbDevice(serial="DEV2", state="offline"),
        ]
        mock_instance = MagicMock()
        mock_instance.get_device_model.return_value = "Pixel 7"
        mock_instance.get_android_version.return_value = "14"
        mock_client_cls.return_value = mock_instance

        from app import get_device_status
        result = get_device_status()
        assert result["adbAvailable"] is True
        assert result["count"] == 2
        assert result["readyCount"] == 1
        assert result["devices"][0]["serial"] == "DEV1"
        assert result["devices"][0]["ready"] is True

    @patch("app.AdbClient.list_devices", return_value=[])
    @patch("app.adb_available", return_value=True)
    def test_no_devices(self, mock_adb_avail, mock_list):
        from app import get_device_status
        result = get_device_status()
        assert result["adbAvailable"] is True
        assert result["count"] == 0


# ═══════════════════════════════════════════════════════════════════
#  start_suite_run / get_suite_run_status
# ═══════════════════════════════════════════════════════════════════

class TestStartSuiteRun:
    @patch("app.ta_run_suite")
    def test_starts_and_returns_run_id(self, mock_run):
        from app import start_suite_run
        from test_automation import SuiteResult
        mock_run.return_value = SuiteResult(
            suite_id="backend-lint", title="Lint", group="backend",
            status="passed", duration_sec=0.1, returncode=0, command=["echo"],
        )
        result = start_suite_run("backend-lint")
        assert "runId" in result
        assert result["status"] == "queued"
        assert result["runId"].startswith("suite-")

    def test_run_status_returns_none_for_unknown(self):
        from app import get_suite_run_status
        assert get_suite_run_status("nonexistent-id") is None

    @patch("app.ta_run_suite")
    def test_run_status_after_start(self, mock_run):
        from app import start_suite_run, get_suite_run_status
        from test_automation import SuiteResult
        mock_run.return_value = SuiteResult(
            suite_id="backend-lint", title="Lint", group="backend",
            status="passed", duration_sec=0.1, returncode=0, command=["echo"],
        )
        result = start_suite_run("backend-lint")
        run_id = result["runId"]
        # Warte kurz auf Thread-Start
        time.sleep(0.1)
        status = get_suite_run_status(run_id)
        assert status is not None
        assert status["runId"] == run_id


# ═══════════════════════════════════════════════════════════════════
#  load_suite_run_history
# ═══════════════════════════════════════════════════════════════════

class TestLoadSuiteRunHistory:
    def test_empty_when_no_file(self, suite_log_file):
        from app import load_suite_run_history
        result = load_suite_run_history()
        assert result == []

    def test_reads_entries(self, suite_log_file):
        entries = [
            {"runId": "r1", "suiteId": "s1", "timestamp": "2026-01-01T00:00:00Z"},
            {"runId": "r2", "suiteId": "s2", "timestamp": "2026-01-02T00:00:00Z"},
        ]
        suite_log_file.write_text(
            "\n".join(json.dumps(e) for e in entries),
            encoding="utf-8",
        )
        from app import load_suite_run_history
        result = load_suite_run_history(limit=10)
        assert len(result) == 2
        # Neueste zuerst (reversed)
        assert result[0]["runId"] == "r2"

    def test_respects_limit(self, suite_log_file):
        entries = [{"runId": f"r{i}", "suiteId": "s"} for i in range(10)]
        suite_log_file.write_text(
            "\n".join(json.dumps(e) for e in entries),
            encoding="utf-8",
        )
        from app import load_suite_run_history
        result = load_suite_run_history(limit=3)
        assert len(result) == 3

    def test_handles_invalid_json_lines(self, suite_log_file):
        suite_log_file.write_text(
            '{"runId": "r1"}\nnot json\n{"runId": "r2"}\n',
            encoding="utf-8",
        )
        from app import load_suite_run_history
        result = load_suite_run_history()
        assert len(result) == 2


# ═══════════════════════════════════════════════════════════════════
#  _run_suite_background
# ═══════════════════════════════════════════════════════════════════

class TestRunSuiteBackground:
    @patch("app.ta_run_suite")
    def test_suite_not_found(self, mock_run, suite_log_file):
        from app import _run_suite_background, _active_suite_runs, _active_suite_lock
        run_id = "test-run-1"
        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_suite_background(run_id, "nonexistent-suite", False)

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "error"
            assert "nicht gefunden" in _active_suite_runs[run_id]["error"]

    @patch("app.ta_run_suite")
    def test_suite_runs_and_finishes(self, mock_run, suite_log_file):
        from app import _run_suite_background, _active_suite_runs, _active_suite_lock, TA_SUITES
        from test_automation import SuiteResult

        if not TA_SUITES:
            pytest.skip("Keine Suiten definiert")

        suite_id = TA_SUITES[0].suite_id
        run_id = "test-run-2"
        mock_run.return_value = SuiteResult(
            suite_id=suite_id,
            title="Test",
            group="backend",
            status="passed",
            duration_sec=1.0,
            returncode=0,
            command=["echo", "test"],
        )

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_suite_background(run_id, suite_id, False)

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "finished"
            assert _active_suite_runs[run_id]["result"] is not None

        # Log-Datei wurde geschrieben
        assert suite_log_file.exists()
        content = suite_log_file.read_text(encoding="utf-8")
        assert run_id in content


# ═══════════════════════════════════════════════════════════════════
#  _run_usb_test_background
# ═══════════════════════════════════════════════════════════════════

class TestRunUsbTestBackground:
    @patch("app.run_usb_test")
    def test_success(self, mock_run_usb, suite_log_file):
        from app import _run_usb_test_background, _active_suite_runs, _active_suite_lock
        from usb_test_runner import UsbTestRunResult

        run_id = "usb-test-1"
        mock_result = UsbTestRunResult(app_id="master", serial="X", suite="commissioning")
        mock_result.overall_status = "passed"
        mock_run_usb.return_value = mock_result

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_usb_test_background(run_id, {"app_id": "master", "serial": "X", "suite": "commissioning"})

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "finished"

    @patch("app.run_usb_test", side_effect=RuntimeError("ADB crash"))
    def test_error_handling(self, mock_run_usb, suite_log_file):
        from app import _run_usb_test_background, _active_suite_runs, _active_suite_lock

        run_id = "usb-test-err"
        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_usb_test_background(run_id, {"app_id": "master"})

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "error"
            assert "ADB crash" in _active_suite_runs[run_id]["error"]


# ═══════════════════════════════════════════════════════════════════
#  _run_dual_device_background
# ═══════════════════════════════════════════════════════════════════

class TestRunDualDeviceBackground:
    @patch("app.run_dual_device")
    def test_success(self, mock_run_dual, suite_log_file):
        from app import _run_dual_device_background, _active_suite_runs, _active_suite_lock
        from dual_device_runner import DualDeviceResult

        run_id = "dual-test-1"
        mock_result = DualDeviceResult(master_serial="M1", child_serial="C1")
        mock_result.overall_status = "passed"
        mock_run_dual.return_value = mock_result

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_dual_device_background(run_id, {"master_serial": "M1", "child_serial": "C1"})

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "finished"

    @patch("app.run_dual_device", side_effect=RuntimeError("Device disconnect"))
    def test_error_handling(self, mock_run_dual, suite_log_file):
        from app import _run_dual_device_background, _active_suite_runs, _active_suite_lock

        run_id = "dual-err"
        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_dual_device_background(run_id, {"master_serial": "M", "child_serial": "C"})

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "error"
            assert "Device disconnect" in _active_suite_runs[run_id]["error"]


# ═══════════════════════════════════════════════════════════════════
#  Hilfsfunktionen
# ═══════════════════════════════════════════════════════════════════

class TestHelperFunctions:
    def test_parse_int_valid(self):
        from app import parse_int
        assert parse_int("42", default=0, min_value=0, max_value=100) == 42

    def test_parse_int_clamps(self):
        from app import parse_int
        assert parse_int("200", default=0, min_value=0, max_value=100) == 100
        assert parse_int("-5", default=0, min_value=0, max_value=100) == 0

    def test_parse_int_default(self):
        from app import parse_int
        assert parse_int("abc", default=25, min_value=1, max_value=100) == 25
        assert parse_int(None, default=25, min_value=1, max_value=100) == 25

    def test_bool_from_payload(self):
        from app import bool_from_payload
        assert bool_from_payload(True) is True
        assert bool_from_payload(False) is False
        assert bool_from_payload("true") is True
        assert bool_from_payload("false") is False
        assert bool_from_payload("1") is True
        assert bool_from_payload("0") is False
        assert bool_from_payload(1) is True
        assert bool_from_payload(0) is False
        assert bool_from_payload(None, default=True) is True
        assert bool_from_payload(None, default=False) is False

    def test_as_dict(self):
        from app import as_dict
        assert as_dict({"a": 1}) == {"a": 1}
        assert as_dict("not a dict") == {}
        assert as_dict(None) == {}
        assert as_dict(42) == {}
