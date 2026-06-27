#!/usr/bin/env python3
"""Collect the current MiniMaster release readiness signals in one report.

The release doctor is intentionally read-only for product state. It runs the
existing local gates, checks GitHub security surfaces when the gh CLI is
available, and writes a compact JSON/Markdown packet for Setup.bat and the
Admin Panel.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "release-doctor" / "latest.json"
DEFAULT_MARKDOWN_OUT = REPO_ROOT / "build" / "release-doctor" / "latest.md"
DEFAULT_REPO = "Toto241/MiniMaster"


@dataclass(frozen=True)
class CommandResult:
    ok: bool
    returncode: int | None
    stdout: str
    stderr: str
    timed_out: bool = False


def _run(args: list[str], *, timeout: int = 60) -> CommandResult:
    try:
        resolved = shutil.which(args[0])
        cmd = [resolved or args[0], *args[1:]]
        completed = subprocess.run(
            cmd,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
        return CommandResult(
            ok=completed.returncode == 0,
            returncode=completed.returncode,
            stdout=completed.stdout.strip(),
            stderr=completed.stderr.strip(),
        )
    except FileNotFoundError as exc:
        return CommandResult(False, 127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        return CommandResult(
            ok=False,
            returncode=None,
            stdout=(exc.stdout or "").strip() if isinstance(exc.stdout, str) else "",
            stderr=(exc.stderr or "").strip() if isinstance(exc.stderr, str) else f"Timeout after {timeout}s",
            timed_out=True,
        )


def _parse_json_output(result: CommandResult) -> dict[str, Any] | list[Any] | None:
    text = result.stdout.strip()
    if not text:
        return None
    start_candidates = [idx for idx in (text.find("{"), text.find("[")) if idx >= 0]
    if start_candidates:
        text = text[min(start_candidates):]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _section(
    section_id: str,
    title: str,
    status: str,
    summary: str,
    *,
    metrics: dict[str, object] | None = None,
    blockers: list[dict[str, object]] | None = None,
    evidence: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "id": section_id,
        "title": title,
        "status": status,
        "summary": summary,
        "metrics": metrics or {},
        "blockers": blockers or [],
        "evidence": evidence or {},
    }


def collect_git_state() -> dict[str, object]:
    head = _run(["git", "rev-parse", "HEAD"], timeout=10)
    short = _run(["git", "rev-parse", "--short", "HEAD"], timeout=10)
    status = _run(["git", "status", "--short", "--branch"], timeout=10)
    return {
        "head": head.stdout if head.ok else "",
        "shortHead": short.stdout if short.ok else "",
        "status": status.stdout,
        "dirty": bool(status.stdout and any(line and not line.startswith("## ") for line in status.stdout.splitlines())),
    }


def collect_preflight() -> dict[str, object]:
    result = _run([sys.executable, "scripts/preflight.py", "--json"], timeout=90)
    payload = _parse_json_output(result) if result.stdout else None
    if not isinstance(payload, dict):
        return _section(
            "preflight",
            "Setup Preflight",
            "fail",
            "Preflight konnte nicht als JSON ausgewertet werden.",
            evidence={"returncode": result.returncode, "stderr": result.stderr[-2000:]},
        )
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    results = payload.get("results") if isinstance(payload.get("results"), list) else []
    required_fail = int(summary.get("requiredFail") or 0)
    warn = int(summary.get("warn") or 0)
    status = "fail" if required_fail else ("warn" if warn else "pass")
    blockers = [
        {
            "id": item.get("check_id"),
            "title": item.get("title"),
            "status": item.get("status"),
            "details": item.get("details"),
            "fixHint": item.get("fix_hint"),
        }
        for item in results
        if item.get("status") == "fail" or (item.get("required") and item.get("status") != "ok")
    ]
    return _section(
        "preflight",
        "Setup Preflight",
        status,
        f"{summary.get('ok', 0)}/{summary.get('total', 0)} Checks ok, {required_fail} Pflichtfehler.",
        metrics=summary,
        blockers=blockers,
        evidence={"returncode": result.returncode},
    )


def collect_playstore_protocol() -> dict[str, object]:
    result = _run([sys.executable, "scripts/playstore_compliance_protocol.py"], timeout=90)
    payload = _parse_json_output(result)
    summary = payload if isinstance(payload, dict) else {}
    ready = bool(summary.get("ready"))
    open_count = int(summary.get("open") or 0)
    return _section(
        "playstore-protocol",
        "Play Store Protocol",
        "pass" if result.ok and ready else "fail",
        f"{summary.get('passed', 0)}/{summary.get('total', 0)} Repo-Kriterien bestanden.",
        metrics=summary,
        blockers=[] if open_count == 0 else [{"id": "playstore-open", "title": "PlayStore-Kriterien offen", "count": open_count}],
        evidence={"returncode": result.returncode},
    )


def collect_fertigungsstand() -> dict[str, object]:
    result = _run([sys.executable, "scripts/analyze_fertigungsstand.py"], timeout=90)
    payload = _parse_json_output(result)
    if not isinstance(payload, dict):
        return _section("fertigungsstand", "Fertigungsstand", "fail", "Analyse konnte nicht ausgewertet werden.")
    hard = int(payload.get("hard_blocker_count") or 0)
    p1 = int(payload.get("p1_open_count") or 0)
    findings = payload.get("findings") if isinstance(payload.get("findings"), list) else []
    blockers = [
        {
            "area": item.get("area"),
            "severity": item.get("severity"),
            "status": item.get("status"),
            "title": item.get("title"),
            "nextAction": item.get("next_action"),
        }
        for item in findings
        if item.get("status") != "done" and item.get("severity") in {"P0", "P1"}
    ]
    status = "pass" if payload.get("release_ready") else ("fail" if hard else "warn")
    return _section(
        "fertigungsstand",
        "Fertigungsstand",
        status,
        f"Release ready: {bool(payload.get('release_ready'))}; P0 offen: {hard}; P1 offen: {p1}.",
        metrics={
            "releaseReady": bool(payload.get("release_ready")),
            "hardBlockerCount": hard,
            "p1OpenCount": p1,
            "p2OpenCount": int(payload.get("p2_open_count") or 0),
            "estimatedRepoCompletionPercent": int(payload.get("estimated_repo_completion_percent") or 0),
        },
        blockers=blockers,
        evidence={"returncode": result.returncode},
    )


def collect_admin_qa() -> dict[str, object]:
    result = _run([sys.executable, "scripts/admin_panel_qa_audit.py"], timeout=90)
    payload = _parse_json_output(result)
    if not isinstance(payload, dict):
        return _section("admin-qa", "Admin Panel QA", "fail", "Admin-QA-Audit konnte nicht ausgewertet werden.")
    p1_open = int(payload.get("p1_open_count") or 0)
    findings = payload.get("findings") if isinstance(payload.get("findings"), list) else []
    blockers = [
        {
            "area": item.get("area"),
            "severity": item.get("severity"),
            "status": item.get("status"),
            "title": item.get("title"),
            "recommendation": item.get("recommendation"),
        }
        for item in findings
        if item.get("severity") == "P1" and item.get("status") == "open"
    ]
    return _section(
        "admin-qa",
        "Admin Panel QA",
        "pass" if p1_open == 0 else "fail",
        f"P1 offen: {p1_open}; Datenaktionen: {len(payload.get('data_actions') or [])}.",
        metrics={"p1OpenCount": p1_open, "orphanedActions": payload.get("orphaned_actions") or []},
        blockers=blockers,
        evidence={"returncode": result.returncode},
    )


def _gh_available() -> bool:
    return shutil.which("gh") is not None


def collect_dependabot(repo: str) -> dict[str, object]:
    if not _gh_available():
        return _section("dependabot", "Dependabot", "unknown", "gh CLI nicht verfuegbar.")
    result = _run(["gh", "api", f"repos/{repo}/dependabot/alerts?state=open&per_page=100"], timeout=45)
    payload = _parse_json_output(result)
    if not result.ok or not isinstance(payload, list):
        return _section(
            "dependabot",
            "Dependabot",
            "warn",
            "Dependabot-Alerts konnten nicht abgefragt werden.",
            evidence={"returncode": result.returncode, "stderr": result.stderr[-2000:]},
        )
    by_severity: dict[str, int] = {}
    for alert in payload:
        severity = str(((alert or {}).get("security_advisory") or {}).get("severity") or "unknown")
        by_severity[severity] = by_severity.get(severity, 0) + 1
    return _section(
        "dependabot",
        "Dependabot",
        "pass" if len(payload) == 0 else "fail",
        f"Offene Alerts: {len(payload)}.",
        metrics={"openTotal": len(payload), "bySeverity": by_severity},
        blockers=[
            {
                "package": ((alert or {}).get("dependency") or {}).get("package", {}).get("name"),
                "manifest": ((alert or {}).get("dependency") or {}).get("manifest_path"),
                "severity": ((alert or {}).get("security_advisory") or {}).get("severity"),
            }
            for alert in payload[:20]
        ],
        evidence={"returncode": result.returncode},
    )


def collect_code_scanning(repo: str) -> dict[str, object]:
    if not _gh_available():
        return _section("code-scanning", "GitHub Code Scanning", "unknown", "gh CLI nicht verfuegbar.")
    result = _run(["gh", "api", f"repos/{repo}/code-scanning/alerts?per_page=100"], timeout=45)
    payload = _parse_json_output(result)
    if result.ok and isinstance(payload, list):
        return _section(
            "code-scanning",
            "GitHub Code Scanning",
            "pass" if len(payload) == 0 else "fail",
            f"Code-Scanning-Alerts: {len(payload)}.",
            metrics={"openTotal": len(payload)},
            blockers=payload[:20],
        )
    blocked = "Code scanning is not enabled" in f"{result.stdout}\n{result.stderr}"
    # Code scanning (CodeQL) requires GitHub Advanced Security on private repos.
    # When unavailable it is an accepted risk with documented compensating controls
    # (eslint-plugin-security, npm audit, Firestore/Storage rules tests, secret-leak
    # guard) and is therefore NOT a release blocker. See RELEASE_BLOCKER_RUNBOOK_DE.md.
    if blocked:
        return _section(
            "code-scanning",
            "GitHub Code Scanning",
            "warn",
            "Code Scanning nicht verfuegbar (privates Repo ohne GitHub Advanced Security) - "
            "akzeptiert mit kompensierenden Kontrollen (eslint-plugin-security, npm audit, "
            "Firestore-/Storage-Rules-Tests, secret-leak-guard).",
            blockers=[],
            evidence={"returncode": result.returncode, "accepted": True},
        )
    return _section(
        "code-scanning",
        "GitHub Code Scanning",
        "warn",
        "Code-Scanning-Status konnte nicht abgefragt werden.",
        blockers=[{
            "id": "code-scanning-api",
            "title": "Code-Scanning-API pruefen",
            "nextAction": "Repository Settings -> Code security pruefen und Status erneut abfragen.",
        }],
        evidence={"returncode": result.returncode, "stderr": result.stderr[-2000:]},
    )


def collect_github_runs(repo: str) -> dict[str, object]:
    if not _gh_available():
        return _section("github-runs", "GitHub Runs", "unknown", "gh CLI nicht verfuegbar.")
    result = _run([
        "gh",
        "run",
        "list",
        "--repo",
        repo,
        "--branch",
        "main",
        "--limit",
        "12",
        "--json",
        "databaseId,name,status,conclusion,url,headSha,createdAt",
    ], timeout=45)
    payload = _parse_json_output(result)
    if not result.ok or not isinstance(payload, list):
        return _section("github-runs", "GitHub Runs", "warn", "GitHub-Runs konnten nicht abgefragt werden.")
    latest_by_name: dict[str, dict[str, object]] = {}
    for run in payload:
        name = str(run.get("name") or "")
        if name and name not in latest_by_name:
            latest_by_name[name] = run
    failed = [run for run in latest_by_name.values() if run.get("status") == "completed" and run.get("conclusion") == "failure"]
    active = [run for run in latest_by_name.values() if run.get("status") != "completed"]
    status = "fail" if failed else ("warn" if active else "pass")
    return _section(
        "github-runs",
        "GitHub Runs",
        status,
        f"Latest Workflows: {len(latest_by_name)}, fehlgeschlagen: {len(failed)}, aktiv: {len(active)}.",
        metrics={"latestWorkflowCount": len(latest_by_name), "failed": len(failed), "active": len(active)},
        blockers=[
            {
                "name": run.get("name"),
                "status": run.get("status"),
                "conclusion": run.get("conclusion"),
                "url": run.get("url"),
            }
            for run in failed + active
        ],
        evidence={"runs": list(latest_by_name.values())},
    )


def summarize_sections(sections: list[dict[str, object]]) -> dict[str, object]:
    blocking_statuses = {"fail", "blocked_external"}
    hard_blockers = [section for section in sections if section.get("status") in blocking_statuses]
    warnings = [section for section in sections if section.get("status") in {"warn", "unknown"}]
    return {
        "releaseReady": len(hard_blockers) == 0,
        "hardBlockerCount": len(hard_blockers),
        "warningCount": len(warnings),
        "passedCount": sum(1 for section in sections if section.get("status") == "pass"),
        "totalCount": len(sections),
    }


def build_release_doctor(*, repo: str = DEFAULT_REPO) -> dict[str, object]:
    sections = [
        collect_preflight(),
        collect_playstore_protocol(),
        collect_fertigungsstand(),
        collect_admin_qa(),
        collect_dependabot(repo),
        collect_code_scanning(repo),
        collect_github_runs(repo),
    ]
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "type": "minimaster-release-doctor",
        "repository": repo,
        "git": collect_git_state(),
        "summary": summarize_sections(sections),
        "sections": sections,
    }


def render_markdown(payload: dict[str, object]) -> str:
    summary = payload.get("summary", {})
    lines = [
        "# MiniMaster Release Doctor",
        "",
        f"Generated at: `{payload.get('generatedAt')}`",
        f"Repository: `{payload.get('repository')}`",
        f"Head: `{(payload.get('git') or {}).get('shortHead', '')}`",
        f"Release ready: `{summary.get('releaseReady')}`",
        f"Hard blockers: `{summary.get('hardBlockerCount')}`",
        f"Warnings: `{summary.get('warningCount')}`",
        "",
        "| Status | Section | Summary |",
        "| --- | --- | --- |",
    ]
    for section in payload.get("sections", []):
        lines.append(f"| {section.get('status')} | {section.get('title')} | {str(section.get('summary', '')).replace('|', '/')} |")
    lines.append("")
    lines.append("## Blockers")
    lines.append("")
    for section in payload.get("sections", []):
        blockers = section.get("blockers") or []
        if not blockers:
            continue
        lines.append(f"### {section.get('title')}")
        for blocker in blockers:
            title = blocker.get("title") or blocker.get("id") or blocker.get("name") or blocker.get("package") or "Blocker"
            detail = blocker.get("nextAction") or blocker.get("recommendation") or blocker.get("details") or blocker.get("url") or ""
            lines.append(f"- {title}: {detail}")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def write_outputs(payload: dict[str, object], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(payload), encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect MiniMaster release readiness signals.")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument("--fail-on-blocker", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(list(argv or sys.argv[1:]))
    payload = build_release_doctor(repo=args.repo)
    write_outputs(payload, args.json_out, args.markdown_out)
    print(json.dumps(payload["summary"], ensure_ascii=False))
    if args.fail_on_blocker and not payload["summary"]["releaseReady"]:  # type: ignore[index]
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
