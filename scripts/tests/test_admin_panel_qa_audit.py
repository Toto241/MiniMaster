from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "scripts" / "admin_panel_qa_audit.py"


def load_module():
    spec = importlib.util.spec_from_file_location("admin_panel_qa_audit", MODULE_PATH)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_admin_panel_qa_audit_payload_shape():
    module = load_module()

    payload = module.evaluate()

    assert "findings" in payload
    assert "suite_groups" in payload
    assert "manual_to_automation_candidates" in payload
    assert isinstance(payload["findings"], list)
    assert isinstance(payload["suite_groups"], dict)
    assert isinstance(payload["manual_to_automation_candidates"], list)


def test_admin_panel_qa_audit_maps_manual_checks_to_target_suites():
    module = load_module()

    payload = module.evaluate()
    candidates = payload["manual_to_automation_candidates"]
    target_suites = {candidate["target_suite"] for candidate in candidates}

    assert "android-connected-master" in target_suites
    assert "android-connected-child" in target_suites
    assert "python-tests-dual-device-runner" in target_suites
    assert "android-e2e-shell" in target_suites


def test_admin_panel_qa_audit_renders_markdown_report():
    module = load_module()

    payload = module.evaluate()
    markdown = module.render_markdown(payload)

    assert "# Admin-Panel QA Audit" in markdown
    assert "Manual checks to migrate toward automation" in markdown
    assert "android-connected-master" in markdown
