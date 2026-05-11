#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MATRIX_FILE = REPO_ROOT / "qa" / "catalog" / "android-10-16-release-matrix.json"
DEFAULT_EVIDENCE_ROOT = REPO_ROOT / "build" / "qa-artifacts" / "android-release-matrix"
ALLOWED_STATUSES = {"pass", "planned", "blocked", "fail", "skipped", "manual_required"}


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_manifest(path: Path, required_fields: list[str], *, allow_dry_run: bool) -> list[str]:
    errors: list[str] = []
    try:
        manifest = load_json(path)
    except (OSError, json.JSONDecodeError) as exc:
        return [f"{path}: cannot read manifest: {exc}"]

    for field in required_fields:
        if field not in manifest:
            errors.append(f"{path}: missing required field '{field}'")

    status = str(manifest.get("status", ""))
    if status not in ALLOWED_STATUSES:
        errors.append(f"{path}: invalid status '{status}'")

    if not allow_dry_run and manifest.get("dryRun") is True:
        errors.append(f"{path}: dryRun evidence is not allowed for this validation mode")

    artifacts = manifest.get("artifacts", [])
    if not isinstance(artifacts, list) or not artifacts:
        errors.append(f"{path}: artifacts must be a non-empty list")
    else:
        for artifact in artifacts:
            if not isinstance(artifact, dict):
                errors.append(f"{path}: artifact entry is not an object")
                continue
            artifact_path = artifact.get("path")
            sha = artifact.get("sha256")
            if not artifact_path:
                errors.append(f"{path}: artifact without path")
                continue
            absolute_artifact = REPO_ROOT / str(artifact_path)
            if not absolute_artifact.exists():
                errors.append(f"{path}: artifact does not exist: {artifact_path}")
            if not sha:
                errors.append(f"{path}: artifact without sha256: {artifact_path}")

    scenario_results = manifest.get("scenarioResults", [])
    if not isinstance(scenario_results, list) or not scenario_results:
        errors.append(f"{path}: scenarioResults must be a non-empty list")
    else:
        for scenario in scenario_results:
            if not isinstance(scenario, dict):
                errors.append(f"{path}: scenario result is not an object")
                continue
            if not scenario.get("id"):
                errors.append(f"{path}: scenario result without id")
            scenario_status = str(scenario.get("status", ""))
            if scenario_status not in ALLOWED_STATUSES:
                errors.append(f"{path}: scenario {scenario.get('id')} has invalid status '{scenario_status}'")

    return errors


def expected_run_ids(matrix: dict[str, Any]) -> list[str]:
    matrix_id = str(matrix["matrixId"])
    run_ids: list[str] = []
    for target in matrix.get("androidTargets", []):
        api_level = int(target["apiLevel"])
        for profile in target.get("requiredProfiles", []):
            run_ids.append(f"{matrix_id}-api{api_level}-{profile}")
    return run_ids


def validate_evidence(matrix_file: Path, evidence_root: Path, *, allow_dry_run: bool, require_complete: bool) -> dict[str, Any]:
    matrix = load_json(matrix_file)
    required_fields = [str(item) for item in matrix.get("evidence", {}).get("requiredManifestFields", [])]
    expected = expected_run_ids(matrix)
    errors: list[str] = []
    checked_manifests = 0

    for run_id in expected:
        manifest_path = evidence_root / run_id / "manifest.json"
        if not manifest_path.exists():
            if require_complete:
                errors.append(f"missing manifest for expected run: {run_id}")
            continue
        checked_manifests += 1
        errors.extend(validate_manifest(manifest_path, required_fields, allow_dry_run=allow_dry_run))

    summary_path = evidence_root / "latest-summary.json"
    if not summary_path.exists():
        errors.append(f"missing latest summary: {summary_path}")
    else:
        try:
            summary = load_json(summary_path)
            if int(summary.get("totalRuns", 0)) <= 0:
                errors.append(f"{summary_path}: totalRuns must be greater than zero")
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{summary_path}: cannot read summary: {exc}")

    return {
        "schemaVersion": 1,
        "matrixId": matrix.get("matrixId"),
        "checkedManifests": checked_manifests,
        "expectedRuns": len(expected),
        "allowDryRun": allow_dry_run,
        "requireComplete": require_complete,
        "valid": not errors,
        "errors": errors,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate Android release matrix evidence manifests.")
    parser.add_argument("--matrix", default=str(DEFAULT_MATRIX_FILE), help="Matrix catalog JSON.")
    parser.add_argument("--evidence-root", default=str(DEFAULT_EVIDENCE_ROOT), help="Evidence root directory.")
    parser.add_argument("--allow-dry-run", action="store_true", help="Allow dry-run evidence manifests.")
    parser.add_argument("--require-complete", action="store_true", help="Require all matrix runs to have manifests.")
    parser.add_argument("--output", default=str(DEFAULT_EVIDENCE_ROOT / "validation-summary.json"), help="Validation summary output path.")
    args = parser.parse_args()

    result = validate_evidence(
        Path(args.matrix),
        Path(args.evidence_root),
        allow_dry_run=args.allow_dry_run,
        require_complete=args.require_complete,
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"valid": result["valid"], "checkedManifests": result["checkedManifests"], "errors": len(result["errors"])}, indent=2))
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
