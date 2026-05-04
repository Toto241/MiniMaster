from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "admin_panel_qa_plan.py"


def test_admin_panel_qa_plan_outputs_json_and_markdown(tmp_path: Path) -> None:
    json_out = tmp_path / "plan.json"
    md_out = tmp_path / "plan.md"

    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--json-out", str(json_out), "--markdown-out", str(md_out)],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )

    assert json_out.exists(), result.stderr
    assert md_out.exists(), result.stderr

    payload = json.loads(json_out.read_text(encoding="utf-8"))
    assert payload["summary"]["total"] > 0
    assert payload["summary"]["p0"] >= 2
    assert payload["summary"]["p1"] >= 1
    assert payload["summary"]["automatedOrScriptable"] >= 1
    assert payload["summary"]["androidVersions"]

    item_ids = {item["id"] for item in payload["items"]}
    assert "github-actions-billing" in item_ids
    assert "github-code-scanning" in item_ids
    assert "android-10-16-dual-device-matrix" in item_ids

    markdown = md_out.read_text(encoding="utf-8")
    assert "Priorisierter Admin-Panel-QA-Umsetzungsplan" in markdown
    assert "Android 10-16" in markdown


def test_admin_panel_qa_plan_gate_fails_on_open_p0(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--json-out",
            str(tmp_path / "plan.json"),
            "--markdown-out",
            str(tmp_path / "plan.md"),
            "--fail-on-p0-open",
        ],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert result.returncode == 1
    payload = json.loads((tmp_path / "plan.json").read_text(encoding="utf-8"))
    assert any(item["priority"] == "P0" and item["status"] != "done" for item in payload["items"])
