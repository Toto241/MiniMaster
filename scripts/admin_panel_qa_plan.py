#!/usr/bin/env python3
"""Create a prioritized implementation plan for the Admin-Panel QA tab.

The existing Admin-Panel already exposes a QA surface and several automation
scripts. This planner turns those signals into an operator-ready backlog:

- keep P0/P1 release blockers separated from normal test automation,
- map manual QA checks to already-existing automated suites where possible,
- surface Android 10-16 / dual-device requirements,
- keep external gates explicit instead of pretending they can be auto-passed,
- write JSON + Markdown evidence that can be linked from the QA tab or release
  evidence register.

The script is dependency-free and safe for local use, CI, and the Python
operator runtime.
"""
from __future__ import annotations

import argparse
import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable

import admin_panel_qa_audit
import qa_catalog

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "admin-panel-qa-plan" / "latest-plan.json"
DEFAULT_MARKDOWN_OUT = REPO_ROOT / "build" / "admin-panel-qa-plan" / "latest-plan.md"

P0_EXTERNAL_BLOCKERS = (
    {
        "id": "github-actions-billing",
        "title": "GitHub Actions Billing/Spending-Limit beheben",
        "area": "CI / Release Gate",
        "automationType": "manual-external",
        "priority": "P0",
        "risk": "critical",
        "owner": "Repository Owner",
        "evidenceTarget": "docs/CI_REVALIDATION_LATEST.md",
        "recommendedCommand": "npm run ci:revalidate:rerun && npm run ci:revalidate",
        "acceptanceCriteria": [
            "Actions-Jobs starten wieder",
            "CodeQL und Android CI liefern echte technische Ergebnisse",
            "Release Evidence Register verweist auf neue Runs",
        ],
    },
    {
        "id": "github-code-scanning",
        "title": "GitHub Code Scanning aktivieren und CodeQL gruen nachweisen",
        "area": "Security / CodeQL",
        "automationType": "manual-external",
        "priority": "P0",
        "risk": "critical",
        "owner": "Repository Owner",
        "evidenceTarget": "docs/RELEASE_EVIDENCE_REGISTER.md",
        "recommendedCommand": "npm run ci:revalidate",
        "acceptanceCriteria": [
            "Code Scanning ist im Repository aktiv",
            "CodeQL JavaScript und Java/Kotlin laufen",
            "Fehler blockieren den Release statt nur dokumentiert zu werden",
        ],
    },
)

P1_RELEASE_BLOCKERS = (
    {
        "id": "legacy-secretkey-cutover",
        "title": "Legacy secretKey Login final aus produktiven Standardpfaden entfernen",
        "area": "Security / Auth",
        "automationType": "code-change",
        "priority": "P1",
        "risk": "critical",
        "owner": "Security/Backend",
        "evidenceTarget": "docs/LEGACY_AUTH_CUTOVER_PLAN.md",
        "recommendedCommand": "npm run test:ci && npm run analyze:admin-qa:gate",
        "acceptanceCriteria": [
            "Web-Control, Parent-Panel und Child-Panel nutzen Bootstrap/Session-Flow",
            "Legacy-Fallback ist entfernt oder nur noch explizit als Emergency-Flag erlaubt",
            "Regressionstests verhindern neuen secretKey-Standardpfad",
        ],
    },
    {
        "id": "production-firebase-appcheck-play-setup",
        "title": "Production Firebase, App Check, Play Console und Secrets nachweisen",
        "area": "Production Setup",
        "automationType": "manual-external-with-scripted-evidence",
        "priority": "P1",
        "risk": "critical",
        "owner": "Release Management",
        "evidenceTarget": "build/operator-setup/status.json",
        "recommendedCommand": "pwsh ./scripts/operator-setup.ps1 status",
        "acceptanceCriteria": [
            "Production-Secrets sind gesetzt und nicht committed",
            "App Check ist fuer Web/Admin/Android aktiv",
            "Play Billing und RTDN sind end-to-end belegbar",
        ],
    },
    {
        "id": "legal-market-go-nogo",
        "title": "Rechtstexte und Markt-Go/No-Go finalisieren",
        "area": "Legal / Compliance",
        "automationType": "manual-external-with-repo-tracking",
        "priority": "P1",
        "risk": "critical",
        "owner": "Legal/Release",
        "evidenceTarget": "docs/LEGAL_REVIEW_TRACKING.md",
        "recommendedCommand": "npm run analyze:admin-qa",
        "acceptanceCriteria": [
            "AGB/Privacy/Impressum sind final freigegeben",
            "Consent- und Re-Consent-Flows sind getestet",
            "Go/No-Go je Zielmarkt ist dokumentiert",
        ],
    },
)

