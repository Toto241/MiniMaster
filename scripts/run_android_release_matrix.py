#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PLAN = REPO_ROOT / "build" / "qa-artifacts" / "android-release-matrix" / "plan.json"
DEFAULT_OUTPUT_ROOT = REPO_ROOT / "build" / "qa-artifacts" / "android-release-matrix"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_plan(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_text(path: Path, content: str) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return sha256_text(content)


def command_exists(command: str) -> bool:
    try:
        completed = subprocess.run(
            [command, "version"] if command == "adb" else [command, "--version"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=10,
        )
        return completed.returncode == 0
    except (OSError, subprocess.SubprocessError):
        return False


def filter_runs(plan: dict[str, Any], api_level: int | None, profile: str | None, limit: int | None) -> list[dict[str, Any]]:
    runs = list(plan.get("runs", []))
    if api_level is not None:
        runs = [run for run in runs if int(run.get("apiLevel", -1)) == api_level]
    if profile:
        runs = [run for run in runs if str(run.get("profile")) == profile]
    if limit is not None:
        runs = runs[:limit]
    return runs


def execute_run(run: dict[str, Any], output_root: Path, *, dry_run: bool, require_adb: bool) -> dict[str, Any]:
    started_at = utc_now()
    run_id = str(run["runId"])
    run_dir = output_root / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    adb_available = command_exists("adb")
    blocking_failures: list[dict[str, str]] = []
    status = "planned" if dry_run else "blocked"

    if require_adb and not adb_available:
        blocking_failures.append(
            {
                "id": "adb-missing",
                "message": "adb is required for non-dry-run Android matrix execution but was not found.",
            }
        )

    scenario_results: list[dict[str, Any]] = []
    for scenario in run.get("scenarioResults", []):
        scenario_status = "planned" if dry_run else "blocked"
        if blocking_failures:
            scenario_status = "blocked"
        scenario_results.append(
            {
                **scenario,
                "status": scenario_status,
                "startedAt": started_at,
                "finishedAt": utc_now(),
                "notes": "Dry-run plan materialized; no emulator/device commands executed." if dry_run else "Execution blocked until emulator/device orchestration is enabled.",
            }
        )

    parent_log = (
        f"runId={run_id}\nrole=parent\napiLevel={run.get('apiLevel')}\nprofile={run.get('profile')}\ndryRun={dry_run}\nadbAvailable={adb_available}\n"
    )
    child_log = (
        f"runId={run_id}\nrole=child\napiLevel={run.get('apiLevel')}\nprofile={run.get('profile')}\ndryRun={dry_run}\nadbAvailable={adb_available}\n"
    )

    parent_log_sha = write_text(run_dir / "parent-logcat.txt", parent_log)
    child_log_sha = write_text(run_dir / "child-logcat.txt", child_log)

    finished_at = utc_now()
    if blocking_failures:
        status = "blocked"
    elif dry_run:
        status = "planned"

    test_summary = {
        "runId": run_id,
        "status": status,
        "dryRun": dry_run,
        "adbAvailable": adb_available,
        "scenarioCount": len(scenario_results),
        "blockingFailureCount": len(blocking_failures),
    }
    summary_sha = write_text(run_dir / "test-summary.json", json.dumps(test_summary, indent=2, ensure_ascii=False) + "\n")

    manifest = {
        "schemaVersion": 1,
        "runId": run_id,
        "matrixId": run.get("matrixId"),
        "androidVersion": run.get("androidVersion"),
        "apiLevel": run.get("apiLevel"),
        "systemImage": run.get("systemImage"),
        "profile": run.get("profile"),
        "deviceMode": run.get("deviceMode"),
        "parentDevice": "planned-parent-emulator" if dry_run else "",
        "childDevice": "planned-child-emulator" if dry_run else "",
        "startedAt": started_at,
        "finishedAt": finished_at,
        "status": status,
        "dryRun": dry_run,
        "scenarioResults": scenario_results,
        "artifacts": [
            {"path": str((run_dir / "parent-logcat.txt").relative_to(REPO_ROOT)), "sha256": parent_log_sha},
            {"path": str((run_dir / "child-logcat.txt").relative_to(REPO_ROOT)), "sha256": child_log_sha},
            {"path": str((run_dir / "test-summary.json").relative_to(REPO_ROOT)), "sha256": summary_sha},
        ],
        "blockingFailures": blocking_failures,
    }
    manifest_sha = write_text(run_dir / "manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    manifest["manifestSha256"] = manifest_sha
    write_text(run_dir / "manifest.json", json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return manifest


def write_latest_summary(output_root: Path, manifests: list[dict[str, Any]], *, dry_run: bool) -> dict[str, Any]:
    summary = {
        "schemaVersion": 1,
        "generatedAt": utc_now(),
        "dryRun": dry_run,
        "totalRuns": len(manifests),
        "statusCounts": {},
        "runs": [
            {
                "runId": item["runId"],
                "androidVersion": item["androidVersion"],
                "apiLevel": item["apiLevel"],
                "profile": item["profile"],
                "status": item["status"],
                "blockingFailureCount": len(item.get("blockingFailures", [])),
            }
            for item in manifests
        ],
    }
    for item in manifests:
        status = str(item["status"])
        summary["statusCounts"][status] = int(summary["statusCounts"].get(status, 0)) + 1
    write_text(output_root / "latest-summary.json", json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Materialize or execute Android 10-16 release matrix runs.")
    parser.add_argument("--plan", default=str(DEFAULT_PLAN), help="Path to generated matrix plan.json.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Output root for run artifacts.")
    parser.add_argument("--api-level", type=int, default=None, help="Only run one API level.")
    parser.add_argument("--profile", default=None, help="Only run one profile.")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of materialized runs.")
    parser.add_argument("--execute", action="store_true", help="Reserved for real emulator execution. Without this flag, dry-run manifests are created.")
    parser.add_argument("--require-adb", action="store_true", help="Block non-dry-run when adb is missing.")
    args = parser.parse_args()

    plan_path = Path(args.plan)
    if not plan_path.exists():
        raise SystemExit(f"Matrix plan not found: {plan_path}. Run scripts/build_android_release_matrix_plan.py first.")

    plan = load_plan(plan_path)
    selected_runs = filter_runs(plan, args.api_level, args.profile, args.limit)
    output_root = Path(args.output_root)
    output_root.mkdir(parents=True, exist_ok=True)

    dry_run = not args.execute
    manifests: list[dict[str, Any]] = []
    for run in selected_runs:
        manifests.append(execute_run(run, output_root, dry_run=dry_run, require_adb=args.require_adb))
        time.sleep(0.01)

    summary = write_latest_summary(output_root, manifests, dry_run=dry_run)
    print(json.dumps({"totalRuns": summary["totalRuns"], "statusCounts": summary["statusCounts"], "dryRun": dry_run}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
