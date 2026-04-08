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
        assert items_by_id["ca-fcm-sync"]["automationType"] == "automatic"
        assert items_by_id["ca-fcm-sync"]["source"] == "static-analysis"
        assert items_by_id["ma-subscription-enforce"]["automationType"] == "automatic"
        assert items_by_id["ma-subscription-enforce"]["source"] == "repo-test"
        assert items_by_id["ma-subscription-enforce"]["suiteRef"] == "backend-subscription-enforcement"
        assert items_by_id["ma-offline-handling"]["automationType"] == "automatic"
        assert items_by_id["ma-offline-handling"]["source"] == "repo-test"
        assert items_by_id["ma-offline-handling"]["suiteRef"] == "android-unit-master"
        assert items_by_id["dt-parent-panel-login"]["automationType"] == "automatic"
        assert items_by_id["dt-parent-panel-login"]["source"] == "repo-test"
        assert items_by_id["dt-parent-panel-login"]["suiteRef"] == "web-control-auth-flow"
        assert items_by_id["dt-admin-panel-login"]["automationType"] == "automatic"
        assert items_by_id["dt-admin-panel-login"]["source"] == "repo-test"
        assert items_by_id["dt-admin-panel-login"]["suiteRef"] == "admin-panel-auth-flow"
        assert items_by_id["ma-task-reject-ui"]["automationWave"] == "wave-2"
        assert items_by_id["firebase-auth-enabled"]["manualClass"] == "external-evidence"
