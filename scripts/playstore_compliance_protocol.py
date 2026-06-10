#!/usr/bin/env python3
"""Generate and validate the Google Play Store compliance protocol.

The protocol is intentionally repository-local and deterministic so it can be
run in CI without Play Console credentials. It checks that the required Google
Play submission artifacts exist, verifies key content markers, and writes a
JSON/Markdown evidence packet for release sign-off.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "playstore-compliance" / "latest-protocol.json"
DEFAULT_MARKDOWN_OUT = REPO_ROOT / "build" / "playstore-compliance" / "latest-protocol.md"

REQUIRED_DOCS = (
    {
        "id": "data-safety",
        "title": "Data Safety Template",
        "path": "docs/PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md",
        "markers": ("Data Safety", "Data Collection", "Play Console"),
        "criterion": "Data-Safety-Angaben muessen vor Store-Review belegbar und konsistent sein.",
    },
    {
        "id": "permissions-declaration",
        "title": "Sensitive Permissions Declaration",
        "path": "docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md",
        "markers": ("Accessibility", "PACKAGE_USAGE_STATS", "SYSTEM_ALERT_WINDOW"),
        "criterion": "Accessibility, Usage Access und Overlay muessen mit Zweck, User Benefit und Nachweis erklaert sein.",
    },
    {
        "id": "store-listing-iarc",
        "title": "Store Listing und IARC Readiness",
        "path": "docs/STORE_LISTING_AND_IARC_READINESS.md",
        "markers": ("IARC", "Store Listing", "Privacy"),
        "criterion": "Listing, Altersfreigabe und Kontakt-/Privacy-Angaben muessen reviewfaehig sein.",
    },
    {
        "id": "reviewer-access",
        "title": "App Access Reviewer Guide",
        "path": "docs/APP_ACCESS_REVIEWER_GUIDE.md",
        "markers": ("Reviewer", "Permissions", "Credentials"),
        "criterion": "Reviewer muessen einen reproduzierbaren Zugang und Testpfad erhalten.",
    },
    {
        "id": "release-evidence",
        "title": "Release Evidence Register",
        "path": "docs/RELEASE_EVIDENCE_REGISTER.md",
        "markers": ("Evidence", "Play", "Release"),
        "criterion": "Finale Einreichungsnachweise muessen im Release Evidence Register referenziert sein.",
    },
)

AUTOMATED_GATES = (
    {
        "id": "admin-panel-playstore-tests",
        "command": "npm test -- --runInBand test/admin-panel-modules.test.ts test/admin-panel-playstore-protocol.test.ts",
        "evidence": "Admin-Panel Play-Store-Helfer, Reviewer-Guide und Protokoll-Payload sind automatisiert getestet.",
    },
    {
        "id": "protocol-generator",
        "command": "python scripts/playstore_compliance_protocol.py --fail-on-open",
        "evidence": "Repo-Dokumente fuer Play-Store-Kriterien werden strukturell geprueft und als JSON/Markdown protokolliert.",
    },
    {
        "id": "admin-qa-plan",
        "command": "npm run plan:admin-qa",
        "evidence": "Offene Admin-Panel-/Release-Gates bleiben im priorisierten QA-Plan sichtbar.",
    },
)


@dataclass(frozen=True)
class CriterionResult:
    id: str
    title: str
    path: str
    criterion: str
    status: str
    missingMarkers: list[str]


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8-sig")


def evaluate_docs(required_docs: Iterable[dict[str, object]] = REQUIRED_DOCS) -> list[CriterionResult]:
    results: list[CriterionResult] = []
    for doc in required_docs:
        rel_path = str(doc["path"])
        abs_path = REPO_ROOT / rel_path
        markers = [str(marker) for marker in doc.get("markers", ())]
        if not abs_path.exists():
            results.append(CriterionResult(
                id=str(doc["id"]),
                title=str(doc["title"]),
                path=rel_path,
                criterion=str(doc["criterion"]),
                status="missing",
                missingMarkers=markers,
            ))
            continue
        text = _read_text(abs_path)
        missing = [marker for marker in markers if marker.lower() not in text.lower()]
        results.append(CriterionResult(
            id=str(doc["id"]),
            title=str(doc["title"]),
            path=rel_path,
            criterion=str(doc["criterion"]),
            status="pass" if not missing else "open",
            missingMarkers=missing,
        ))
    return results


def build_protocol(results: list[CriterionResult] | None = None, *, generated_at: str | None = None) -> dict[str, object]:
    evaluated = results if results is not None else evaluate_docs()
    total = len(evaluated)
    passed = sum(1 for item in evaluated if item.status == "pass")
    open_items = [item for item in evaluated if item.status != "pass"]
    return {
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat(),
        "type": "google-playstore-compliance-protocol",
        "summary": {
            "total": total,
            "passed": passed,
            "open": len(open_items),
            "ready": len(open_items) == 0,
        },
        "criteria": [asdict(item) for item in evaluated],
        "automatedGates": list(AUTOMATED_GATES),
        "manualConsoleEvidenceRequired": [
            "Play Console Data-Safety final submitted/reviewed screenshot",
            "Sensitive permissions declaration submitted/reviewed screenshots",
            "IARC certificate or Play Console age-rating screenshot",
            "Store listing preview screenshot including privacy URL and support contact",
            "Reviewer App Access instructions copied into Play Console",
        ],
    }


def render_markdown(protocol: dict[str, object]) -> str:
    summary = protocol["summary"]  # type: ignore[index]
    lines = [
        "# Google Playstore Kriterien-Protokoll",
        "",
        f"**Generated at:** {protocol['generatedAt']}",
        f"**Status:** {'READY' if summary['ready'] else 'OPEN'} ({summary['passed']}/{summary['total']} Kriterien bestanden)",
        "",
        "## Automatisierte Repo-Kriterien",
        "",
        "| ID | Status | Nachweis | Offene Marker |",
        "| --- | --- | --- | --- |",
    ]
    for item in protocol["criteria"]:  # type: ignore[index]
        missing = ", ".join(item["missingMarkers"]) or "-"
        lines.append(f"| {item['id']} | {item['status']} | `{item['path']}` | {missing} |")
    lines.extend([
        "",
        "## Automatisierte Gates",
        "",
        "| Gate | Command | Evidence |",
        "| --- | --- | --- |",
    ])
    for gate in protocol["automatedGates"]:  # type: ignore[index]
        lines.append(f"| {gate['id']} | `{gate['command']}` | {gate['evidence']} |")
    lines.extend([
        "",
        "## Manuell in der Play Console beizulegende Nachweise",
        "",
    ])
    for item in protocol["manualConsoleEvidenceRequired"]:  # type: ignore[index]
        lines.append(f"- [ ] {item}")
    lines.append("")
    return "\n".join(lines)


def write_outputs(protocol: dict[str, object], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(protocol, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(protocol), encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument("--fail-on-open", action="store_true", help="Return exit code 1 when a repo criterion is open/missing.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(list(argv or sys.argv[1:]))
    protocol = build_protocol()
    write_outputs(protocol, args.json_out, args.markdown_out)
    print(json.dumps(protocol["summary"], ensure_ascii=False))
    if args.fail_on_open and not protocol["summary"]["ready"]:  # type: ignore[index]
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
