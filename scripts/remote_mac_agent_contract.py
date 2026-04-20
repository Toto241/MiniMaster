#!/usr/bin/env python3
from __future__ import annotations

from typing import Any


TERMINAL_REMOTE_MAC_STATUSES = {"passed", "failed", "error", "cancelled", "skipped"}
ALLOWED_REMOTE_MAC_STATUSES = TERMINAL_REMOTE_MAC_STATUSES | {"queued", "running"}


def _normalize_text(value: object, *, field_name: str, max_length: int = 200, required: bool = False) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise ValueError(f"{field_name} fehlt.")
    if len(text) > max_length:
        raise ValueError(f"{field_name} ist zu lang.")
    return text


def _normalize_int(value: object, *, field_name: str, required: bool = False) -> int | None:
    if value in (None, ""):
        if required:
            raise ValueError(f"{field_name} fehlt.")
        return None
    try:
        return int(str(value))
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} muss eine Ganzzahl sein.") from exc


def build_remote_mac_agent_run_entry(payload: dict[str, object]) -> dict[str, object]:
    suite_id = _normalize_text(payload.get("suiteId"), field_name="suiteId", max_length=120, required=True)
    request_id = _normalize_text(payload.get("requestId"), field_name="requestId", max_length=120, required=True)
    agent_id = _normalize_text(payload.get("agentId"), field_name="agentId", max_length=120, required=True)
    host = _normalize_text(payload.get("host"), field_name="host", max_length=200, required=True)
    status = _normalize_text(payload.get("status"), field_name="status", max_length=40, required=True)
    if status not in ALLOWED_REMOTE_MAC_STATUSES:
        raise ValueError("status ist ungueltig.")

    started_at = _normalize_text(payload.get("startedAt"), field_name="startedAt", max_length=80, required=True)
    finished_at = _normalize_text(
        payload.get("finishedAt"),
        field_name="finishedAt",
        max_length=80,
        required=status in TERMINAL_REMOTE_MAC_STATUSES,
    )
    exit_code = _normalize_int(payload.get("exitCode"), field_name="exitCode", required=status in TERMINAL_REMOTE_MAC_STATUSES)
    xcode_version = _normalize_text(payload.get("xcodeVersion"), field_name="xcodeVersion", max_length=80, required=True)
    logs_ref = _normalize_text(payload.get("logsRef"), field_name="logsRef", max_length=500, required=True)

    destination_payload = payload.get("destination") or {}
    if not isinstance(destination_payload, dict):
        raise ValueError("destination muss ein Objekt sein.")
    destination = {
        "platform": _normalize_text(destination_payload.get("platform"), field_name="destination.platform", max_length=80, required=True),
        "name": _normalize_text(destination_payload.get("name"), field_name="destination.name", max_length=200, required=True),
        "udid": _normalize_text(destination_payload.get("udid"), field_name="destination.udid", max_length=120, required=True),
    }

    artifacts_payload = payload.get("artifacts") or []
    if not isinstance(artifacts_payload, list):
        raise ValueError("artifacts muss eine Liste sein.")
    artifacts: list[dict[str, object]] = []
    for index, artifact_payload in enumerate(artifacts_payload, start=1):
        if not isinstance(artifact_payload, dict):
            raise ValueError(f"artifacts[{index}] muss ein Objekt sein.")
        artifacts.append(
            {
                "kind": _normalize_text(artifact_payload.get("kind"), field_name=f"artifacts[{index}].kind", max_length=80, required=True),
                "path": _normalize_text(artifact_payload.get("path"), field_name=f"artifacts[{index}].path", max_length=500, required=True),
                "label": _normalize_text(artifact_payload.get("label"), field_name=f"artifacts[{index}].label", max_length=160),
            }
        )

    return {
        "entryId": f"remote-mac-{request_id}",
        "suiteId": suite_id,
        "requestId": request_id,
        "agentId": agent_id,
        "host": host,
        "status": status,
        "startedAt": started_at,
        "finishedAt": finished_at,
        "exitCode": exit_code,
        "xcodeVersion": xcode_version,
        "logsRef": logs_ref,
        "destination": destination,
        "artifacts": artifacts,
        "notes": _normalize_text(payload.get("notes"), field_name="notes", max_length=4000),
        "evidenceTargetId": _normalize_text(payload.get("evidenceTargetId"), field_name="evidenceTargetId", max_length=120),
    }
