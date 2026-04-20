"""Tests für python_admin/app.py — Suite-API-Endpunkte und Hilfsfunktionen."""
from __future__ import annotations

import json
import sys
import time
from http import HTTPStatus
from pathlib import Path
from unittest.mock import MagicMock, patch

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
def _clean_active_runs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Reset _active_suite_runs vor und nach jedem Test."""
    import python_admin_app_loader as _  # noqa: F401 – force load
    import app
    from app import _active_suite_runs, _active_suite_lock, _active_jobs, _job_lock, _job_queue
    monkeypatch.setattr(app, "JOB_RUN_LOG_FILE", tmp_path / "job_runs.jsonl")
    monkeypatch.setattr(app, "ANDROID_AUTOMATION_SWEEP_APPROVAL_LOG_FILE", tmp_path / "android_automation_sweep_approvals.jsonl")
    monkeypatch.setattr(app, "ANDROID_COMPATIBILITY_APPROVAL_LOG_FILE", tmp_path / "android_compatibility_approvals.jsonl")
    with _active_suite_lock:
        _active_suite_runs.clear()
    with _job_lock:
        _active_jobs.clear()
        _job_queue.clear()
    app._job_worker_thread = None
    yield
    with _active_suite_lock:
        _active_suite_runs.clear()
    with _job_lock:
        _active_jobs.clear()
        _job_queue.clear()
    app._job_worker_thread = None


@pytest.fixture()
def suite_log_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Weist SUITE_RUN_LOG_FILE auf ein Temp-Verzeichnis."""
    import app
    log_file = tmp_path / "suite_runs.jsonl"
    self_healing_log_file = tmp_path / "self_healing_cycles.jsonl"
    job_log_file = tmp_path / "job_runs.jsonl"
    monkeypatch.setattr(app, "SUITE_RUN_LOG_FILE", log_file)
    monkeypatch.setattr(app, "SELF_HEALING_LOG_FILE", self_healing_log_file)
    monkeypatch.setattr(app, "JOB_RUN_LOG_FILE", job_log_file)
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
            assert "scope" in s
            assert "scopeNote" in s
            assert "prereqsMet" in s
            assert isinstance(s["prereqsMet"], bool)

    def test_android_unit_child_is_marked_as_host_suite(self):
        from app import get_suite_catalog

        result = get_suite_catalog()
        suites = {item["suiteId"]: item for item in result["suites"]}

        suite = suites["android-unit-child"]
        assert suite["scope"] == "host"
        assert "bewertet keine installierten Apps" in suite["scopeNote"]

    def test_android_unit_child_is_blocked_when_master_app_is_installed_on_connected_device(self, monkeypatch: pytest.MonkeyPatch):
        import app

        def fake_check(required_prereqs):
            if "child_device_without_master_app" in required_prereqs:
                return False, "Auf dem verbundenen Gerät TEST123 ist die Eltern-App installiert."
            return True, None

        monkeypatch.setattr(app, "ta_check_prereqs", fake_check)

        result = app.get_suite_catalog()
        suites = {item["suiteId"]: item for item in result["suites"]}

        suite = suites["android-unit-child"]
        assert suite["prereqsMet"] is False
        assert "Eltern-App installiert" in suite["prereqReason"]

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


class TestGetQaCatalog:
    def test_returns_canonical_qa_sections(self):
        from app import get_qa_catalog

        result = get_qa_catalog()

        assert "androidMatrix" in result
        assert "deviceProfiles" in result
        assert "dualDeviceScenarios" in result
        assert "suiteEntries" in result
        assert "inventoryEntries" in result
        assert "executionSummary" in result
        assert "registerSummary" in result
        assert "criticalBacklog" in result

    def test_critical_backlog_contains_only_p0_or_p1(self):
        from app import get_qa_catalog

        result = get_qa_catalog()

        assert result["criticalBacklog"]
        assert all(item["priority"] in {"P0", "P1"} for item in result["criticalBacklog"])


class TestQaReleaseWorkspace:
    def test_builds_release_workspace_with_five_agents_and_sorted_blockers(self, monkeypatch: pytest.MonkeyPatch):
        import app

        monkeypatch.setattr(app, "build_testing_register", lambda: {
            "items": [
                {
                    "id": "manual-proof",
                    "title": "Manual Proof",
                    "status": "manual_required",
                    "blockingForRelease": True,
                    "staleEvidence": True,
                    "action": "protocol",
                    "severity": "medium",
                },
                {
                    "id": "failed-suite",
                    "title": "Failed Suite",
                    "status": "fail",
                    "blockingForRelease": True,
                    "suiteRef": "android-unit-master",
                    "action": "suite-run",
                    "severity": "high",
                },
            ],
            "summary": {"blocking": 2},
        })
        monkeypatch.setattr(app, "get_qa_catalog", lambda: {"criticalBacklog": [{"id": "p0"}]})
        monkeypatch.setattr(app, "get_emulator_lab_overview", lambda: {"summary": {"runningCount": 1, "reservationCount": 2, "busyReservationCount": 1, "problemCount": 0}})
        monkeypatch.setattr(app, "run_self_healing_cycle", lambda **_kwargs: {"systemHealth": "DEGRADED", "pendingFixes": [{"id": "issue-1", "severity": "HIGH"}], "fixesApplied": [], "agentActivities": []})
        monkeypatch.setattr(app, "load_suite_run_history", lambda _limit=20: [
            {"runId": "run-1", "suiteId": "android-unit-master", "status": "finished", "result": {"status": "failed", "reason": "boom"}},
        ])

        with app._active_suite_lock:
            app._active_suite_runs.clear()
            app._active_suite_runs["run-queued"] = {"runId": "run-queued", "suiteId": "android-unit-child", "status": "queued"}

        payload = app.build_qa_release_workspace()

        assert payload["summary"]["blockingCount"] == 2
        assert payload["blockers"][0]["id"] == "failed-suite"
        assert payload["queue"][0]["runId"] == "run-queued"
        assert len(payload["agentWorkspace"]["agents"]) == 5
        assert payload["agentWorkspace"]["agents"][-1]["role"] == "synthesizer"


class TestAndroidAutomationSweepPlan:
    def test_collects_all_active_tests_and_dual_scenarios(self, monkeypatch: pytest.MonkeyPatch):
        import app

        monkeypatch.setattr(app, "load_android_version_matrix", lambda: [
            {"androidVersion": "10", "status": "active"},
            {"androidVersion": "14", "status": "active"},
            {"androidVersion": "16", "status": "preview"},
            {"androidVersion": "9", "status": "retired"},
        ])
        monkeypatch.setattr(app, "load_android_scenario_mappings", lambda: [
            {"scenarioId": "pairing", "role": "master", "testClass": "master.PairingTest"},
            {"scenarioId": "pairing", "role": "child", "testClass": "child.PairingTest"},
            {"scenarioId": "rules", "role": "master", "testClass": "master.RulesTest"},
            {"scenarioId": "rules", "role": "child", "testClass": "child.RulesTest"},
            {"scenarioId": "incomplete", "role": "master", "testClass": "master.IncompleteTest"},
        ])
        monkeypatch.setattr(app, "load_dual_device_scenarios", lambda: [
            {"scenarioId": "pairing"},
            {"scenarioId": "rules"},
            {"scenarioId": "incomplete"},
        ])

        plan = app._build_android_automation_sweep_plan()

        assert plan["androidVersions"] == ["10", "14", "16"]
        assert plan["masterTestClasses"] == ["master.PairingTest", "master.RulesTest", "master.IncompleteTest"]
        assert plan["childTestClasses"] == ["child.PairingTest", "child.RulesTest"]
        assert plan["selectedScenarioIds"] == ["pairing", "rules"]