ANDROID_MATRIX_SCENARIO = {
    "id": "android-10-16-dual-device-matrix",
    "title": "Android 10-16 Zwei-Geraete-QA-Matrix ausfuehren",
    "area": "Android / QA",
    "automationType": "automated-with-device-prereqs",
    "priority": "P1",
    "risk": "critical",
    "owner": "Android QA",
    "evidenceTarget": "build/test-automation/latest-summary.json",
    "recommendedCommand": "python scripts/test_automation.py --group device --strict-skips",
    "acceptanceCriteria": [
        "Android 10 bis 16 sind in der Matrix bewertet",
        "Parent- und Child-App laufen im Zwei-Geraete-Flow",
        "Skips haben konkrete Prereq-Begruendung",
        "P0/P1-Fehler werden als Issues abgeleitet",
    ],
}

PRIORITY_ORDER = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4}
AUTOMATION_ORDER = {
    "automated": 0,
    "automated-with-device-prereqs": 1,
    "code-change": 2,
    "manual-external-with-scripted-evidence": 3,
    "manual-external-with-repo-tracking": 4,
    "manual-external": 5,
}


@dataclass(frozen=True)
class PlanItem:
    id: str
    title: str
    area: str
    priority: str
    risk: str
    automationType: str
    owner: str
    evidenceTarget: str
    recommendedCommand: str
    acceptanceCriteria: list[str]
    source: str
    status: str = "open"


def _as_plan_item(raw: dict[str, Any], source: str, status: str = "open") -> PlanItem:
    return PlanItem(
        id=str(raw.get("id", "")).strip(),
        title=str(raw.get("title", "")).strip(),
        area=str(raw.get("area", raw.get("group", "QA"))).strip() or "QA",
        priority=str(raw.get("priority", "P2")).strip() or "P2",
        risk=str(raw.get("risk", "medium")).strip() or "medium",
        automationType=str(raw.get("automationType", raw.get("automationStatus", "manual"))).strip() or "manual",
        owner=str(raw.get("owner", "QA Automation")).strip() or "QA Automation",
        evidenceTarget=str(raw.get("evidenceTarget", raw.get("sourcePath", "build/admin-panel-qa-plan/latest-plan.json"))).strip(),
        recommendedCommand=str(raw.get("recommendedCommand", raw.get("command", "npm run analyze:admin-qa"))).strip(),
        acceptanceCriteria=[str(item) for item in raw.get("acceptanceCriteria", []) if str(item).strip()],
        source=source,
        status=status,
    )


def _sort_items(items: Iterable[PlanItem]) -> list[PlanItem]:
    return sorted(
        items,
        key=lambda item: (
            PRIORITY_ORDER.get(item.priority, 9),
            AUTOMATION_ORDER.get(item.automationType, 9),
            item.risk != "critical",
            item.area,
            item.id,
        ),
    )


