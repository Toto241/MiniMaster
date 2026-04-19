"""HTTP-nahe Integrationstests für QA- und Suite-Endpunkte des Python-Admin-Servers."""
from __future__ import annotations

import importlib
import json
import sys
import threading
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = SCRIPTS_DIR.parent

sys.path.insert(0, str(SCRIPTS_DIR))
sys.path.insert(0, str(REPO_ROOT / "python_admin"))


def load_app_module():
    return importlib.import_module("app")


@pytest.fixture()
def qa_http_server(monkeypatch: pytest.MonkeyPatch):
    import python_admin_app_loader as _  # noqa: F401
    app = load_app_module()

    monkeypatch.setattr(app.MiniMasterAdminHandler, "log_message", lambda *args, **kwargs: None)
    server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.MiniMasterAdminHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        yield base_url
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def _read_json(url: str, *, method: str = "GET", body: dict[str, object] | None = None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(
        url,
        data=data,
        method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urlopen(request, timeout=5) as response:  # noqa: S310 - local test server only
        return response.status, dict(response.headers), json.loads(response.read().decode("utf-8"))


class TestQaRuntimeHttpContracts:
    def test_runtime_http_serves_qa_catalog_payload(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        monkeypatch.setattr(app, "get_qa_catalog", lambda: {"androidMatrix": [{"apiLevel": 35}], "criticalBacklog": []})

        status, headers, payload = _read_json(f"{qa_http_server}/api/qa/catalog")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert payload == {"androidMatrix": [{"apiLevel": 35}], "criticalBacklog": []}

    def test_runtime_http_clamps_evidence_history_limit_and_returns_latest_index(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        history_calls: list[tuple[int, str | None]] = []

        def fake_history(limit: int, *, test_id: str | None = None):
            history_calls.append((limit, test_id))
            return [{"testId": test_id, "status": "pass"}]

        monkeypatch.setattr(app, "load_commissioning_evidence_history", fake_history)
        monkeypatch.setattr(app, "load_latest_commissioning_evidence", lambda: {"ios-xctest-parent": {"status": "pass"}})

        status, _headers, payload = _read_json(f"{qa_http_server}/api/commissioning/evidence?limit=9999&testId=ios-xctest-parent")

        assert status == 200
        assert history_calls == [(app.MAX_EVIDENCE_LIMIT, "ios-xctest-parent")]
        assert payload["count"] == app.MAX_EVIDENCE_LIMIT
        assert payload["latestByTestId"] == {"ios-xctest-parent": {"status": "pass"}}

    def test_runtime_http_clamps_suite_history_limit(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        calls: list[int] = []

        def fake_history(limit: int):
            calls.append(limit)
            return [{"runId": "run-1", "status": "finished"}]

        monkeypatch.setattr(app, "load_suite_run_history", fake_history)

        status, _headers, payload = _read_json(f"{qa_http_server}/api/suites/history?limit=500")

        assert status == 200
        assert calls == [200]
        assert payload == {"runs": [{"runId": "run-1", "status": "finished"}], "count": 200}

    def test_runtime_http_serves_self_healing_status(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        cycle_calls: list[tuple[bool, int, str]] = []

        def fake_cycle(*, auto_fix: bool = True, stale_after_sec: int, triggered_by: str):
            cycle_calls.append((auto_fix, stale_after_sec, triggered_by))
            return {"systemHealth": "OK", "detectedIssues": [], "fixesApplied": [], "pendingFixes": [], "validationResults": []}

        monkeypatch.setattr(app, "run_self_healing_cycle", fake_cycle)

        status, headers, payload = _read_json(f"{qa_http_server}/api/qa/self-healing/status?autoFix=true&staleAfterSec=120")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert cycle_calls == [(False, 120, "http-get")]
        assert payload["systemHealth"] == "OK"

    def test_runtime_http_queues_self_healing_run(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        create_job_calls: list[dict[str, object]] = []
        enqueue_calls: list[str] = []

        def fake_create_job(**kwargs):
            create_job_calls.append(kwargs)
            return {"jobId": "job-self-healing-http"}

        def fake_enqueue_job(job_id: str):
            enqueue_calls.append(job_id)
            return {"jobId": job_id, "status": "queued"}

        monkeypatch.setattr(app, "create_job", fake_create_job)
        monkeypatch.setattr(app, "enqueue_job", fake_enqueue_job)

        status, headers, payload = _read_json(
            f"{qa_http_server}/api/qa/self-healing/run",
            method="POST",
            body={"autoFix": False, "staleAfterSec": 300},
        )

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert create_job_calls == [{
            "job_type": "system",
            "payload": {
                "action": "self-healing-cycle",
                "autoFix": False,
                "staleAfterSec": 300,
                "triggeredBy": "http-post",
            },
            "label": "Self-Healing-Zyklus",
            "priority": 15,
        }]
        assert enqueue_calls == ["job-self-healing-http"]
        assert payload == {"jobId": "job-self-healing-http", "status": "queued"}

    def test_runtime_http_serves_release_workspace_payload(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        monkeypatch.setattr(app, "build_qa_release_workspace", lambda: {
            "generatedAt": "2026-04-19T12:00:00Z",
            "summary": {"blockingCount": 2, "systemHealth": "DEGRADED"},
            "blockers": [{"id": "failed-suite", "title": "Failed Suite"}],
            "queue": [{"runId": "run-1", "status": "running"}],
            "recentFailures": [{"runId": "run-0", "suiteId": "android-unit-master"}],
            "health": {"systemHealth": "DEGRADED"},
            "emulators": {"summary": {"runningCount": 1}},
            "agentWorkspace": {
                "agents": [{"name": "validator", "role": "validator"}],
                "synthesis": {"summary": "One blocker remains"},
            },
        })

        status, headers, payload = _read_json(f"{qa_http_server}/api/qa/release-workspace")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert payload["summary"]["blockingCount"] == 2
        assert payload["agentWorkspace"]["agents"][0]["name"] == "validator"

    def test_runtime_http_serves_operator_jobs(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        monkeypatch.setattr(app, "list_jobs", lambda limit=25, statuses=None, job_types=None: [
            {"jobId": "suite-1", "type": "test", "status": "running"},
        ])

        status, headers, payload = _read_json(f"{qa_http_server}/api/jobs?limit=10&type=test")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert payload == {"jobs": [{"jobId": "suite-1", "type": "test", "status": "running"}], "count": 1}

    def test_runtime_http_serves_operator_errors(self, qa_http_server: str, monkeypatch: pytest.MonkeyPatch):
        app = load_app_module()

        monkeypatch.setattr(app, "list_operator_errors", lambda limit=50: [
            {"errorId": "job:suite-1", "title": "Suite fehlgeschlagen", "severity": "high"},
        ])

        status, headers, payload = _read_json(f"{qa_http_server}/api/jobs/errors")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert payload["count"] == 1
        assert payload["errors"][0]["errorId"] == "job:suite-1"

    def test_runtime_http_rejects_invalid_dual_device_requests(self, qa_http_server: str):
        with pytest.raises(HTTPError) as exc_info:
            _read_json(
                f"{qa_http_server}/api/suites/dual-device",
                method="POST",
                body={"masterSerial": "MASTER-1"},
            )

        assert exc_info.value.code == 400
        payload = json.loads(exc_info.value.read().decode("utf-8"))
        assert payload["error"] == "masterSerial und childSerial sind erforderlich."

    def test_runtime_http_rejects_identical_dual_device_serials(self, qa_http_server: str):
        with pytest.raises(HTTPError) as exc_info:
            _read_json(
                f"{qa_http_server}/api/suites/dual-device",
                method="POST",
                body={"masterSerial": "SAME-DEVICE-1", "childSerial": "SAME-DEVICE-1"},
            )

        assert exc_info.value.code == 400
        payload = json.loads(exc_info.value.read().decode("utf-8"))
        assert payload["error"] == "Master- und Child-ADB-Serial müssen unterschiedlich sein."

    def test_runtime_http_rejects_invalid_android_compatibility_requests(self, qa_http_server: str):
        with pytest.raises(HTTPError) as exc_info:
            _read_json(
                f"{qa_http_server}/api/suites/android-compatibility",
                method="POST",
                body={"executionMode": "single-master", "androidVersions": []},
            )

        assert exc_info.value.code == 400
        payload = json.loads(exc_info.value.read().decode("utf-8"))
        assert payload["error"] == "Mindestens eine gültige Android-Version ist erforderlich."

    def test_runtime_http_serves_duplicate_coverage_insights_in_testing_register(self, qa_http_server: str):
        status, headers, payload = _read_json(f"{qa_http_server}/api/testing/register")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert payload["duplicateInsights"]["count"] >= 1

        items_by_id = {item["id"]: item for item in payload["items"]}
        assert items_by_id["ma-task-create"]["automationType"] == "automatic"
        assert items_by_id["ma-task-create"]["source"] == "register-derivative"
        assert items_by_id["ma-task-create"]["derivedFrom"] == ["doc-create-task"]

    def test_runtime_http_serves_manual_prioritization_insights_in_testing_register(self, qa_http_server: str):
        status, headers, payload = _read_json(f"{qa_http_server}/api/testing/register")

        assert status == 200
        assert headers.get("Cache-Control") == "no-store"
        assert payload["manualInsights"]["total"] >= 1

        items_by_id = {item["id"]: item for item in payload["items"]}
        assert items_by_id["ca-accessibility-active"]["manualClass"] == "physical-manual"
        assert items_by_id["ma-subscription-check"]["automationType"] == "automatic"
        assert items_by_id["ma-subscription-check"]["source"] == "static-analysis"
        assert items_by_id["ma-fcm-working"]["automationType"] == "automatic"
        assert items_by_id["ma-fcm-working"]["source"] == "repo-test"
        assert items_by_id["ma-fcm-working"]["suiteRef"] == "android-unit-master"
        assert items_by_id["ma-date-picker"]["automationType"] == "automatic"
        assert items_by_id["ma-date-picker"]["source"] == "repo-test"
        assert items_by_id["ma-date-picker"]["suiteRef"] == "backend-jest"
        assert items_by_id["ca-fcm-sync"]["automationType"] == "automatic"
        assert items_by_id["ca-fcm-sync"]["source"] == "static-analysis"
        assert items_by_id["ca-tamper-detection"]["automationType"] == "automatic"
        assert items_by_id["ca-tamper-detection"]["source"] == "repo-test"
        assert items_by_id["ca-tamper-detection"]["suiteRef"] == "android-unit-child"
        assert items_by_id["ma-subscription-enforce"]["automationType"] == "documented"
        assert items_by_id["ma-subscription-enforce"]["source"] == "repo-test"
        assert items_by_id["ma-subscription-enforce"]["suiteRef"] == ""
        assert items_by_id["ma-subscription-enforce"]["action"] == "protocol"
        assert items_by_id["ma-offline-handling"]["automationType"] == "automatic"
        assert items_by_id["ma-offline-handling"]["source"] == "repo-test"
        assert items_by_id["ma-offline-handling"]["suiteRef"] == "android-unit-master"
        assert items_by_id["dt-parent-panel-login"]["automationType"] == "documented"
        assert items_by_id["dt-parent-panel-login"]["source"] == "repo-test"
        assert items_by_id["dt-parent-panel-login"]["suiteRef"] == ""
        assert items_by_id["dt-parent-panel-login"]["action"] == "protocol"
        assert items_by_id["dt-admin-panel-login"]["automationType"] == "documented"
        assert items_by_id["dt-admin-panel-login"]["source"] == "repo-test"
        assert items_by_id["dt-admin-panel-login"]["suiteRef"] == ""
        assert items_by_id["dt-admin-panel-login"]["action"] == "protocol"
        assert items_by_id["dt-window-persistence"]["automationType"] == "automatic"
        assert items_by_id["dt-window-persistence"]["source"] == "repo-test"
        assert items_by_id["dt-window-persistence"]["suiteRef"] == "backend-jest"
        assert items_by_id["dt-crash-reporting"]["automationType"] == "automatic"
        assert items_by_id["dt-crash-reporting"]["source"] == "repo-test"
        assert items_by_id["dt-crash-reporting"]["suiteRef"] == "backend-jest"
        assert items_by_id["ma-task-reject-ui"]["automationType"] == "automatic"
        assert items_by_id["ma-task-reject-ui"]["source"] == "static-analysis"
        assert items_by_id["ma-qr-pairing"]["automationType"] == "automatic"
        assert items_by_id["ma-qr-pairing"]["source"] == "static-analysis"
        assert items_by_id["firebase-auth-enabled"]["manualClass"] == "external-evidence"
