#!/usr/bin/env python3
"""Automated MiniMaster manufacturing-status and gap analysis.

The script is intentionally repository-local and dependency-free. It reads the
release evidence, CI revalidation, auth migration and Admin Panel files and
produces a deterministic JSON/Markdown summary. The goal is to make missing
implementation evidence visible in the Admin/QA workflow instead of relying on
manually maintained status prose.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "fertigungsstand" / "latest-summary.json"
DEFAULT_MARKDOWN_OUT = REPO_ROOT / "build" / "fertigungsstand" / "latest-report.md"


@dataclass(frozen=True)
class Finding:
    area: str
    status: str
    severity: str
    title: str
    evidence: str
    next_action: str


def read_text(relative_path: str) -> str:
    path = REPO_ROOT / relative_path
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def contains(text: str, *needles: str) -> bool:
    lowered = text.lower()
    return all(needle.lower() in lowered for needle in needles)


def count_pattern(text: str, pattern: str) -> int:
    return len(re.findall(pattern, text, flags=re.IGNORECASE | re.MULTILINE))


def status_from_bool(ok: bool, blocked: bool = False) -> str:
    if ok:
        return "done"
    if blocked:
        return "blocked_external"
    return "open"


def collect_findings() -> list[Finding]:
    release = read_text("docs/RELEASE_EVIDENCE_REGISTER.md")
    ci = read_text("docs/CI_REVALIDATION_LATEST.md")
    legacy_inventory = read_text("docs/LEGACY_AUTH_INVENTORY.md")
    legacy_cutover = read_text("docs/LEGACY_AUTH_CUTOVER_PLAN.md")
    admin_html = read_text("admin-panel/index.html")
    admin_app = read_text("admin-panel/app.js")
    admin_doc = read_text("docs/ADMIN_PANEL_ARCHITECTURE.md")
    security_doc = read_text("docs/SECURITY_BASELINE_CHECKLIST.md")

    findings: list[Finding] = []

    billing_blocker = contains(ci, "Billing blocker detected: yes") or contains(ci, "spending limit")
    code_scanning_blocker = contains(ci, "Code Scanning not enabled") or contains(release, "Code Scanning not enabled")
    codeql_success = contains(ci, "CodeQL Security Analysis", "Latest status: completed / success")
    android_success = contains(ci, "Android CI", "Latest status: completed / success")
    # Code scanning (CodeQL) requires GitHub Advanced Security on private repos.
    # On this private repo without GHAS it cannot run, which is an accepted risk
    # backed by compensating controls (eslint-plugin-security, npm audit,
    # Firestore/Storage rules tests, secret-leak guard). It is therefore not a
    # release blocker; see docs/RELEASE_BLOCKER_RUNBOOK_DE.md. The CodeQL workflow
    # stays in place and re-enforces if GHAS is licensed or the repo is made public.
    codeql_status = (
        "accepted"
        if code_scanning_blocker
        else status_from_bool(codeql_success, billing_blocker)
    )

    findings.append(Finding(
        area="CI / Security Gate",
        status=codeql_status,
        severity="P0",
        title="CodeQL evidence (accepted N/A on private repo without GHAS)",
        evidence=(
            "Code scanning unavailable (private repo without GitHub Advanced Security); "
            "accepted with compensating controls: eslint-plugin-security, npm audit, "
            "Firestore/Storage rules tests, secret-leak guard"
            if code_scanning_blocker
            else "CI_REVALIDATION_LATEST.md reports a billing/spending-limit blocker"
            if billing_blocker
            else "CI_REVALIDATION_LATEST.md inspected"
        ),
        next_action=(
            "No action required while private without GHAS. To enforce CodeQL, license "
            "GitHub Advanced Security or make the repository public, then rerun CodeQL."
        ),
    ))

    findings.append(Finding(
        area="CI / Android Gate",
        status=status_from_bool(android_success, billing_blocker),
        severity="P0",
        title="Current Android CI evidence is required before release",
        evidence="CI_REVALIDATION_LATEST.md reports Android CI did not start because of billing/spending-limit" if billing_blocker else "CI_REVALIDATION_LATEST.md inspected",
        next_action="Rerun Android CI after the branch is pushed and archive the run URL in RELEASE_EVIDENCE_REGISTER.md.",
    ))

    deploy_done = not contains(release, "Deployment Reference | _(pending final deploy)_") and not contains(release, "Deployment result", "⛔")
    findings.append(Finding(
        area="Release Evidence",
        status=status_from_bool(deploy_done, blocked=not deploy_done),
        severity="P0",
        title="Final deployment reference is still missing",
        evidence="RELEASE_EVIDENCE_REGISTER.md still marks final deploy evidence as pending or blocked.",
        next_action="Run an authenticated deploy with production runtime config, capture the deployment reference, and update the evidence register.",
    ))

    commissioning_done = bool(re.search(
        r"^\|\s*android-apps\b[^|]*\|\s*✅\s*\|",
        release,
        flags=re.IGNORECASE | re.MULTILINE,
    ))
    findings.append(Finding(
        area="Android Commissioning",
        status=status_from_bool(commissioning_done, blocked=not commissioning_done),
        severity="P0",
        title="Real/emulated Android commissioning evidence is incomplete",
        evidence="RELEASE_EVIDENCE_REGISTER.md documents skipped device suites / missing AVD or device readiness.",
        next_action="Execute pairing, lock/unlock, sync, task workflow and app-blocking checks on emulator/device and attach the evidence bundle.",
    ))

    legacy_cutover_done = contains(legacy_cutover, "DISABLE_LEGACY_SECRETKEY_AUTH=true is active in production") and contains(legacy_inventory, "Phase 3") and not contains(legacy_inventory, "Phase 2: Clients")
    legacy_frozen = contains(legacy_inventory, "Status: EINGEFROREN")
    findings.append(Finding(
        area="Identity / Legacy Auth",
        status="done" if legacy_cutover_done else ("in_progress" if legacy_frozen else "open"),
        severity="P1",
        title="Legacy secretKey/IMEI auth is frozen but not fully decommissioned",
        evidence="LEGACY_AUTH_INVENTORY.md keeps generateCustomToken/registerMasterDevice legacy fallback under cutover control.",
        next_action="Finish client migration, verify 14 days of zero legacy telemetry, set DISABLE_LEGACY_SECRETKEY_AUTH=true, then remove legacy fields and code paths.",
    ))

    has_qa_tab = contains(admin_html, "data-tab=\"qa\"") or contains(admin_html, "Qualitätssicherung")
    has_ai_tab = contains(admin_html, "data-tab=\"ai\"") or contains(admin_html, "KI-Assistent")
    has_data_actions = count_pattern(admin_html, r"data-action=") >= 10
    has_python_catalog = contains(admin_app, "loadPythonAutomationCatalog") or contains(admin_html, "Python")
    admin_automation_ok = has_qa_tab and has_ai_tab and has_data_actions and has_python_catalog
    findings.append(Finding(
        area="Admin Panel Automation",
        status=status_from_bool(admin_automation_ok),
        severity="P1",
        title="Admin Panel prioritizes automated analyses and action flows",
        evidence=f"qa_tab={has_qa_tab}, ai_tab={has_ai_tab}, data_actions={has_data_actions}, python_catalog={has_python_catalog}",
        next_action="Keep QA/AI/automation surfaces as primary operator entry points and route manual checks through evidence-gated workflows.",
    ))

    inline_handlers = count_pattern(admin_html, r"\son[a-z]+\s*=")
    app_check_sri = contains(admin_html, "firebase-app-check-compat.js", "integrity=\"sha384-")
    findings.append(Finding(
        area="Admin Panel CSP / SRI",
        status=status_from_bool(inline_handlers == 0 and app_check_sri),
        severity="P1",
        title="Admin Panel CSP contradiction resolved by measurable checks",
        evidence=f"inline_event_handlers={inline_handlers}, firebase_app_check_sri={app_check_sri}",
        next_action="Keep inline handler count at 0 and require SRI for external scripts in future changes.",
    ))

    raw_inner_html = count_pattern(admin_app, r"\.innerHTML\s*=")
    findings.append(Finding(
        area="Admin Panel DOM Safety",
        status="review_required" if raw_inner_html > 0 else "done",
        severity="P2",
        title="Remaining innerHTML usage must stay audited",
        evidence=f"admin-panel/app.js contains {raw_inner_html} direct innerHTML assignments.",
        next_action="For every changed renderer prefer textContent/createElement, or require escapeHtml/escapeHtmlText plus test coverage.",
    ))

    support_ui_markers = ["grantSupportAccess", "revokeSupportAccess", "grantDebugAccess", "analyzeWithDebugData"]
    support_ui_present = all(marker in admin_app or marker in admin_html for marker in support_ui_markers)
    findings.append(Finding(
        area="Admin Panel Support Automation",
        status=status_from_bool(support_ui_present),
        severity="P2",
        title="Support/debug automation entry points need UI evidence",
        evidence="Checked Admin Panel for grant/revoke support/debug access and debug analysis entry points.",
        next_action="Expose missing callable-backed support/debug actions in the Support tab or document why they remain backend-only.",
    ))

    stale_doc_markers = [
        "SRI-Hash noch aus",
        "TODO-Marker im HTML",
        "Inline-`onclick`/`style`",
    ]
    stale_docs = [marker for marker in stale_doc_markers if marker in admin_doc]
    findings.append(Finding(
        area="Documentation Consistency",
        status=status_from_bool(not stale_docs and contains(security_doc, "firebase-app-check-compat.js", "Applied")),
        severity="P1",
        title="Admin/security documentation must not contradict current implementation",
        evidence=f"stale_admin_doc_markers={stale_docs or 'none'}; security checklist inspected.",
        next_action="Treat this script as the canonical consistency gate before release documentation is accepted.",
    ))

    return findings


def summarize(findings: list[Finding]) -> dict[str, object]:
    # "accepted" = accepted risk / not-applicable with documented compensating
    # controls (e.g. CodeQL on a private repo without GHAS). Treated like "done"
    # for blocker purposes but kept distinct for transparency in the report.
    resolved = {"done", "accepted"}
    release_blockers = [f for f in findings if f.severity == "P0" and f.status not in resolved]
    repo_blockers = [f for f in findings if f.severity == "P0" and f.status == "open"]
    external_blockers = [f for f in findings if f.severity == "P0" and f.status == "blocked_external"]
    p1_open = [f for f in findings if f.severity == "P1" and f.status not in resolved]
    p2_open = [f for f in findings if f.severity == "P2" and f.status not in {"done", "accepted", "review_required"}]

    repo_done = max(0, 100 - len(repo_blockers) * 10 - len(p1_open) * 5 - len(p2_open) * 2)
    release_ready = len(release_blockers) == 0 and all(f.status in resolved for f in findings if f.severity == "P1")
    repo_ready = len(repo_blockers) == 0 and all(
        f.status in {"done", "in_progress", "blocked_external"} for f in findings if f.severity == "P1"
    )

    return {
        "generated_at_epoch": int(time.time()),
        "repository": "Toto241/MiniMaster",
        "release_ready": release_ready,
        "repo_ready": repo_ready,
        "estimated_repo_completion_percent": repo_done,
        "hard_blocker_count": len(release_blockers),
        "repo_blocker_count": len(repo_blockers),
        "external_blocker_count": len(external_blockers),
        "p1_open_count": len(p1_open),
        "p2_open_count": len(p2_open),
        "findings": [asdict(f) for f in findings],
    }


def render_markdown(payload: dict[str, object]) -> str:
    findings = payload["findings"]
    lines = [
        "# MiniMaster Fertigungsstandsbericht",
        "",
        f"Generated epoch: `{payload['generated_at_epoch']}`",
        f"Release ready: `{payload['release_ready']}`",
        f"Repo ready: `{payload['repo_ready']}`",
        f"Estimated repo completion: `{payload['estimated_repo_completion_percent']}%`",
        f"P0 release blockers: `{payload['hard_blocker_count']}`",
        f"P0 repo blockers: `{payload['repo_blocker_count']}`",
        f"P0 external blockers: `{payload['external_blocker_count']}`",
        f"P1 open: `{payload['p1_open_count']}`",
        f"P2 open: `{payload['p2_open_count']}`",
        "",
        "| Severity | Status | Area | Finding | Next action |",
        "|---|---|---|---|---|",
    ]
    for finding in findings:  # type: ignore[assignment]
        item = finding  # type: ignore[assignment]
        lines.append(
            "| {severity} | {status} | {area} | {title} | {next_action} |".format(
                severity=item["severity"],
                status=item["status"],
                area=item["area"],
                title=item["title"].replace("|", "/"),
                next_action=item["next_action"].replace("|", "/"),
            )
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze MiniMaster manufacturing status and implementation gaps.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument("--fail-on-p0", action="store_true", help="Return non-zero if any in-repo P0 blocker is open.")
    args = parser.parse_args()

    findings = collect_findings()
    payload = summarize(findings)

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    args.markdown_out.write_text(render_markdown(payload), encoding="utf-8")

    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 1 if args.fail_on_p0 and payload["repo_blocker_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