class TestMiniMasterAdminHandlerRoutes:
    @staticmethod
    def _make_handler(path: str):
        import app

        handler = app.MiniMasterAdminHandler.__new__(app.MiniMasterAdminHandler)
        handler.path = path
        handler.headers = {}
        handler._write_json = MagicMock()
        handler._read_json_body = MagicMock(return_value={})
        handler.send_response = MagicMock()
        handler.send_header = MagicMock()
        handler.end_headers = MagicMock()
        return handler

    def test_do_get_qa_catalog_returns_backend_payload(self, monkeypatch: pytest.MonkeyPatch):
        import app

        payload = {"androidMatrix": [{"apiLevel": 34}], "criticalBacklog": []}
        handler = self._make_handler("/api/qa/catalog")
        monkeypatch.setattr(app, "get_qa_catalog", lambda: payload)

        app.MiniMasterAdminHandler.do_GET(handler)

        handler._write_json.assert_called_once_with(HTTPStatus.OK, payload)

    def test_do_get_commissioning_evidence_clamps_limit_and_forwards_test_id(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/commissioning/evidence?limit=9999&testId=ios-xctest-parent")
        history_mock = MagicMock(return_value=[{"testId": "ios-xctest-parent", "status": "pass"}])
        latest_mock = MagicMock(return_value={"ios-xctest-parent": {"status": "pass"}})
        monkeypatch.setattr(app, "load_commissioning_evidence_history", history_mock)
        monkeypatch.setattr(app, "load_latest_commissioning_evidence", latest_mock)

        app.MiniMasterAdminHandler.do_GET(handler)

        history_mock.assert_called_once_with(app.MAX_EVIDENCE_LIMIT, test_id="ios-xctest-parent")
        latest_mock.assert_called_once_with()
        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {
                "entries": [{"testId": "ios-xctest-parent", "status": "pass"}],
                "latestByTestId": {"ios-xctest-parent": {"status": "pass"}},
                "count": app.MAX_EVIDENCE_LIMIT,
            },
        )

    def test_do_get_suite_history_clamps_limit_to_http_contract(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/history?limit=500")
        history_mock = MagicMock(return_value=[{"runId": "run-1", "status": "finished"}])
        monkeypatch.setattr(app, "load_suite_run_history", history_mock)

        app.MiniMasterAdminHandler.do_GET(handler)

        history_mock.assert_called_once_with(200)
        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {
                "runs": [{"runId": "run-1", "status": "finished"}],
                "count": 200,
            },
        )

    def test_do_get_android_automation_sweep_preflight_returns_backend_payload(self, monkeypatch: pytest.MonkeyPatch):
        import app

        payload = {
            "status": "warning",
            "canStart": True,
            "warningCount": 1,
            "warnings": [{"id": "register-blockers-open"}],
            "blockingCount": 0,
            "blockingReasons": [],
        }
        handler = self._make_handler("/api/suites/android-automation-sweep/preflight")
        monkeypatch.setattr(app, "_build_android_automation_sweep_preflight", lambda: payload)

        app.MiniMasterAdminHandler.do_GET(handler)

        handler._write_json.assert_called_once_with(HTTPStatus.OK, payload)

    def test_do_post_android_automation_sweep_approve_persists_active_approval(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-automation-sweep/approve")
        handler._read_json_body.return_value = {"approvedBy": "qa-admin-panel"}

        preflight_states = [
            {
                "status": "warning",
                "canStart": False,
                "approvalRequired": True,
                "hasActiveApproval": False,
                "activeApproval": None,
                "planHash": "plan-hash-1",
                "warningCount": 1,
                "warnings": [{"id": "register-blockers-open"}],
                "blockingCount": 0,
                "blockingReasons": [],
            },
            {
                "status": "approved",
                "canStart": True,
                "approvalRequired": True,
                "hasActiveApproval": True,
                "activeApproval": {
                    "approvalId": "sweep-approval-123",
                    "approvedAt": "2026-04-20T10:00:00Z",
                    "approvedBy": "qa-admin-panel",
                    "expiresAt": "2026-04-20T18:00:00Z",
                    "warningIds": ["register-blockers-open"],
                    "planHash": "plan-hash-1",
                },
                "planHash": "plan-hash-1",
                "warningCount": 1,
                "warnings": [{"id": "register-blockers-open"}],
                "blockingCount": 0,
                "blockingReasons": [],
            },
        ]
        append_mock = MagicMock()

        monkeypatch.setattr(app, "uuid4", lambda: type("_FakeUuid", (), {"hex": "1234567890abcdef"})())
        monkeypatch.setattr(app, "_build_android_automation_sweep_preflight", lambda: preflight_states.pop(0))
        monkeypatch.setattr(app, "_append_android_automation_sweep_approval", append_mock)

        app.MiniMasterAdminHandler.do_POST(handler)

        append_mock.assert_called_once()
        approval_entry = append_mock.call_args.args[0]
        assert approval_entry["approvalId"] == "sweep-approval-1234567890ab"
        assert approval_entry["planHash"] == "plan-hash-1"
        assert approval_entry["approvedBy"] == "qa-admin-panel"
        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {
                "status": "approved",
                "canStart": True,
                "approvalRequired": True,
                "hasActiveApproval": True,
                "activeApproval": {
                    "approvalId": "sweep-approval-123",
                    "approvedAt": "2026-04-20T10:00:00Z",
                    "approvedBy": "qa-admin-panel",
                    "expiresAt": "2026-04-20T18:00:00Z",
                    "warningIds": ["register-blockers-open"],
                    "planHash": "plan-hash-1",
                },
                "planHash": "plan-hash-1",
                "warningCount": 1,
                "warnings": [{"id": "register-blockers-open"}],
                "blockingCount": 0,
                "blockingReasons": [],
            },
        )

    def test_do_get_self_healing_status_forwards_parameters(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/qa/self-healing/status?autoFix=true&staleAfterSec=120")
        cycle_mock = MagicMock(return_value={"systemHealth": "OK", "detectedIssues": []})
        monkeypatch.setattr(app, "run_self_healing_cycle", cycle_mock)

        app.MiniMasterAdminHandler.do_GET(handler)

        cycle_mock.assert_called_once_with(auto_fix=False, stale_after_sec=120, triggered_by="http-get")
        handler._write_json.assert_called_once_with(HTTPStatus.OK, {"systemHealth": "OK", "detectedIssues": []})

    def test_write_json_ignores_client_disconnect_during_body_write(self):
        import app

        handler = self._make_handler("/api/testing/register")
        handler.wfile = MagicMock()
        handler.wfile.write.side_effect = ConnectionAbortedError(10053, "client disconnected")
        handler.close_connection = False

        app.MiniMasterAdminHandler._write_json(handler, HTTPStatus.OK, {"ok": True})

        handler.send_response.assert_called_once_with(HTTPStatus.OK)
        handler.send_header.assert_any_call("Content-Type", "application/json; charset=utf-8")
        handler.end_headers.assert_called_once_with()
        handler.wfile.write.assert_called_once()
        assert handler.close_connection is True

    def test_write_json_reraises_non_disconnect_write_errors(self):
        import app

        handler = self._make_handler("/api/testing/register")
        handler.wfile = MagicMock()
        handler.wfile.write.side_effect = OSError("non-disconnect write failure")
        handler.close_connection = False

        with pytest.raises(OSError, match="non-disconnect write failure"):
            app.MiniMasterAdminHandler._write_json(handler, HTTPStatus.OK, {"ok": True})

        handler.send_response.assert_called_once_with(HTTPStatus.OK)
        handler.end_headers.assert_called_once_with()
        assert handler.close_connection is False

    def test_do_post_dual_device_queues_run_with_scenario_profile_and_fault_modes(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/dual-device")
        handler._read_json_body.return_value = {
            "masterSerial": "MASTER-1",
            "childSerial": "CHILD-1",
            "scenarioId": "offline-online-resync",
            "profileId": "dual-device-balanced",
            "faultModes": ["disconnect", "airplane"],
            "parallel": True,
        }

        create_job_mock = MagicMock(return_value={"jobId": "dual-abcdef123456"})
        enqueue_job_mock = MagicMock()

        class _FakeUuid:
            hex = "abcdef1234567890"

        monkeypatch.setattr(app, "uuid4", lambda: _FakeUuid())
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {"runId": "dual-abcdef123456", "status": "queued"},
        )
        create_job_mock.assert_called_once_with(
            explicit_job_id="dual-abcdef123456",
            job_type="test",
            payload={
                "action": "dual-device",
                "kwargs": {
                    "master_serial": "MASTER-1",
                    "child_serial": "CHILD-1",
                    "install_apk": False,
                    "master_apk_path": "",
                    "child_apk_path": "",
                    "uninstall_first": False,
                    "timeout_sec": 7200,
                    "parallel": True,
                    "scenario_id": "offline-online-resync",
                    "profile_id": "dual-device-balanced",
                    "fault_modes": ["disconnect", "airplane"],
                },
            },
            label="offline-online-resync",
            priority=20,
            max_retries=1,
        )
        enqueue_job_mock.assert_called_once_with("dual-abcdef123456")
        with app._active_suite_lock:
            queued = app._active_suite_runs["dual-abcdef123456"]
        assert queued["type"] == "dual-device"
        assert queued["scenarioId"] == "offline-online-resync"
        assert queued["profileId"] == "dual-device-balanced"

    def test_do_post_dual_device_rejects_identical_serials_without_side_effects(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/dual-device")
        handler._read_json_body.return_value = {
            "masterSerial": "SAME-DEVICE-1",
            "childSerial": "SAME-DEVICE-1",
            "scenarioId": "offline-online-resync",
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.BAD_REQUEST,
            {"error": "Master- und Child-ADB-Serial müssen unterschiedlich sein."},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()
        with app._active_suite_lock:
            assert app._active_suite_runs == {}

    def test_do_post_dual_device_rejects_legacy_direct_start_without_side_effects(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/dual-device")
        handler._read_json_body.return_value = {
            "masterSerial": "MASTER-1",
            "childSerial": "CHILD-1",
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.CONFLICT,
            {"error": "Direkte Android-Dual-Device-Starts wurden entfernt. Bitte den serverseitigen Android-Kompatibilitätslauf verwenden."},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()
        with app._active_suite_lock:
            assert app._active_suite_runs == {}

    def test_do_post_usb_test_rejects_legacy_commissioning_start_without_side_effects(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/usb-test")
        handler._read_json_body.return_value = {
            "appId": "master",
            "serial": "auto",
            "suite": "commissioning",
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.CONFLICT,
            {"error": "Direkte Android-USB-Commissioning-Starts wurden entfernt. Bitte den serverseitigen Android-Kompatibilitätslauf verwenden."},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()
        with app._active_suite_lock:
            assert app._active_suite_runs == {}

    def test_do_post_android_compatibility_queues_run_with_versions(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-compatibility")
        handler._read_json_body.return_value = {
            "executionMode": "single-master",
            "androidVersions": ["10", "14"],
            "serial": "auto",
            "suite": "commissioning",
        }

        fake_thread = MagicMock()
        fake_thread.start = MagicMock()
        thread_cls = MagicMock(return_value=fake_thread)

        class _FakeUuid:
            hex = "fedcba1234567890"

        monkeypatch.setattr(app.threading, "Thread", thread_cls)
        monkeypatch.setattr(app, "uuid4", lambda: _FakeUuid())
        monkeypatch.setattr(app, "_build_android_compatibility_preflight", lambda _payload: {
            "status": "ready",
            "canStart": True,
            "approvalRequired": False,
            "hasActiveApproval": False,
            "activeApproval": None,
            "warningCount": 0,
            "warnings": [],
            "blockingCount": 0,
            "blockingReasons": [],
        })

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {
                "runId": "compat-fedcba123456",
                "status": "queued",
                "executionMode": "single-master",
                "androidVersions": ["10", "14"],
                "approvalId": "",
                "approvedAt": "",
                "approvedBy": "",
                "approvalWarnings": [],
            },
        )
        fake_thread.start.assert_called_once_with()
        with app._active_suite_lock:
            queued = app._active_suite_runs["compat-fedcba123456"]
        assert queued["type"] == "android-compatibility"
        assert queued["androidVersions"] == ["10", "14"]

    def test_do_post_android_compatibility_rejects_warning_state_without_active_approval(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-compatibility")
        handler._read_json_body.return_value = {
            "executionMode": "single-master",
            "androidVersions": ["14"],
            "serial": "auto",
            "suite": "commissioning",
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)
        monkeypatch.setattr(app, "_build_android_compatibility_preflight", lambda _payload: {
            "status": "warning",
            "canStart": False,
            "approvalRequired": True,
            "hasActiveApproval": False,
            "activeApproval": None,
            "warningCount": 1,
            "warnings": [{"id": "register-blockers-open"}],
            "blockingCount": 0,
            "blockingReasons": [],
        })

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.CONFLICT,
            {"error": "Für den Android-Kompatibilitätslauf liegt eine serverseitig erforderliche Warnlagen-Freigabe vor. Bitte zuerst die Kompatibilitäts-Freigabe speichern."},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()

    def test_do_post_self_healing_runs_cycle(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/qa/self-healing/run")
        handler._read_json_body.return_value = {"autoFix": False, "staleAfterSec": 300}
        create_job_mock = MagicMock(return_value={"jobId": "job-self-healing-1"})
        enqueue_job_mock = MagicMock()
        cycle_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)
        monkeypatch.setattr(app, "run_self_healing_cycle", cycle_mock)

        app.MiniMasterAdminHandler.do_POST(handler)

        create_job_mock.assert_called_once_with(
            job_type="system",
            payload={
                "action": "self-healing-cycle",
                "autoFix": False,
                "staleAfterSec": 300,
                "triggeredBy": "http-post",
            },
            label="Self-Healing-Zyklus",
            priority=15,
        )
        enqueue_job_mock.assert_called_once_with("job-self-healing-1")
        cycle_mock.assert_not_called()
        handler._write_json.assert_called_once_with(HTTPStatus.OK, {"jobId": "job-self-healing-1", "status": "queued"})

    def test_execute_job_action_runs_self_healing_cycle_and_completes_job(self, monkeypatch: pytest.MonkeyPatch):
        import app

        cycle_mock = MagicMock(return_value={"systemHealth": "OK", "fixesApplied": [], "pendingFixes": []})
        monkeypatch.setattr(app, "run_self_healing_cycle", cycle_mock)

        job = app.create_job(
            job_type="system",
            payload={
                "action": "self-healing-cycle",
                "autoFix": False,
                "staleAfterSec": 300,
                "triggeredBy": "http-post",
            },
            label="Self-Healing-Zyklus",
        )

        app._execute_job_action(str(job["jobId"]))

        cycle_mock.assert_called_once_with(auto_fix=False, stale_after_sec=300, triggered_by="http-post")
        completed = app.get_job_by_id(str(job["jobId"]))
        assert completed is not None
        assert completed["status"] == "success"
        assert completed["result"]["systemHealth"] == "OK"

    def test_do_post_android_compatibility_keeps_selected_tests_and_scenarios(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-compatibility")
        handler._read_json_body.return_value = {
            "executionMode": "dual-device",
            "androidVersions": ["14"],
            "masterSerial": "auto",
            "childSerial": "auto",
            "selectedScenarioIds": ["offline-online-resync", "pairing-code-expiry"],
            "selectedTestClasses": ["com.minimaster.masterapp.MasterScenarioTest"],
        }

        fake_thread = MagicMock()
        fake_thread.start = MagicMock()
        thread_cls = MagicMock(return_value=fake_thread)

        class _FakeUuid:
            hex = "feedface12345678"

        monkeypatch.setattr(app.threading, "Thread", thread_cls)
        monkeypatch.setattr(app, "uuid4", lambda: _FakeUuid())
        monkeypatch.setattr(app, "_build_android_compatibility_preflight", lambda _payload: {
            "status": "approved",
            "canStart": True,
            "approvalRequired": True,
            "hasActiveApproval": True,
            "activeApproval": {
                "approvalId": "compat-approval-1",
                "approvedAt": "2026-04-20T10:00:00Z",
                "approvedBy": "qa-admin-panel",
                "expiresAt": "2026-04-20T18:00:00Z",
                "warningIds": ["register-blockers-open"],
                "planHash": "compat-plan-hash-1",
            },
            "warningCount": 1,
            "warnings": [{"id": "register-blockers-open"}],
            "blockingCount": 0,
            "blockingReasons": [],
        })

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        with app._active_suite_lock:
            queued = app._active_suite_runs["compat-feedface1234"]
        assert queued["selectedScenarioIds"] == ["offline-online-resync", "pairing-code-expiry"]
        assert queued["selectedTestClasses"] == ["com.minimaster.masterapp.MasterScenarioTest"]
        assert queued["approvalId"] == "compat-approval-1"
        assert queued["approvedBy"] == "qa-admin-panel"
        assert queued["approvalWarnings"] == ["register-blockers-open"]

    def test_do_post_android_compatibility_approve_persists_active_approval(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-compatibility/approve")
        handler._read_json_body.return_value = {
            "executionMode": "single-master",
            "androidVersions": ["14"],
            "serial": "auto",
            "suite": "commissioning",
            "approvedBy": "qa-admin-panel",
        }

        preflight_sequence = iter([
            {
                "status": "warning",
                "canStart": False,
                "approvalRequired": True,
                "hasActiveApproval": False,
                "activeApproval": None,
                "planHash": "compat-plan-hash-1",
                "warningCount": 1,
                "warnings": [{"id": "register-blockers-open"}],
                "blockingCount": 0,
                "blockingReasons": [],
            },
            {
                "status": "approved",
                "canStart": True,
                "approvalRequired": True,
                "hasActiveApproval": True,
                "activeApproval": {
                    "approvalId": "compat-approval-123",
                    "approvedAt": "2026-04-20T10:00:00Z",
                    "approvedBy": "qa-admin-panel",
                    "expiresAt": "2026-04-20T18:00:00Z",
                    "warningIds": ["register-blockers-open"],
                    "planHash": "compat-plan-hash-1",
                },
                "planHash": "compat-plan-hash-1",
                "warningCount": 1,
                "warnings": [{"id": "register-blockers-open"}],
                "blockingCount": 0,
                "blockingReasons": [],
            },
        ])
        monkeypatch.setattr(app, "_build_android_compatibility_preflight", lambda _payload: next(preflight_sequence))
        append_mock = MagicMock()
        monkeypatch.setattr(app, "_append_android_compatibility_approval", append_mock)

        class _FakeUuid:
            hex = "1234567890abcdef"

        monkeypatch.setattr(app, "uuid4", lambda: _FakeUuid())

        app.MiniMasterAdminHandler.do_POST(handler)

        append_mock.assert_called_once()
        approval_entry = append_mock.call_args.args[0]
        assert approval_entry["approvalId"] == "compat-approval-1234567890ab"
        assert approval_entry["planHash"] == "compat-plan-hash-1"
        assert approval_entry["approvedBy"] == "qa-admin-panel"
        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {
                "status": "approved",
                "canStart": True,
                "approvalRequired": True,
                "hasActiveApproval": True,
                "activeApproval": {
                    "approvalId": "compat-approval-123",
                    "approvedAt": "2026-04-20T10:00:00Z",
                    "approvedBy": "qa-admin-panel",
                    "expiresAt": "2026-04-20T18:00:00Z",
                    "warningIds": ["register-blockers-open"],
                    "planHash": "compat-plan-hash-1",
                },
                "planHash": "compat-plan-hash-1",
                "warningCount": 1,
                "warnings": [{"id": "register-blockers-open"}],
                "blockingCount": 0,
                "blockingReasons": [],
            },
        )

    def test_do_post_android_compatibility_rejects_stale_plan_hash(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-compatibility")
        handler._read_json_body.return_value = {
            "executionMode": "single-master",
            "androidVersions": ["14"],
            "serial": "auto",
            "suite": "commissioning",
            "expectedPlanHash": "compat-plan-hash-old",
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)
        monkeypatch.setattr(app, "_build_android_compatibility_preflight", lambda _payload: {
            "status": "approved",
            "canStart": True,
            "approvalRequired": True,
            "hasActiveApproval": True,
            "activeApproval": {
                "approvalId": "compat-approval-1",
                "approvedAt": "2026-04-20T10:00:00Z",
                "approvedBy": "qa-admin-panel",
                "expiresAt": "2026-04-20T18:00:00Z",
                "warningIds": ["register-blockers-open"],
                "planHash": "compat-plan-hash-new",
            },
            "planHash": "compat-plan-hash-new",
            "warningCount": 1,
            "warnings": [{"id": "register-blockers-open"}],
            "blockingCount": 0,
            "blockingReasons": [],
        })

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.CONFLICT,
            {
                "error": "Der serverseitige Android-Kompatibilitäts-Preflight hat sich seit der letzten Ansicht geändert. Bitte Preflight neu laden und Warnlagen erneut prüfen.",
                "requiresRefresh": True,
                "currentPlanHash": "compat-plan-hash-new",
                "preflight": {
                    "status": "approved",
                    "canStart": True,
                    "approvalRequired": True,
                    "hasActiveApproval": True,
                    "activeApproval": {
                        "approvalId": "compat-approval-1",
                        "approvedAt": "2026-04-20T10:00:00Z",
                        "approvedBy": "qa-admin-panel",
                        "expiresAt": "2026-04-20T18:00:00Z",
                        "warningIds": ["register-blockers-open"],
                        "planHash": "compat-plan-hash-new",
                    },
                    "planHash": "compat-plan-hash-new",
                    "warningCount": 1,
                    "warnings": [{"id": "register-blockers-open"}],
                    "blockingCount": 0,
                    "blockingReasons": [],
                },
            },
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()

    def test_do_post_android_compatibility_rejects_missing_dual_serials(self):
        import app

        handler = self._make_handler("/api/suites/android-compatibility")
        handler._read_json_body.return_value = {
            "executionMode": "dual-device",
            "androidVersions": ["14"],
            "masterSerial": "MASTER-1",
        }

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.BAD_REQUEST,
            {"error": "masterSerial und childSerial sind für Dual-Device-Kompatibilitätsläufe erforderlich."},
        )

    def test_do_post_android_automation_sweep_queues_catalog_driven_run(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        import app

        handler = self._make_handler("/api/suites/android-automation-sweep")
        master_apk = tmp_path / "master.apk"
        child_apk = tmp_path / "child.apk"
        master_apk.write_text("master", encoding="utf-8")
        child_apk.write_text("child", encoding="utf-8")
        handler._read_json_body.return_value = {
            "installApk": True,
            "skipActivation": True,
            "parallel": True,
            "masterApkPath": str(master_apk),
            "childApkPath": str(child_apk),
        }

        fake_thread = MagicMock()
        fake_thread.start = MagicMock()
        thread_cls = MagicMock(return_value=fake_thread)

        class _FakeUuid:
            hex = "1234567890abcdef"

        monkeypatch.setattr(app.threading, "Thread", thread_cls)
        monkeypatch.setattr(app, "uuid4", lambda: _FakeUuid())
        monkeypatch.setattr(app, "_build_android_automation_sweep_plan", lambda: {
            "androidVersions": ["10", "14"],
            "masterTestClasses": ["master.PairingTest"],
            "childTestClasses": ["child.PairingTest"],
            "selectedScenarioIds": ["pairing"],
        })
        monkeypatch.setattr(app, "_build_android_automation_sweep_preflight", lambda: {
            "status": "approved",
            "canStart": True,
            "approvalRequired": True,
            "hasActiveApproval": True,
            "activeApproval": {
                "approvalId": "sweep-approval-1",
                "approvedAt": "2026-04-20T10:00:00Z",
                "approvedBy": "qa-admin-panel",
                "expiresAt": "2026-04-20T18:00:00Z",
                "warningIds": ["register-blockers-open"],
                "planHash": "plan-hash-1",
            },
            "warningCount": 0,
            "warnings": [],
            "blockingCount": 0,
            "blockingReasons": [],
        })
        monkeypatch.setattr(app, "get_emulator_lab_overview", lambda: {
            "sdkConfigured": True,
            "adbAvailable": True,
            "emulatorBinaryAvailable": True,
            "avdManagerAvailable": True,
        })

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.OK,
            {
                "runId": "autosweep-1234567890ab",
                "status": "queued",
                "executionMode": "all-automated",
                "androidVersions": ["10", "14"],
                "masterTestClasses": ["master.PairingTest"],
                "childTestClasses": ["child.PairingTest"],
                "selectedScenarioIds": ["pairing"],
                "approvalId": "sweep-approval-1",
                "approvedAt": "2026-04-20T10:00:00Z",
                "approvedBy": "qa-admin-panel",
                "approvalWarnings": ["register-blockers-open"],
            },
        )
        fake_thread.start.assert_called_once_with()
        with app._active_suite_lock:
            queued = app._active_suite_runs["autosweep-1234567890ab"]
        assert queued["type"] == "android-automation-sweep"
        assert queued["executionMode"] == "all-automated"
        assert queued["androidVersions"] == ["10", "14"]
        assert queued["approvalId"] == "sweep-approval-1"
        assert queued["approvedAt"] == "2026-04-20T10:00:00Z"
        assert queued["approvedBy"] == "qa-admin-panel"
        assert queued["approvalWarnings"] == ["register-blockers-open"]

    def test_do_post_android_automation_sweep_rejects_warning_state_without_active_approval(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-automation-sweep")
        handler._read_json_body.return_value = {
            "installApk": False,
            "skipActivation": True,
            "parallel": False,
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)
        monkeypatch.setattr(app, "_build_android_automation_sweep_preflight", lambda: {
            "status": "warning",
            "canStart": False,
            "approvalRequired": True,
            "hasActiveApproval": False,
            "activeApproval": None,
            "warningCount": 1,
            "warnings": [{"id": "register-blockers-open"}],
            "blockingCount": 0,
            "blockingReasons": [],
        })

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.CONFLICT,
            {"error": "Für den Android-Automation-Sweep liegt eine serverseitig erforderliche Warnlagen-Freigabe vor. Bitte zuerst die Sweep-Freigabe speichern."},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()

    def test_do_post_android_automation_sweep_rejects_stale_approval_id(self, monkeypatch: pytest.MonkeyPatch):
        import app

        handler = self._make_handler("/api/suites/android-automation-sweep")
        handler._read_json_body.return_value = {
            "approvalId": "sweep-approval-stale",
            "expectedPlanHash": "plan-hash-1",
            "installApk": False,
            "skipActivation": True,
            "parallel": False,
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)
        monkeypatch.setattr(app, "_build_android_automation_sweep_plan", lambda: {
            "androidVersions": ["10", "14"],
            "masterTestClasses": ["master.PairingTest"],
            "childTestClasses": ["child.PairingTest"],
            "selectedScenarioIds": ["pairing"],
        })
        monkeypatch.setattr(app, "_build_android_automation_sweep_preflight", lambda: {
            "status": "approved",
            "canStart": True,
            "approvalRequired": True,
            "hasActiveApproval": True,
            "activeApproval": {
                "approvalId": "sweep-approval-current",
                "approvedAt": "2026-04-20T10:00:00Z",
                "approvedBy": "qa-admin-panel",
                "expiresAt": "2026-04-20T18:00:00Z",
                "warningIds": ["register-blockers-open"],
                "planHash": "plan-hash-1",
            },
            "planHash": "plan-hash-1",
            "warningCount": 1,
            "warnings": [{"id": "register-blockers-open"}],
            "blockingCount": 0,
            "blockingReasons": [],
        })
        monkeypatch.setattr(app, "get_emulator_lab_overview", lambda: {
            "sdkConfigured": True,
            "adbAvailable": True,
            "emulatorBinaryAvailable": True,
            "avdManagerAvailable": True,
        })

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.CONFLICT,
            {
                "error": "Die gespeicherte Android-Automation-Sweep-Freigabe ist nicht mehr für den aktuellen Plan gültig. Bitte Preflight neu laden und gegebenenfalls erneut freigeben.",
                "requiresRefresh": True,
                "currentPlanHash": "plan-hash-1",
                "preflight": {
                    "status": "approved",
                    "canStart": True,
                    "approvalRequired": True,
                    "hasActiveApproval": True,
                    "activeApproval": {
                        "approvalId": "sweep-approval-current",
                        "approvedAt": "2026-04-20T10:00:00Z",
                        "approvedBy": "qa-admin-panel",
                        "expiresAt": "2026-04-20T18:00:00Z",
                        "warningIds": ["register-blockers-open"],
                        "planHash": "plan-hash-1",
                    },
                    "planHash": "plan-hash-1",
                    "warningCount": 1,
                    "warnings": [{"id": "register-blockers-open"}],
                    "blockingCount": 0,
                    "blockingReasons": [],
                },
            },
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()

    @pytest.mark.parametrize(
        ("overview", "expected_error"),
        [
            (
                {
                    "sdkConfigured": False,
                    "adbAvailable": True,
                    "emulatorBinaryAvailable": True,
                    "avdManagerAvailable": True,
                },
                "Android-SDK ist nicht konfiguriert.",
            ),
            (
                {
                    "sdkConfigured": True,
                    "adbAvailable": False,
                    "emulatorBinaryAvailable": True,
                    "avdManagerAvailable": True,
                },
                "ADB ist nicht verfügbar.",
            ),
            (
                {
                    "sdkConfigured": True,
                    "adbAvailable": True,
                    "emulatorBinaryAvailable": False,
                    "avdManagerAvailable": True,
                },
                "Die Android-Emulator-Binary ist nicht verfügbar.",
            ),
            (
                {
                    "sdkConfigured": True,
                    "adbAvailable": True,
                    "emulatorBinaryAvailable": True,
                    "avdManagerAvailable": False,
                },
                "Der AVD Manager ist nicht verfügbar.",
            ),
        ],
    )
    def test_do_post_android_automation_sweep_rejects_hard_preflight_blockers_without_side_effects(
        self,
        monkeypatch: pytest.MonkeyPatch,
        overview: dict[str, bool],
        expected_error: str,
    ):
        import app

        handler = self._make_handler("/api/suites/android-automation-sweep")
        handler._read_json_body.return_value = {
            "installApk": False,
            "skipActivation": True,
            "parallel": True,
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()

        monkeypatch.setattr(app, "_build_android_automation_sweep_plan", lambda: {
            "androidVersions": ["10", "14"],
            "masterTestClasses": ["master.PairingTest"],
            "childTestClasses": ["child.PairingTest"],
            "selectedScenarioIds": ["pairing"],
        })
        monkeypatch.setattr(app, "get_emulator_lab_overview", lambda: overview)
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.BAD_REQUEST,
            {"error": expected_error},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()
        with app._active_suite_lock:
            assert app._active_suite_runs == {}

    def test_do_post_android_automation_sweep_rejects_missing_master_apk_without_side_effects(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        import app

        missing_master_apk = tmp_path / "does-not-exist-master.apk"
        existing_child_apk = tmp_path / "child.apk"
        existing_child_apk.write_text("child", encoding="utf-8")

        handler = self._make_handler("/api/suites/android-automation-sweep")
        handler._read_json_body.return_value = {
            "installApk": True,
            "masterApkPath": str(missing_master_apk),
            "childApkPath": str(existing_child_apk),
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()

        monkeypatch.setattr(app, "_build_android_automation_sweep_plan", lambda: {
            "androidVersions": ["10", "14"],
            "masterTestClasses": ["master.PairingTest"],
            "childTestClasses": ["child.PairingTest"],
            "selectedScenarioIds": ["pairing"],
        })
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.BAD_REQUEST,
            {"error": f"Master-APK-Datei nicht gefunden: {missing_master_apk}"},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()
        with app._active_suite_lock:
            assert app._active_suite_runs == {}

    def test_do_post_android_automation_sweep_rejects_missing_child_apk_without_side_effects(self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
        import app

        existing_master_apk = tmp_path / "master.apk"
        existing_master_apk.write_text("master", encoding="utf-8")
        missing_child_apk = tmp_path / "does-not-exist-child.apk"

        handler = self._make_handler("/api/suites/android-automation-sweep")
        handler._read_json_body.return_value = {
            "installApk": True,
            "masterApkPath": str(existing_master_apk),
            "childApkPath": str(missing_child_apk),
        }

        create_job_mock = MagicMock()
        enqueue_job_mock = MagicMock()

        monkeypatch.setattr(app, "_build_android_automation_sweep_plan", lambda: {
            "androidVersions": ["10", "14"],
            "masterTestClasses": ["master.PairingTest"],
            "childTestClasses": ["child.PairingTest"],
            "selectedScenarioIds": ["pairing"],
        })
        monkeypatch.setattr(app, "create_job", create_job_mock)
        monkeypatch.setattr(app, "enqueue_job", enqueue_job_mock)

        with app._active_suite_lock:
            app._active_suite_runs.clear()

        app.MiniMasterAdminHandler.do_POST(handler)

        handler._write_json.assert_called_once_with(
            HTTPStatus.BAD_REQUEST,
            {"error": f"Child-APK-Datei nicht gefunden: {missing_child_apk}"},
        )
        create_job_mock.assert_not_called()
        enqueue_job_mock.assert_not_called()
        with app._active_suite_lock:
            assert app._active_suite_runs == {}


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
            "manualClass",
            "manualClassLabel",
            "manualClassReason",
            "automationWave",
            "automationWaveLabel",
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
            "parent-panel-verified",
            "device-sync-verified",
        }
        expected_automatic = {
            "android-master-registered",
            "android-child-registered",
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
            "support-flow-verified",
            "compliance-flow-verified",
            "storage-rules-verified",
        }

        assert expected_manual.issubset(ids)
        assert expected_automatic.issubset(ids)
        for test_id in expected_manual:
            assert automation_types[test_id] == "manual"
        for test_id in expected_automatic:
            assert automation_types[test_id] == "automatic"

    def test_documented_commissioning_phase_1_to_3_items_are_bound_to_device_suites(self):
        from app import build_testing_register

        result = build_testing_register()
        items_by_id = {item["id"]: item for item in result["items"]}

        expected_suite_refs = {
            "doc-master-app-registration-auth": "android-usb-master",
            "doc-generate-pairing-code": "android-usb-master",
            "doc-child-app-registration-code": "android-usb-child",
            "doc-create-task": "android-usb-master",
            "doc-child-submits-task-photo": "android-usb-child",
            "doc-task-approval-workflow": "android-usb-master",
            "doc-create-app-blocking-rule": "android-usb-master",
            "doc-verify-app-blocking-enforcement": "android-usb-child",
            "doc-screen-lock-enforcement": "android-usb-master",
        }

        for test_id, suite_ref in expected_suite_refs.items():
            item = items_by_id[test_id]
            assert item["automationType"] == "automatic"
            assert item["source"] == "device-suite"
            assert item["suiteRef"] == suite_ref
            assert item["linkedSuite"] == suite_ref
            assert item["action"] == "suite-run"

    def test_commissioning_entries_can_inherit_pass_state_from_suite_runs(self, monkeypatch: pytest.MonkeyPatch):
        import app

        monkeypatch.setattr(app, "load_commissioning_history", lambda limit: [])
        monkeypatch.setattr(app, "load_latest_commissioning_evidence", lambda: {})
        monkeypatch.setattr(
            app,
            "get_suite_catalog",
            lambda: {
                "suites": [
                    {
                        "suiteId": "android-usb-master",
                        "title": "masterApp USB commissioning",
                        "group": "device",
                        "command": "python scripts/usb_test_runner.py --app-id master --suite commissioning",
                        "prereqsMet": True,
                        "prereqReason": "",
                    }
                ]
            },
        )
        monkeypatch.setattr(
            app,
            "load_latest_suite_results",
            lambda: {
                "android-usb-master": {
                    "suiteId": "android-usb-master",
                    "status": "finished",
                    "timestamp": "2026-01-02T03:04:05Z",
                    "result": {"status": "passed", "returncode": 0},
                }
            },
        )

        result = app.build_testing_register()
        items_by_id = {item["id"]: item for item in result["items"]}

        assert items_by_id["doc-create-task"]["status"] == "pass"
        assert items_by_id["doc-create-task"]["origin"] == "suite-run"
        assert items_by_id["doc-create-task"]["updatedAt"] == "2026-01-02T03:04:05Z"

    def test_docs_validation_gates_are_automatic_and_expose_validator_results(self):
        from app import build_testing_register

        result = build_testing_register()
        items_by_id = {item["id"]: item for item in result["items"]}

        expected_docs_validators = {
            "doc-reviewer-test-credentials",
            "doc-reviewer-submission-checklist",
            "doc-release-evidence-register",
            "p0-play-listing",
            "p0-play-permissions",
            "p0-play-app-access",
        }

        for test_id in expected_docs_validators:
            item = items_by_id[test_id]
            assert item["automationType"] == "automatic"
            assert item["source"] == "docs-validation"
            assert item["origin"] == "docs-validation"
            assert item["status"] in {"pass", "manual_required"}

    def test_play_store_checklist_gate_is_manual_required_when_checklist_is_open(self, monkeypatch: pytest.MonkeyPatch):
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
                "playStoreState": {"checks": {"listing": True, "permissions": False}},
            }
        )

        checks = {item["id"]: item for item in result["checks"]}
        assert checks["play-store-required-checks-complete"]["status"] == "manual_required"

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
            "ma-firebase-appcheck",
            "ca-accessibility-active",
            "ca-app-blocking-effective",
            "ca-overlay-secure",
            "ca-settings-protection",
            "ca-device-admin-enforced",
            "ca-factory-reset-protection",
            "ca-root-detection",
            "ca-permission-onboarding",
            "dt-code-signing",
            "dt-auto-update",
            "dt-system-tray",
            "dt-desktop-notifications",
        }

        expected_static = {
            "ma-task-reject-ui",
            "ma-qr-pairing",
            "ma-subscription-check",
            "ca-fcm-sync",
            "ma-usage-rules-nav",
            "ca-usage-limits",
            "ca-time-windows",
            "dt-ipc-messaging",
        }
        expected_repo_tests = {
            "ma-fcm-working",
            "ma-date-picker",
            "ma-offline-handling",
            "ca-tamper-detection",
            "dt-window-persistence",
            "dt-crash-reporting",
        }
        expected_derived = {
            "ma-registration-flow",
            "ma-pairing-works",
            "ma-lock-unlock",
            "ma-task-create",
            "ma-task-review",
            "ca-pairing-flow",
            "ca-task-proof",
        }

        assert expected_manual.issubset(items_by_id.keys())
        assert expected_static.issubset(items_by_id.keys())
        assert expected_repo_tests.issubset(items_by_id.keys())
        assert expected_derived.issubset(items_by_id.keys())
        for test_id in expected_manual:
            assert items_by_id[test_id]["automationType"] == "manual"
            assert items_by_id[test_id]["source"] == "platform-readiness"
        for test_id in expected_static:
            assert items_by_id[test_id]["automationType"] == "automatic"
            assert items_by_id[test_id]["source"] == "static-analysis"
        for test_id in expected_repo_tests:
            assert items_by_id[test_id]["automationType"] == "automatic"
            assert items_by_id[test_id]["source"] == "repo-test"
        assert items_by_id["ma-date-picker"]["suiteRef"] == "backend-jest"
        assert items_by_id["ma-fcm-working"]["suiteRef"] == "android-unit-master"
        assert items_by_id["ma-offline-handling"]["suiteRef"] == "android-unit-master"
        assert items_by_id["ca-tamper-detection"]["suiteRef"] == "android-unit-child"
        assert items_by_id["dt-window-persistence"]["suiteRef"] == "backend-jest"
        assert items_by_id["dt-crash-reporting"]["suiteRef"] == "backend-jest"
        for test_id in expected_derived:
            assert items_by_id[test_id]["automationType"] == "automatic"
            assert items_by_id[test_id]["source"] == "register-derivative"
            assert items_by_id[test_id]["derivedFrom"]

        for test_id, documentation in {
            "ma-subscription-enforce": "test/branch-coverage-pairing.test.ts",
            "dt-parent-panel-login": "test/web-control-ui.test.ts",
            "dt-admin-panel-login": "test/admin-panel-helpers.test.ts",
        }.items():
            assert items_by_id[test_id]["automationType"] == "documented"
            assert items_by_id[test_id]["source"] == "repo-test"
            assert items_by_id[test_id]["suiteRef"] == ""
            assert items_by_id[test_id]["action"] == "protocol"
            assert items_by_id[test_id]["documentation"] == documentation

    def test_register_exposes_duplicate_coverage_insights_for_derived_checks(self):
        from app import build_testing_register

        result = build_testing_register()

        duplicate_insights = result["duplicateInsights"]
        assert duplicate_insights["count"] >= 1
        entries_by_id = {entry["id"]: entry for entry in duplicate_insights["entries"]}

        assert "ma-task-create" in entries_by_id
        assert entries_by_id["ma-task-create"]["derivedFrom"] == ["doc-create-task"]
        assert entries_by_id["ma-task-create"]["derivedFromTitles"]

    def test_register_classifies_remaining_manual_checks_for_prioritization(self):
        from app import build_testing_register

        result = build_testing_register()
        items_by_id = {item["id"]: item for item in result["items"]}

        assert items_by_id["ca-accessibility-active"]["manualClass"] == "physical-manual"
        assert items_by_id["ma-date-picker"]["automationType"] == "automatic"
        assert items_by_id["ma-date-picker"]["source"] == "repo-test"
        assert items_by_id["ma-fcm-working"]["automationType"] == "automatic"
        assert items_by_id["ma-fcm-working"]["source"] == "repo-test"
        assert items_by_id["ca-tamper-detection"]["automationType"] == "automatic"
        assert items_by_id["ca-tamper-detection"]["source"] == "repo-test"
        assert items_by_id["ma-subscription-enforce"]["automationType"] == "documented"
        assert items_by_id["ma-subscription-enforce"]["source"] == "repo-test"
        assert items_by_id["ma-offline-handling"]["automationType"] == "automatic"
        assert items_by_id["ma-offline-handling"]["source"] == "repo-test"
        assert items_by_id["dt-parent-panel-login"]["automationType"] == "documented"
        assert items_by_id["dt-parent-panel-login"]["source"] == "repo-test"
        assert items_by_id["dt-admin-panel-login"]["automationType"] == "documented"
        assert items_by_id["dt-admin-panel-login"]["source"] == "repo-test"
        assert items_by_id["dt-window-persistence"]["automationType"] == "automatic"
        assert items_by_id["dt-window-persistence"]["source"] == "repo-test"
        assert items_by_id["dt-crash-reporting"]["automationType"] == "automatic"
        assert items_by_id["dt-crash-reporting"]["source"] == "repo-test"
        assert items_by_id["ma-task-reject-ui"]["automationType"] == "automatic"
        assert items_by_id["ma-task-reject-ui"]["source"] == "static-analysis"
        assert items_by_id["ma-qr-pairing"]["automationType"] == "automatic"
        assert items_by_id["ma-qr-pairing"]["source"] == "static-analysis"
        assert items_by_id["firebase-auth-enabled"]["manualClass"] == "external-evidence"

        manual_insights = result["manualInsights"]
        assert manual_insights["total"] >= 1
        assert manual_insights["buckets"]["physical-manual"]["count"] >= 1
        assert manual_insights["buckets"]["automation-backlog"]["count"] >= 1
        assert manual_insights["buckets"]["external-evidence"]["count"] >= 1
        assert manual_insights["waves"]["wave-2"]["count"] >= 1

    def test_load_latest_suite_results_normalizes_specialized_runs_without_suite_id(self, suite_log_file: Path):
        import app

        suite_log_file.write_text(
            "\n".join(
                [
                    json.dumps({
                        "runId": "usb-1",
                        "type": "usb-test",
                        "appId": "master",
                        "status": "finished",
                        "result": {"overallStatus": "passed"},
                    }),
                    json.dumps({
                        "runId": "compat-1",
                        "type": "android-compatibility",
                        "executionMode": "single-child",
                        "status": "finished",
                        "result": {"overallStatus": "passed"},
                    }),
                ]
            ),
            encoding="utf-8",
        )

        latest = app.load_latest_suite_results()

        assert latest["android-usb-master"]["runId"] == "usb-1"
        assert latest["android-usb-child"]["runId"] == "compat-1"
        assert latest["android-compatibility-single-child"]["runId"] == "compat-1"

    def test_commissioning_entries_can_inherit_pass_state_from_specialized_usb_runs(self, monkeypatch: pytest.MonkeyPatch):
        import app

        monkeypatch.setattr(app, "load_commissioning_history", lambda limit: [])
        monkeypatch.setattr(app, "load_latest_commissioning_evidence", lambda: {})
        monkeypatch.setattr(
            app,
            "get_suite_catalog",
            lambda: {
                "suites": [
                    {
                        "suiteId": "android-usb-master",
                        "title": "masterApp USB commissioning",
                        "group": "device",
                        "command": "python scripts/usb_test_runner.py --app-id master --suite commissioning",
                        "prereqsMet": True,
                        "prereqReason": "",
                    }
                ]
            },
        )
        monkeypatch.setattr(
            app,
            "load_latest_suite_results",
            lambda: {
                "android-usb-master": {
                    "runId": "usb-1",
                    "type": "usb-test",
                    "appId": "master",
                    "status": "finished",
                    "timestamp": "2026-04-19T18:20:00Z",
                    "result": {"overallStatus": "passed"},
                }
            },
        )

        result = app.build_testing_register()
        items_by_id = {item["id"]: item for item in result["items"]}

        assert items_by_id["doc-create-task"]["status"] == "pass"
        assert items_by_id["doc-create-task"]["origin"] == "suite-run"
        assert items_by_id["doc-create-task"]["updatedAt"] == "2026-04-19T18:20:00Z"

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

    def test_missing_service_account_is_reported_as_manual_required(self, monkeypatch: pytest.MonkeyPatch):
        import app

        monkeypatch.setattr(app, "load_local_firebase_binding_status", lambda project_id: (True, f"bound:{project_id or 'default'}"))
        monkeypatch.setattr(app, "load_local_service_account_status", lambda: (False, "serviceAccountKey.json fehlt lokal; Setup-Admin-Lauf wird deshalb uebersprungen."))

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
        assert checks["service-account-ready"]["status"] == "manual_required"
        assert "uebersprungen" in checks["service-account-ready"]["details"]

    def test_full_validation_error_count_is_inferred_from_checks(self, monkeypatch: pytest.MonkeyPatch):
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
                    "checks": {
                        "firestoreAccessOk": True,
                        "storageHealthOk": False,
                        "functionsReachable": False,
                    },
                },
                "attestations": {},
                "playStoreState": {"checks": {}},
            }
        )

        checks = {item["id"]: item for item in result["checks"]}
        assert checks["full-validation-status"]["status"] == "fail"
        assert checks["full-validation-status"]["details"] == "Full Validation meldet 2 Fehler."

    def test_full_validation_passes_when_checks_are_present_without_error_count(self, monkeypatch: pytest.MonkeyPatch):
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
        assert checks["full-validation-status"]["status"] == "pass"
        assert checks["full-validation-status"]["details"] == "Full Validation meldet 0 Fehler."


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


class TestEmulatorLabOverview:
    @patch("app.get_emulator_lab_overview")
    def test_overview_is_returned(self, mock_overview):
        mock_overview.return_value = {
            "sdkConfigured": True,
            "matrixPlanCount": 4,
            "reservationCount": 1,
            "availableAvdCount": 2,
        }

        from app import get_emulator_lab_overview

        result = get_emulator_lab_overview()
        assert result["sdkConfigured"] is True
        assert result["matrixPlanCount"] == 4

    @patch("app.load_emulator_reservations")
    def test_reservations_can_be_loaded(self, mock_reservations):
        mock_reservations.return_value = [{"reservationId": "emu-1"}]

        from app import load_emulator_reservations

        result = load_emulator_reservations()
        assert len(result) == 1
        assert result[0]["reservationId"] == "emu-1"

    @patch("app.list_running_emulators")
    def test_running_emulators_can_be_loaded(self, mock_running):
        mock_running.return_value = [{"serial": "emulator-5554", "state": "device"}]

        from app import list_running_emulators

        result = list_running_emulators()
        assert len(result) == 1
        assert result[0]["serial"] == "emulator-5554"

    @patch("app.start_emulator")
    def test_start_emulator_helper_is_available(self, mock_start):
        mock_start.return_value = {"started": True, "avdName": "Pixel_8_API_34"}

        from app import start_emulator

        result = start_emulator("Pixel_8_API_34")
        assert result["started"] is True
        assert result["avdName"] == "Pixel_8_API_34"

    @patch("app.stop_emulator")
    def test_stop_emulator_helper_is_available(self, mock_stop):
        mock_stop.return_value = {"stopped": True, "serial": "emulator-5554"}

        from app import stop_emulator

        result = stop_emulator("emulator-5554")
        assert result["stopped"] is True
        assert result["serial"] == "emulator-5554"


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
            assert _active_suite_runs[run_id]["currentPhase"] == "finished"

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
            assert _active_suite_runs[run_id]["currentPhase"] == "error"

    @patch("app.run_dual_device")
    def test_progress_callback_updates_timeline(self, mock_run_dual, suite_log_file):
        from app import _run_dual_device_background, _active_suite_runs, _active_suite_lock
        from dual_device_runner import DualDeviceResult

        run_id = "dual-progress"

        def fake_run_dual_device(*args, **kwargs):
            callback = kwargs.get("on_event")
            if callback:
                callback({"phase": "preflight", "status": "running", "message": "Preflight"})
                callback({"phase": "master", "status": "running", "message": "Master"})
            result = DualDeviceResult(master_serial="M1", child_serial="C1", timeline=[])
            result.overall_status = "passed"
            return result

        mock_run_dual.side_effect = fake_run_dual_device

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_dual_device_background(run_id, {"master_serial": "M1", "child_serial": "C1"})

        with _active_suite_lock:
            assert len(_active_suite_runs[run_id]["timeline"]) == 2
            assert _active_suite_runs[run_id]["lastEvent"]["phase"] == "master"


class TestRunAndroidCompatibilityBackground:
    @patch("app.run_usb_test")
    def test_collects_subruns_and_summary(self, mock_run_usb, suite_log_file):
        from app import _run_android_compatibility_background, _active_suite_runs, _active_suite_lock
        from usb_test_runner import UsbTestRunResult

        run_id = "compat-test-1"
        first = UsbTestRunResult(app_id="master", serial="A", suite="commissioning")
        first.overall_status = "passed"
        second = UsbTestRunResult(app_id="master", serial="A", suite="commissioning")
        second.overall_status = "error"
        second.error = "Version mismatch"
        mock_run_usb.side_effect = [first, second]

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_android_compatibility_background(run_id, {
            "execution_mode": "single-master",
            "android_versions": ["10", "14"],
            "app_id": "master",
            "serial": "DEVICE-1",
            "suite": "commissioning",
        })

        with _active_suite_lock:
            assert _active_suite_runs[run_id]["status"] == "finished"
            assert len(_active_suite_runs[run_id]["subRuns"]) == 2
            assert _active_suite_runs[run_id]["result"]["summary"]["counts"]["passed"] == 1
            assert _active_suite_runs[run_id]["result"]["summary"]["counts"]["error"] == 1
            assert _active_suite_runs[run_id]["result"]["overallStatus"] == "failed"

    @patch("app.ensure_emulator_pool")
    @patch("app.run_usb_test")
    def test_provisions_emulator_when_single_run_uses_auto_serial(self, mock_run_usb, mock_pool, suite_log_file):
        from app import _run_android_compatibility_background, _active_suite_runs, _active_suite_lock
        from usb_test_runner import UsbTestRunResult

        run_id = "compat-auto-single"
        mock_pool.return_value = [{"serial": "emulator-5554", "androidVersion": "14", "profileId": "phone-large"}]
        result = UsbTestRunResult(app_id="master", serial="emulator-5554", suite="commissioning")
        result.overall_status = "passed"
        mock_run_usb.return_value = result

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_android_compatibility_background(run_id, {
            "execution_mode": "single-master",
            "android_versions": ["14"],
            "app_id": "master",
            "serial": "auto",
            "suite": "commissioning",
        })

        mock_pool.assert_called_once()
        assert mock_run_usb.call_args.kwargs["serial"] == "emulator-5554"
        with _active_suite_lock:
            assert _active_suite_runs[run_id]["subRuns"][0]["provisioning"][0]["serial"] == "emulator-5554"

    @patch("app.run_usb_test")
    def test_runs_each_selected_test_class_per_android_version(self, mock_run_usb, suite_log_file):
        from app import _run_android_compatibility_background, _active_suite_runs, _active_suite_lock
        from usb_test_runner import UsbTestRunResult

        run_id = "compat-selected-tests"
        first = UsbTestRunResult(app_id="master", serial="DEVICE-1", suite="commissioning")
        first.overall_status = "passed"
        second = UsbTestRunResult(app_id="master", serial="DEVICE-1", suite="commissioning")
        second.overall_status = "passed"
        mock_run_usb.side_effect = [first, second]

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_android_compatibility_background(run_id, {
            "execution_mode": "single-master",
            "android_versions": ["14"],
            "app_id": "master",
            "serial": "DEVICE-1",
            "suite": "commissioning",
            "selected_test_classes": [
                "com.minimaster.masterapp.FirstUiTest",
                "com.minimaster.masterapp.SecondUiTest",
            ],
        })

        assert mock_run_usb.call_count == 2
        assert mock_run_usb.call_args_list[0].kwargs["selected_test_classes"] == ["com.minimaster.masterapp.FirstUiTest"]
        assert mock_run_usb.call_args_list[1].kwargs["selected_test_classes"] == ["com.minimaster.masterapp.SecondUiTest"]
        with _active_suite_lock:
            sub_runs = _active_suite_runs[run_id]["subRuns"]
        assert len(sub_runs) == 2
        assert sub_runs[0]["testClass"] == "com.minimaster.masterapp.FirstUiTest"
        assert sub_runs[1]["testClass"] == "com.minimaster.masterapp.SecondUiTest"

    @patch("app.ensure_emulator_pool")
    @patch("app.run_dual_device")
    def test_provisions_two_emulators_when_dual_run_uses_auto_serials(self, mock_run_dual, mock_pool, suite_log_file):
        from app import _run_android_compatibility_background, _active_suite_runs, _active_suite_lock
        from dual_device_runner import DualDeviceResult

        run_id = "compat-auto-dual"
        mock_pool.return_value = [
            {"serial": "emulator-5554", "androidVersion": "14", "profileId": "dual-device-balanced"},
            {"serial": "emulator-5556", "androidVersion": "14", "profileId": "dual-device-balanced"},
        ]
        result = DualDeviceResult(master_serial="emulator-5554", child_serial="emulator-5556")
        result.overall_status = "passed"
        mock_run_dual.return_value = result

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_android_compatibility_background(run_id, {
            "execution_mode": "dual-device",
            "android_versions": ["14"],
            "master_serial": "auto",
            "child_serial": "auto",
            "scenario_id": "offline-online-resync",
            "profile_id": "dual-device-balanced",
            "fault_modes": [],
        })

        mock_pool.assert_called_once()
        assert mock_run_dual.call_args.kwargs["master_serial"] == "emulator-5554"
        assert mock_run_dual.call_args.kwargs["child_serial"] == "emulator-5556"

    @patch("app.load_dual_device_scenarios")
    @patch("app.run_dual_device")
    def test_runs_each_selected_dual_scenario_for_matching_android_version(self, mock_run_dual, mock_scenarios, suite_log_file):
        from app import _run_android_compatibility_background, _active_suite_runs, _active_suite_lock
        from dual_device_runner import DualDeviceResult

        run_id = "compat-selected-scenarios"
        first = DualDeviceResult(master_serial="M1", child_serial="C1")
        first.overall_status = "passed"
        second = DualDeviceResult(master_serial="M1", child_serial="C1")
        second.overall_status = "passed"
        mock_run_dual.side_effect = [first, second]
        mock_scenarios.return_value = [
            {"scenarioId": "offline-online-resync", "androidVersions": ["14"]},
            {"scenarioId": "pairing-code-expiry", "androidVersions": ["14", "15"]},
            {"scenarioId": "legacy-only", "androidVersions": ["10"]},
        ]

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_android_compatibility_background(run_id, {
            "execution_mode": "dual-device",
            "android_versions": ["14"],
            "master_serial": "M1",
            "child_serial": "C1",
            "selected_scenario_ids": ["offline-online-resync", "pairing-code-expiry", "legacy-only"],
            "profile_id": "dual-device-balanced",
            "fault_modes": [],
        })

        assert mock_run_dual.call_count == 2
        assert mock_run_dual.call_args_list[0].kwargs["scenario_id"] == "offline-online-resync"
        assert mock_run_dual.call_args_list[1].kwargs["scenario_id"] == "pairing-code-expiry"
        with _active_suite_lock:
            sub_runs = _active_suite_runs[run_id]["subRuns"]
        assert len(sub_runs) == 2
        assert [item["scenarioId"] for item in sub_runs] == ["offline-online-resync", "pairing-code-expiry"]


class TestRunAndroidAutomationSweepBackground:
    @patch("app.ensure_emulator_pool")
    @patch("app.load_dual_device_scenarios")
    @patch("app.run_dual_device")
    @patch("app.run_usb_test")
    def test_runs_master_child_and_dual_jobs_in_single_sweep(self, mock_run_usb, mock_run_dual, mock_scenarios, mock_pool, suite_log_file):
        from app import _run_android_automation_sweep_background, _active_suite_runs, _active_suite_lock
        from dual_device_runner import DualDeviceResult
        from usb_test_runner import UsbTestRunResult

        run_id = "autosweep-test-1"
        master_result = UsbTestRunResult(app_id="master", serial="emu-1", suite="commissioning")
        master_result.overall_status = "passed"
        child_result = UsbTestRunResult(app_id="child", serial="emu-2", suite="commissioning")
        child_result.overall_status = "passed"
        dual_result = DualDeviceResult(master_serial="emu-3", child_serial="emu-4")
        dual_result.overall_status = "passed"
        mock_pool.side_effect = [
            [{"serial": "emu-1", "androidVersion": "14", "profileId": "phone-large"}],
            [{"serial": "emu-2", "androidVersion": "14", "profileId": "phone-large"}],
            [
                {"serial": "emu-3", "androidVersion": "14", "profileId": "dual-device-balanced"},
                {"serial": "emu-4", "androidVersion": "14", "profileId": "dual-device-balanced"},
            ],
        ]
        mock_run_usb.side_effect = [master_result, child_result]
        mock_run_dual.return_value = dual_result
        mock_scenarios.return_value = [{"scenarioId": "pairing", "androidVersions": ["14"]}]

        with _active_suite_lock:
            _active_suite_runs[run_id] = {"status": "queued"}

        _run_android_automation_sweep_background(run_id, {
            "android_versions": ["14"],
            "master_test_classes": ["master.PairingTest"],
            "child_test_classes": ["child.PairingTest"],
            "selected_scenario_ids": ["pairing"],
            "skip_activation": True,
            "parallel": True,
        })

        assert mock_run_usb.call_count == 2
        assert mock_run_dual.call_count == 1
        with _active_suite_lock:
            run_state = _active_suite_runs[run_id]
        assert run_state["status"] == "finished"
        assert run_state["result"]["executionMode"] == "all-automated"
        assert len(run_state["result"]["subRuns"]) == 3
        assert [item["executionMode"] for item in run_state["result"]["subRuns"]] == ["single-master", "single-child", "dual-device"]


class TestSelfHealingCycle:
    def test_marks_stale_active_run_as_error_and_logs_fix(self, suite_log_file):
        import app

        with app._active_suite_lock:
            app._active_suite_runs["stale-run-1"] = {
                "runId": "stale-run-1",
                "suiteId": "backend-lint",
                "status": "running",
                "startedAt": "2026-04-10T08:00:00Z",
                "timeline": [],
                "result": None,
            }

        cycle = app.run_self_healing_cycle(auto_fix=True, stale_after_sec=60)

        assert cycle["systemHealth"] == "DEGRADED"
        assert any(item["action"] == "mark-stale-run-error" for item in cycle["fixesApplied"])
        with app._active_suite_lock:
            healed_run = app._active_suite_runs["stale-run-1"]
        assert healed_run["status"] == "error"
        assert healed_run["currentPhase"] == "error"
        assert healed_run["finishedAt"]
        assert "Self-Healing" in str(healed_run["error"])

    def test_rewrites_history_entries_with_missing_integrity_fields(self, suite_log_file):
        import app

        suite_log_file.write_text(
            json.dumps({
                "runId": "history-run-1",
                "suiteId": "backend-jest",
                "result": {"overallStatus": "passed", "status": "passed"},
                "timestamp": "2026-04-10T09:00:00Z",
            }, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        cycle = app.run_self_healing_cycle(auto_fix=True, stale_after_sec=60)
        rewritten_entries = [json.loads(line) for line in suite_log_file.read_text(encoding="utf-8").splitlines() if line.strip()]

        assert any(item["runId"] == "history-run-1" for item in cycle["fixesApplied"])
        assert rewritten_entries[0]["type"] == "suite"
        assert rewritten_entries[0]["status"] == "finished"
        assert rewritten_entries[0]["startedAt"] == "2026-04-10T09:00:00Z"
        assert rewritten_entries[0]["finishedAt"] == "2026-04-10T09:00:00Z"

    def test_reports_manual_fix_for_finished_run_without_result(self, suite_log_file):
        import app

        suite_log_file.write_text(
            json.dumps({
                "runId": "history-run-2",
                "suiteId": "backend-jest",
                "status": "finished",
                "timestamp": "2026-04-10T09:30:00Z",
            }, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

        cycle = app.run_self_healing_cycle(auto_fix=True, stale_after_sec=60)

        pending = [item for item in cycle["pendingFixes"] if item["runId"] == "history-run-2"]
        assert pending
        assert pending[0]["fixType"] == "MANUAL_FIX_REQUIRED"
        assert "suite_runs.jsonl" in pending[0]["manualPlan"]


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