def _suite_plan_items(catalog_payload: dict[str, Any]) -> list[PlanItem]:
    items: list[PlanItem] = []
    for entry in catalog_payload.get("suiteEntries", []):
        if not isinstance(entry, dict):
            continue
        priority = str(entry.get("priority", "P2"))
        device_mode = str(entry.get("deviceMode", "host"))
        risk = str(entry.get("risk", "medium"))
        # Keep the generated plan focused: host-only low-risk suites are already
        # covered by validate:readiness and do not need to flood the QA tab plan.
        if priority not in {"P0", "P1"} and device_mode == "host" and risk != "critical":
            continue
        raw = {
            "id": f"suite:{entry.get('id')}",
            "title": entry.get("title") or entry.get("id"),
            "area": f"Suite / {entry.get('group', 'misc')}",
            "priority": priority,
            "risk": risk,
            "automationType": "automated-with-device-prereqs" if device_mode != "host" else "automated",
            "owner": entry.get("owner") or "QA Automation",
            "evidenceTarget": "build/test-automation/latest-summary.json",
            "recommendedCommand": entry.get("command") or "python scripts/test_automation.py --list",
            "acceptanceCriteria": [
                "Suite ist im QA-Katalog sichtbar",
                "Prereqs sind dokumentiert",
                "Ergebnis wird als Evidence gespeichert",
            ],
        }
        items.append(_as_plan_item(raw, source="qa_catalog.suiteEntries"))
    return items


def _manual_migration_items(audit_payload: dict[str, Any]) -> list[PlanItem]:
    items: list[PlanItem] = []
    for candidate in audit_payload.get("manual_to_automation_candidates", []):
        if not isinstance(candidate, dict):
            continue
        suite_exists = bool(candidate.get("suite_exists"))
        visible = bool(candidate.get("visible_in_qa_text"))
        if suite_exists and visible:
            status = "done"
        elif suite_exists:
            status = "open"
        else:
            status = "needs-suite"
        raw = {
            "id": f"manual-map:{candidate.get('target_suite')}",
            "title": f"Manuellen QA-Check automatisieren: {candidate.get('manual_check')}",
            "area": "Manual-to-Automated QA Migration",
            "priority": "P1" if not suite_exists else "P2",
            "risk": "high",
            "automationType": "automated-with-device-prereqs" if suite_exists else "code-change",
            "owner": "QA Automation",
            "evidenceTarget": "build/admin-panel-qa-audit/latest-report.md",
            "recommendedCommand": f"python scripts/test_automation.py --suite {candidate.get('target_suite')}",
            "acceptanceCriteria": [
                "Manueller Check ist einem Suite-Eintrag zugeordnet",
                "QA-Reiter zeigt Automatisierungsgrad und Prereqs",
                "Nicht automatisierbare Reste bleiben als manuelle Evidence-Gates sichtbar",
            ],
        }
        items.append(_as_plan_item(raw, source="admin_panel_qa_audit.manual_to_automation_candidates", status=status))
    return items


def _audit_finding_items(audit_payload: dict[str, Any]) -> list[PlanItem]:
    items: list[PlanItem] = []
    for finding in audit_payload.get("findings", []):
        if not isinstance(finding, dict):
            continue
        status = str(finding.get("status", ""))
        severity = str(finding.get("severity", "P2"))
        if status == "done":
            continue
        raw = {
            "id": "audit:" + str(finding.get("title", "")).lower().replace(" ", "-")[:80],
            "title": finding.get("title") or "QA-Audit-Finding beheben",
            "area": finding.get("area") or "Admin Panel QA",
            "priority": severity if severity in PRIORITY_ORDER else "P2",
            "risk": "critical" if severity == "P1" else "medium",
            "automationType": "code-change" if status == "open" else "review",
            "owner": "QA Automation",
            "evidenceTarget": "build/admin-panel-qa-audit/latest-report.md",
            "recommendedCommand": "npm run analyze:admin-qa:gate",
            "acceptanceCriteria": [str(finding.get("recommendation", "Finding ist geschlossen"))],
        }
        items.append(_as_plan_item(raw, source="admin_panel_qa_audit.findings", status=status or "open"))
    return items


