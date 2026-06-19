from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT = REPO_ROOT / "scripts" / "ios_readiness.py"


def test_ios_readiness_outputs_json_and_markdown(tmp_path: Path) -> None:
    json_out = tmp_path / "ios-readiness.json"
    md_out = tmp_path / "ios-readiness.md"

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
    assert payload["type"] == "ios-android-parity-readiness"
    assert payload["summary"]["repoGateReady"] is True
    assert payload["summary"]["releaseReady"] is False
    assert {item["id"] for item in payload["criteria"]} >= {
        "ios-parent-native-ui",
        "ios-child-native-ui",
        "ios-child-enforcement",
        "ios-child-sync-offline-heartbeat",
        "ios-docs-current",
        "ios-xcode26-testflight-build",
    }
    assert any(item["scope"] == "external" for item in payload["criteria"])

    markdown = md_out.read_text(encoding="utf-8")
    assert "iOS Android-Paritaets-Readiness" in markdown
    assert "Repo gate" in markdown


def test_ios_readiness_gate_passes_for_repo_side_checks(tmp_path: Path) -> None:
    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--json-out",
            str(tmp_path / "ios-readiness.json"),
            "--markdown-out",
            str(tmp_path / "ios-readiness.md"),
            "--fail-on-repo-open",
        ],
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    assert result.returncode == 0, result.stderr
