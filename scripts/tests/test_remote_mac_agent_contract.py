from __future__ import annotations

import sys
from pathlib import Path

import pytest


SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import remote_mac_agent_contract


class TestRemoteMacAgentContract:
    def test_build_remote_mac_agent_run_entry_normalizes_payload(self):
        entry = remote_mac_agent_contract.build_remote_mac_agent_run_entry(
            {
                "suiteId": "ios-xctest-parent",
                "requestId": "req-1",
                "agentId": "mac-agent-1",
                "host": "macmini-01.local",
                "status": "passed",
                "startedAt": "2026-04-20T10:00:00Z",
                "finishedAt": "2026-04-20T10:12:00Z",
                "exitCode": 0,
                "xcodeVersion": "16.3",
                "logsRef": "s3://logs/run-1.log",
                "destination": {"platform": "iOS Simulator", "name": "iPhone 15", "udid": "SIM-123"},
                "artifacts": [{"kind": "xctest-result", "path": "s3://artifacts/result.xcresult", "label": "xcresult"}],
            }
        )

        assert entry["entryId"] == "remote-mac-req-1"
        assert entry["destination"]["name"] == "iPhone 15"
        assert entry["artifacts"][0]["kind"] == "xctest-result"

    def test_build_remote_mac_agent_run_entry_requires_finished_at_for_terminal_status(self):
        with pytest.raises(ValueError, match="finishedAt fehlt"):
            remote_mac_agent_contract.build_remote_mac_agent_run_entry(
                {
                    "suiteId": "ios-xctest-parent",
                    "requestId": "req-1",
                    "agentId": "mac-agent-1",
                    "host": "macmini-01.local",
                    "status": "failed",
                    "startedAt": "2026-04-20T10:00:00Z",
                    "exitCode": 65,
                    "xcodeVersion": "16.3",
                    "logsRef": "s3://logs/run-1.log",
                    "destination": {"platform": "iOS Simulator", "name": "iPhone 15", "udid": "SIM-123"},
                }
            )
