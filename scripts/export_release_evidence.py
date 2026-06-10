#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import zipfile
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = REPO_ROOT / "build" / "release-evidence"

EVIDENCE_CANDIDATES = (
    "docs/CI_REVALIDATION_LATEST.md",
    "docs/QA_RELEASE_GAP_CLOSURE_PLAN.md",
    "docs/SECURITY_HARDENING_P3.md",
    "build/test-automation/latest-summary.json",
    "build/qa-artifacts/latest-summary.json",
    "build/qa-artifacts/android-release-matrix/latest-summary.json",
    "build/qa-artifacts/android-release-matrix/validation-summary.json",
    "build/fertigungsstand/latest-summary.json",
    "docs/REPO_FINAL_STATUS.md",
    "build/reports/tests/test/index.html",
    "build/reports/jacoco/test/html/index.html",
    "masterApp/build/reports/lint-results-debug.html",
    "childApp/build/reports/lint-results-debug.html",
)

RELEASE_GATES = (
    {
        "id": "actions-enabled",
        "priority": "P0",
        "title": "GitHub Actions can execute release gates",
        "evidence": "GitHub Actions run URL or exported workflow logs",
        "automated": False,
    },
    {
        "id": "code-scanning-enabled",
        "priority": "P0",
        "title": "GitHub Code Scanning enabled and CodeQL results available",
        "evidence": "CodeQL workflow run and Security tab evidence",
        "automated": False,
    },
    {
        "id": "legacy-auth-cutover",
        "priority": "P1",
        "title": "Legacy secretKey login disabled by default",
        "evidence": "Auth/security test results",
        "automated": True,
    },
    {
        "id": "android-10-16-matrix",
        "priority": "P1",
        "title": "Android 10-16 parent/child dual-device matrix completed",
        "evidence": "QA matrix manifest and per-run artifacts",
        "automated": True,
    },
    {
        "id": "production-firebase-appcheck",
        "priority": "P1",
        "title": "Production Firebase, App Check, secrets and Play Console configured",
        "evidence": "Firebase setup evidence and operator sign-off",
        "automated": False,
    },
    {
        "id": "legal-market-approval",
        "priority": "P1",
        "title": "Legal texts, consent versioning and market go/no-go approved",
        "evidence": "Versioned legal policies and sign-off note",
        "automated": False,
    },
)

@dataclass(frozen=True)
class EvidenceFile:
    path: str
    exists: bool
    size_bytes: int
    sha256: str | None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def collect_files(paths: Iterable[str]) -> list[EvidenceFile]:
    result: list[EvidenceFile] = []
    for relative in paths:
        absolute = REPO_ROOT / relative
        if absolute.exists() and absolute.is_file():
            result.append(
                EvidenceFile(
                    path=relative,
                    exists=True,
                    size_bytes=absolute.stat().st_size,
                    sha256=sha256_file(absolute),
                )
            )
        else:
            result.append(EvidenceFile(path=relative, exists=False, size_bytes=0, sha256=None))
    return result


def load_json_if_exists(path: Path) -> dict[str, object] | None:
    if not path.exists() or not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def derive_gate_status(files: list[EvidenceFile]) -> list[dict[str, object]]:
    existing = {item.path for item in files if item.exists}
    latest_summary = load_json_if_exists(REPO_ROOT / "build/test-automation/latest-summary.json")
    qa_summary = (
        load_json_if_exists(REPO_ROOT / "build/qa-artifacts/latest-summary.json")
        or load_json_if_exists(REPO_ROOT / "build/qa-artifacts/android-release-matrix/latest-summary.json")
    )

    gate_rows: list[dict[str, object]] = []
    for gate in RELEASE_GATES:
        gate_id = str(gate["id"])
        status = "manual_required"
        reason = "Manual operator evidence is required."

        if gate_id == "legacy-auth-cutover":
            status = "unknown"
            reason = "No parsed auth/security summary was found. Run npm test/security checks and export again."
            if latest_summary:
                status = "evidence_present"
                reason = "A test automation summary is present; verify it contains auth/security suites."
        elif gate_id == "android-10-16-matrix":
            status = "missing"
            reason = "Android matrix evidence was not found."
            if qa_summary or any(path.startswith("build/qa-artifacts/") for path in existing):
                status = "evidence_present"
                reason = "QA artifact evidence is present; verify Android 10-16 coverage in the manifest."
        elif gate_id in {"actions-enabled", "code-scanning-enabled"}:
            if "docs/CI_REVALIDATION_LATEST.md" in existing:
                status = "manual_review"
                reason = "CI revalidation report is present; confirm current GitHub settings and latest run result."
        elif gate_id in {"production-firebase-appcheck", "legal-market-approval"}:
            status = "manual_required"
            reason = "Requires external configuration/sign-off evidence not stored in this repository."

        gate_rows.append({**gate, "status": status, "reason": reason})
    return gate_rows


def copy_evidence_files(files: list[EvidenceFile], target_dir: Path) -> None:
    for item in files:
        if not item.exists:
            continue
        source = REPO_ROOT / item.path
        target = target_dir / "files" / item.path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def write_zip(source_dir: Path, zip_path: Path) -> None:
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_path in sorted(source_dir.rglob("*")):
            if file_path.is_file() and file_path != zip_path:
                archive.write(file_path, file_path.relative_to(source_dir))


def export_release_evidence(output_dir: Path, *, include_zip: bool) -> dict[str, object]:
    timestamp = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    run_id = "release-evidence-" + timestamp.replace(":", "").replace("-", "").replace("Z", "")
    target_dir = output_dir / run_id
    target_dir.mkdir(parents=True, exist_ok=True)

    files = collect_files(EVIDENCE_CANDIDATES)
    gates = derive_gate_status(files)
    copy_evidence_files(files, target_dir)

    manifest: dict[str, object] = {
        "schemaVersion": 1,
        "runId": run_id,
        "generatedAt": timestamp,
        "repository": "Toto241/MiniMaster",
        "branch": "fix/qa-ci-open-gaps",
        "releaseReady": all(str(gate["status"]) in {"pass", "evidence_present"} for gate in gates),
        "gates": gates,
        "files": [asdict(item) for item in files],
    }

    manifest_path = target_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    markdown_lines = [
        f"# Release Evidence Export {run_id}",
        "",
        f"Generated: {timestamp}",
        "",
        "## Gate status",
        "",
        "| Gate | Priority | Status | Reason |",
        "|------|----------|--------|--------|",
    ]
    for gate in gates:
        markdown_lines.append(
            f"| {gate['title']} | {gate['priority']} | {gate['status']} | {gate['reason']} |"
        )
    markdown_lines.extend([
        "",
        "## Files",
        "",
        "| File | Present | SHA-256 |",
        "|------|---------|---------|",
    ])
    for item in files:
        markdown_lines.append(f"| `{item.path}` | {item.exists} | `{item.sha256 or ''}` |")
    (target_dir / "README.md").write_text("\n".join(markdown_lines) + "\n", encoding="utf-8")

    if include_zip:
        zip_path = output_dir / f"{run_id}.zip"
        write_zip(target_dir, zip_path)
        manifest["zipPath"] = str(zip_path.relative_to(REPO_ROOT))
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Export MiniMaster release QA evidence into a manifest package.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for generated evidence exports.")
    parser.add_argument("--no-zip", action="store_true", help="Do not create a ZIP archive.")
    args = parser.parse_args()

    manifest = export_release_evidence(Path(args.output_dir), include_zip=not args.no_zip)
    print(json.dumps({"runId": manifest["runId"], "releaseReady": manifest["releaseReady"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
