#!/usr/bin/env python3
"""Audit the existing Admin Panel QA surface without replacing the UI.

This script checks the current admin-panel implementation for:
- stale or unsupported QA actions,
- orphaned data-action values,
- handler functions without visible UI wiring,
- QA/test automation suites that are not surfaced in documentation/evidence,
- manual test candidates that should be moved toward automated suites,
- external release gates that must not be shown as automatically passing.

It is intentionally dependency-free and safe to run locally, in CI, and from the
Admin Panel's QA automation catalog.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "admin-panel-qa-audit" / "latest-summary.json"
DEFAULT_MARKDOWN_OUT = REPO_ROOT / "build" / "admin-panel-qa-audit" / "latest-report.md"

ADMIN_HTML = REPO_ROOT / "admin-panel" / "index.html"
ADMIN_APP = REPO_ROOT / "admin-panel" / "app.js"
TEST_AUTOMATION = REPO_ROOT / "scripts" / "test_automation.py"
QA_CATALOG = REPO_ROOT / "scripts" / "qa_catalog.py"
RELEASE_EVIDENCE = REPO_ROOT / "docs" / "RELEASE_EVIDENCE_REGISTER.md"

REQUIRED_QA_CATEGORIES = (
    "backend",
    "android",
    "device",
    "python",
    "release",
)

MANUAL_TO_AUTOMATION_CANDIDATES = (
    {
        "manual_check": "Eltern-App startet und zeigt Hauptoberfläche",
        "target_suite": "android-connected-master",
        "automation_level": "single_emulator",
        "required_environment": "ADB + Emulator oder Testgerät",
    },
    {
        "manual_check": "Kind-App startet und zeigt Pairing-Flow",
        "target_suite": "android-connected-child",
        "automation_level": "single_emulator",
        "required_environment": "ADB + Emulator oder Testgerät",
    },
    {
        "manual_check": "Eltern-/Kind-Kopplung über zwei Geräte",
        "target_suite": "python-tests-dual-device-runner",
        "automation_level": "dual_emulator",
        "required_environment": "zwei ADB-Targets oder Dual-AVD-Konfiguration",
    },
    {
        "manual_check": "Sperre aktivieren/deaktivieren und Kindgerät synchronisieren",
        "target_suite": "android-e2e-shell",
        "automation_level": "dual_emulator_or_device",
        "required_environment": "ADB + Firebase-Testkonfiguration",
    },
    {
        "manual_check": "App-Blacklist/Usage Rules wirken auf Kindgerät",
        "target_suite": "android-e2e-shell-script",
        "automation_level": "dual_emulator_or_device",
        "required_environment": "ADB + Debug-Secrets + Test-Apps",
    },
    {
        "manual_check": "Offline/Wiederanlauf nach Force-Stop/Reboot",
        "target_suite": "android-usb-child",
        "automation_level": "device_or_emulator_with_shell_control",
        "required_environment": "ADB shell + Netzwerkumschaltung",
    },
)

EXTERNAL_GATES = (
    "GitHub Actions Billing/Spending-Limit",
    "CodeQL green run evidence",
    "Android CI green run evidence",
    "Firebase key rotation",
    "Play Console Data Safety / IARC / Permissions / App Access",
    "physical commissioning sign-off",
    "on-call roster and reachability",
    "final production deploy evidence",
)


@dataclass(frozen=True)
class Finding:
    severity: str
    status: str
    area: str
    title: str
    evidence: str
    recommendation: str


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def unique_sorted(values: Iterable[str]) -> list[str]:
    return sorted({value for value in values if value})


def extract_data_actions(html: str) -> list[str]:
    return unique_sorted(re.findall(r"data-action=[\"']([^\"']+)[\"']", html))


def extract_data_tabs(html: str) -> list[str]:
    return unique_sorted(re.findall(r"data-tab=[\"']([^\"']+)[\"']", html))


def extract_function_names(js: str) -> list[str]:
    patterns = [
        r"function\s+([A-Za-z_$][\w$]*)\s*\(",
        r"(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(",
        r"window\.([A-Za-z_$][\w$]*)\s*=",
    ]
    names: list[str] = []
    for pattern in patterns:
        names.extend(re.findall(pattern, js))
    return unique_sorted(names)


def extract_suites(test_automation: str) -> list[dict[str, str]]:
    pattern = re.compile(
        r"Suite\(\s*[\"'](?P<id>[^\"']+)[\"']\s*,\s*"
        r"[\"'](?P<title>[^\"']+)[\"']\s*,\s*"
        r"[\"'](?P<group>[^\"']+)[\"']",
        re.MULTILINE,
    )
    return [match.groupdict() for match in pattern.finditer(test_automation)]


def suite_ids_by_group(suites: list[dict[str, str]]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for suite in suites:
        grouped.setdefault(suite["group"], []).append(suite["id"])
    return {group: sorted(ids) for group, ids in grouped.items()}


def mentioned(text: str, value: str) -> bool:
    return value in text


def find_orphaned_actions(actions: list[str], js_functions: list[str], js_text: str) -> list[str]:
    orphaned: list[str] = []
    for action in actions:
        if action in js_functions or re.search(rf"[\"']{re.escape(action)}[\"']", js_text):
            continue
        orphaned.append(action)
    return sorted(orphaned)


def evaluate() -> dict[str, object]:
    html = read_text(ADMIN_HTML)
    app_js = read_text(ADMIN_APP)
    test_auto = read_text(TEST_AUTOMATION)
    qa_catalog = read_text(QA_CATALOG)
    release_evidence = read_text(RELEASE_EVIDENCE)

    actions = extract_data_actions(html)
    tabs = extract_data_tabs(html)
    functions = extract_function_names(app_js)
    orphaned_actions = find_orphaned_actions(actions, functions, app_js)
    suites = extract_suites(test_auto)
    grouped_suites = suite_ids_by_group(suites)

    findings: list[Finding] = []

    qa_visible = "qa" in tabs or "Qualitätssicherung" in html
    findings.append(Finding(
        severity="P1",
        status="done" if qa_visible else "open",
        area="Admin Panel / QA Navigation",
        title="QA tab must be a first-class operator surface",
        evidence=f"qa_visible={qa_visible}; tabs={tabs}",
        recommendation="Keep the existing QA tab visible and do not replace it with a parallel UI.",
    ))

    missing_categories = [category for category in REQUIRED_QA_CATEGORIES if category not in grouped_suites]
    findings.append(Finding(
        severity="P1",
        status="done" if not missing_categories else "open",
        area="Test Automation Catalog",
        title="All required QA suite groups must exist in scripts/test_automation.py",
        evidence=f"groups={sorted(grouped_suites)}; missing={missing_categories}",
        recommendation="Add missing suite groups or explicitly mark them external/manual in the QA catalog.",
    ))

    device_suites = grouped_suites.get("device", [])
    emulator_candidates = [suite for suite in device_suites if "connected" in suite or "e2e" in suite or "usb" in suite]
    findings.append(Finding(
        severity="P1",
        status="done" if emulator_candidates else "open",
        area="Emulator / Device Automation",
        title="Device and emulator-capable suites must be visible for QA migration",
        evidence=f"device_suites={device_suites}; emulator_candidates={emulator_candidates}",
        recommendation="Expose these suites in the QA tab as Emulator/Device-required rather than pure manual checks.",
    ))

    findings.append(Finding(
        severity="P1" if orphaned_actions else "P2",
        status="open" if orphaned_actions else "done",
        area="Admin Panel / Dead Actions",
        title="No dead data-action buttons should remain in the existing Admin Panel",
        evidence=f"orphaned_actions={orphaned_actions[:50]}; total_actions={len(actions)}",
        recommendation="Remove stale buttons or wire them to existing handlers; do not add placeholder API routes.",
    ))

    qa_text_blob = "\n".join([html, app_js, qa_catalog, release_evidence])
    unmapped_suites = [suite["id"] for suite in suites if not mentioned(qa_text_blob, suite["id"])]
    findings.append(Finding(
        severity="P2",
        status="review_required" if unmapped_suites else "done",
        area="QA Visibility",
        title="Suites not mentioned in Admin/QA/catalog/evidence need review",
        evidence=f"unmapped_suite_count={len(unmapped_suites)}; examples={unmapped_suites[:20]}",
        recommendation="Surface missing suites in QA catalog or document why they are internal-only.",
    ))

    candidate_results = []
    suite_ids = {suite["id"] for suite in suites}
    for candidate in MANUAL_TO_AUTOMATION_CANDIDATES:
        candidate_results.append({
            **candidate,
            "suite_exists": candidate["target_suite"] in suite_ids,
            "visible_in_qa_text": candidate["target_suite"] in qa_text_blob,
        })
    not_visible = [item for item in candidate_results if item["suite_exists"] and not item["visible_in_qa_text"]]
    missing_suite_candidates = [item for item in candidate_results if not item["suite_exists"]]
    findings.append(Finding(
        severity="P1",
        status="review_required" if not_visible or missing_suite_candidates else "done",
        area="Manual-to-Automated Test Migration",
        title="Manual QA checks must be mapped to concrete automation suites",
        evidence=f"not_visible={len(not_visible)}; missing_target_suites={len(missing_suite_candidates)}",
        recommendation="Show mapped suites in QA and keep non-automatable checks under external/manual gates with owner/evidence.",
    ))

    external_gate_visibility = [gate for gate in EXTERNAL_GATES if gate.lower() in release_evidence.lower() or gate.lower() in html.lower()]
    findings.append(Finding(
        severity="P1",
        status="done" if len(external_gate_visibility) >= 4 else "open",
        area="Release Gates",
        title="External release gates must be separated from automated tests",
        evidence=f"visible_external_gates={external_gate_visibility}",
        recommendation="Do not mark Billing, Play Console, Firebase Console or physical sign-off as automatically passed.",
    ))

    qa_catalog_has_automation_status = "automation" in qa_catalog.lower() and "manual" in qa_catalog.lower()
    findings.append(Finding(
        severity="P1",
        status="done" if qa_catalog_has_automation_status else "open",
        area="QA Catalog Metadata",
        title="QA catalog needs automation/manual/external classification",
        evidence=f"qa_catalog_has_automation_status={qa_catalog_has_automation_status}",
        recommendation="Extend catalog entries with automationType, environmentRequirement, evidenceTarget and migrationPriority.",
    ))

    hard_open = [finding for finding in findings if finding.severity == "P1" and finding.status == "open"]
    payload = {
        "generated_at_epoch": int(time.time()),
        "admin_panel_files": {
            "html_exists": ADMIN_HTML.exists(),
            "app_js_exists": ADMIN_APP.exists(),
            "qa_catalog_exists": QA_CATALOG.exists(),
            "test_automation_exists": TEST_AUTOMATION.exists(),
        },
        "tabs": tabs,
        "data_actions": actions,
        "orphaned_actions": orphaned_actions,
        "suite_groups": grouped_suites,
        "manual_to_automation_candidates": candidate_results,
        "external_gates": list(EXTERNAL_GATES),
        "p1_open_count": len(hard_open),
        "findings": [asdict(finding) for finding in findings],
    }
    return payload


def render_markdown(payload: dict[str, object]) -> str:
    lines = [
        "# Admin-Panel QA Audit",
        "",
        f"Generated epoch: `{payload['generated_at_epoch']}`",
        f"P1 open findings: `{payload['p1_open_count']}`",
        "",
        "## Findings",
        "",
        "| Severity | Status | Area | Title | Recommendation |",
        "|---|---|---|---|---|",
    ]
    for finding in payload["findings"]:  # type: ignore[index]
        item = finding  # type: ignore[assignment]
        lines.append(
            "| {severity} | {status} | {area} | {title} | {recommendation} |".format(
                severity=item["severity"],
                status=item["status"],
                area=item["area"].replace("|", "/"),
                title=item["title"].replace("|", "/"),
                recommendation=item["recommendation"].replace("|", "/"),
            )
        )

    lines.extend([
        "",
        "## Manual checks to migrate toward automation",
        "",
        "| Manual check | Target suite | Automation level | Environment | Suite exists | Visible |",
        "|---|---|---|---|---|---|",
    ])
    for item in payload["manual_to_automation_candidates"]:  # type: ignore[index]
        candidate = item  # type: ignore[assignment]
        lines.append(
            "| {manual_check} | `{target_suite}` | {automation_level} | {required_environment} | {suite_exists} | {visible_in_qa_text} |".format(**candidate)
        )
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit the existing MiniMaster Admin Panel QA surface.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument("--fail-on-p1-open", action="store_true")
    args = parser.parse_args()

    payload = evaluate()
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    args.markdown_out.write_text(render_markdown(payload), encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 1 if args.fail_on_p1_open and payload["p1_open_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
