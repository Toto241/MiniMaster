#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MATRIX_FILE = REPO_ROOT / "qa" / "catalog" / "android-10-16-release-matrix.json"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "build" / "qa-artifacts" / "android-release-matrix"


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def scenario_required_for_profile(scenario: dict[str, Any], profile_id: str) -> bool:
    return profile_id in [str(item) for item in scenario.get("requiredForProfiles", [])]


def build_run_id(matrix_id: str, api_level: int, profile_id: str) -> str:
    return f"{matrix_id}-api{api_level}-{profile_id}"


def build_plan(matrix: dict[str, Any]) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    matrix_id = str(matrix["matrixId"])
    scenarios = [dict(item) for item in matrix.get("scenarios", [])]
    targets = [dict(item) for item in matrix.get("androidTargets", [])]
    output_root = str(matrix.get("evidence", {}).get("outputRoot", "build/qa-artifacts/android-release-matrix"))

    runs: list[dict[str, Any]] = []
    for target in targets:
        api_level = int(target["apiLevel"])
        android_version = str(target["androidVersion"])
        for profile_id in [str(item) for item in target.get("requiredProfiles", [])]:
            selected_scenarios = [
                {
                    "id": str(scenario["id"]),
                    "title": str(scenario["title"]),
                    "level": str(scenario.get("level", "integration")),
                    "expectedEvidence": [str(item) for item in scenario.get("expectedEvidence", [])],
                    "status": "not_run",
                    "blocking": True,
                }
                for scenario in scenarios
                if scenario_required_for_profile(scenario, profile_id)
            ]
            run_id = build_run_id(matrix_id, api_level, profile_id)
            run_dir = f"{output_root}/{run_id}"
            runs.append(
                {
                    "runId": run_id,
                    "matrixId": matrix_id,
                    "androidVersion": android_version,
                    "apiLevel": api_level,
                    "systemImage": target.get("systemImage", ""),
                    "profile": profile_id,
                    "previewAllowed": bool(target.get("previewAllowed", False)),
                    "deviceMode": str(matrix.get("deviceMode", "dual-device")),
                    "parent": matrix.get("apps", [])[0],
                    "child": matrix.get("apps", [])[1],
                    "status": "not_run",
                    "scenarioResults": selected_scenarios,
                    "artifacts": {
                        "runDirectory": run_dir,
                        "manifest": f"{run_dir}/manifest.json",
                        "parentLogcat": f"{run_dir}/parent-logcat.txt",
                        "childLogcat": f"{run_dir}/child-logcat.txt",
                        "testSummary": f"{run_dir}/test-summary.json",
                    },
                    "blockingFailures": [],
                }
            )

    summary = {
        "totalRuns": len(runs),
        "targets": len(targets),
        "profiles": sorted({str(run["profile"]) for run in runs}),
        "apiLevels": [int(target["apiLevel"]) for target in targets],
        "blockingForRelease": bool(matrix.get("blockingForRelease", True)),
    }

    return {
        "schemaVersion": 1,
        "generatedAt": generated_at,
        "matrixId": matrix_id,
        "title": matrix.get("title", "Android Release Matrix"),
        "summary": summary,
        "runs": runs,
        "doneDefinition": matrix.get("doneDefinition", []),
    }


def write_outputs(plan: dict[str, Any], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    plan_path = output_dir / "plan.json"
    plan_path.write_text(json.dumps(plan, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = [
        f"# {plan['title']} Plan",
        "",
        f"Generated: {plan['generatedAt']}",
        "",
        "## Summary",
        "",
        f"- Total runs: {plan['summary']['totalRuns']}",
        f"- API levels: {', '.join(str(item) for item in plan['summary']['apiLevels'])}",
        f"- Profiles: {', '.join(plan['summary']['profiles'])}",
        "",
        "## Runs",
        "",
        "| Run ID | Android | API | Profile | Scenarios | Status |",
        "|--------|---------|-----|---------|-----------|--------|",
    ]
    for run in plan["runs"]:
        lines.append(
            f"| `{run['runId']}` | {run['androidVersion']} | {run['apiLevel']} | {run['profile']} | {len(run['scenarioResults'])} | {run['status']} |"
        )
    lines.extend(["", "## Done definition", ""])
    for item in plan.get("doneDefinition", []):
        lines.append(f"- {item}")
    (output_dir / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Android 10-16 release QA matrix execution plan.")
    parser.add_argument("--matrix", default=str(DEFAULT_MATRIX_FILE), help="Path to the Android matrix catalog JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory for plan files.")
    args = parser.parse_args()

    matrix = load_json(Path(args.matrix))
    plan = build_plan(matrix)
    write_outputs(plan, Path(args.output_dir))
    print(json.dumps({"matrixId": plan["matrixId"], "totalRuns": plan["summary"]["totalRuns"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
