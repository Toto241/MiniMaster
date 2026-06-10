from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "playstore_compliance_protocol.py"


def test_playstore_protocol_outputs_json_and_markdown(tmp_path: Path) -> None:
    json_out = tmp_path / "protocol.json"
    md_out = tmp_path / "protocol.md"

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
    assert payload["type"] == "google-playstore-compliance-protocol"
    assert payload["summary"]["total"] >= 5
    assert payload["summary"]["ready"] is True
    assert {item["id"] for item in payload["criteria"]} >= {
        "data-safety",
        "permissions-declaration",
        "store-listing-iarc",
        "reviewer-access",
        "release-evidence",
    }
    assert any(gate["id"] == "admin-panel-playstore-tests" for gate in payload["automatedGates"])

    markdown = md_out.read_text(encoding="utf-8")
    assert "Google Playstore Kriterien-Protokoll" in markdown
    assert "Play Console Data-Safety" in markdown


def test_playstore_protocol_gate_passes_for_current_repo(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--json-out",
            str(tmp_path / "protocol.json"),
            "--markdown-out",
            str(tmp_path / "protocol.md"),
            "--fail-on-open",
        ],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert result.returncode == 0, result.stderr