def build_plan() -> dict[str, Any]:
    audit_payload = admin_panel_qa_audit.evaluate()
    catalog_payload = qa_catalog.build_qa_catalog()

    items: list[PlanItem] = []
    items.extend(_as_plan_item(item, source="release_blockers.external") for item in P0_EXTERNAL_BLOCKERS)
    items.extend(_as_plan_item(item, source="release_blockers.p1") for item in P1_RELEASE_BLOCKERS)
    items.append(_as_plan_item(ANDROID_MATRIX_SCENARIO, source="android_matrix"))
    items.extend(_suite_plan_items(catalog_payload))
    items.extend(_manual_migration_items(audit_payload))
    items.extend(_audit_finding_items(audit_payload))

    deduped: dict[str, PlanItem] = {}
    for item in items:
        if not item.id:
            continue
        current = deduped.get(item.id)
        if current is None or PRIORITY_ORDER.get(item.priority, 9) < PRIORITY_ORDER.get(current.priority, 9):
            deduped[item.id] = item

    ordered = _sort_items(deduped.values())
    summary = {
        "total": len(ordered),
        "open": sum(1 for item in ordered if item.status != "done"),
        "done": sum(1 for item in ordered if item.status == "done"),
        "p0": sum(1 for item in ordered if item.priority == "P0"),
        "p1": sum(1 for item in ordered if item.priority == "P1"),
        "automatedOrScriptable": sum(1 for item in ordered if item.automationType in {"automated", "automated-with-device-prereqs", "manual-external-with-scripted-evidence"}),
        "externalManual": sum(1 for item in ordered if item.automationType == "manual-external"),
        "androidVersions": catalog_payload.get("summary", {}).get("androidVersions", []),
        "dualDeviceScenarioCount": catalog_payload.get("summary", {}).get("dualDeviceScenarioCount", 0),
        "qaAuditP1OpenCount": audit_payload.get("p1_open_count", 0),
    }
    return {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "summary": summary,
        "items": [asdict(item) for item in ordered],
    }


def render_markdown(payload: dict[str, Any]) -> str:
    summary = payload["summary"]
    lines = [
        "# Priorisierter Admin-Panel-QA-Umsetzungsplan",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "## Zusammenfassung",
        "",
        f"- Gesamtpunkte: **{summary['total']}**",
        f"- Offen: **{summary['open']}**, erledigt/abgedeckt: **{summary['done']}**",
        f"- P0: **{summary['p0']}**, P1: **{summary['p1']}**",
        f"- Automatisiert/skriptbar: **{summary['automatedOrScriptable']}**",
        f"- Extern manuell: **{summary['externalManual']}**",
        f"- Android-Matrix: **{', '.join(summary.get('androidVersions') or [])}**",
        f"- Dual-Device-Szenarien im Katalog: **{summary['dualDeviceScenarioCount']}**",
        "",
        "## Priorisierte Punkte",
        "",
        "| Prio | Status | Typ | Bereich | Titel | Owner | Befehl/Nachweis |",
        "|---|---|---|---|---|---|---|",
    ]
    for item in payload["items"]:
        lines.append(
            "| {priority} | {status} | {automationType} | {area} | {title} | {owner} | `{recommendedCommand}` → {evidenceTarget} |".format(
                **{key: str(value).replace("|", "/") for key, value in item.items()}
            )
        )

    lines.extend(["", "## Akzeptanzkriterien je offenem Punkt", ""])
    for item in payload["items"]:
        if item["status"] == "done":
            continue
        lines.append(f"### {item['priority']} · {item['title']}")
        lines.append("")
        lines.append(f"- Bereich: {item['area']}")
        lines.append(f"- Typ: {item['automationType']}")
        lines.append(f"- Owner: {item['owner']}")
        lines.append(f"- Nachweisziel: `{item['evidenceTarget']}`")
        lines.append(f"- Empfohlener Befehl: `{item['recommendedCommand']}`")
        lines.append("- Akzeptanzkriterien:")
        for criterion in item.get("acceptanceCriteria", []):
            lines.append(f"  - {criterion}")
        lines.append("")
    return "\n".join(lines)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Erzeugt einen priorisierten Umsetzungsplan fuer den Admin-Panel-QA-Reiter.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument("--fail-on-p0-open", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    payload = build_plan()
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.markdown_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    args.markdown_out.write_text(render_markdown(payload), encoding="utf-8")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    if args.fail_on_p0_open and any(item["priority"] == "P0" and item["status"] != "done" for item in payload["items"]):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
