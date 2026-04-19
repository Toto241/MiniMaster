#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Iterable, cast


REPO_ROOT = Path(__file__).resolve().parent.parent
CATALOG_ROOT = REPO_ROOT / "qa" / "catalog"
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "test-automation" / "qa-catalog.json"


def _read_json_file(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def load_android_version_matrix() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json_file(CATALOG_ROOT / "android-version-matrix.json"))


def load_device_profiles() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json_file(CATALOG_ROOT / "device-profiles.json"))


def load_dual_device_scenarios() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json_file(CATALOG_ROOT / "dual-device-scenarios.json"))


def load_android_scenario_mappings() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json_file(CATALOG_ROOT / "android-scenario-mapping.json"))


def load_execution_profiles() -> list[dict[str, object]]:
    return cast(list[dict[str, object]], _read_json_file(CATALOG_ROOT / "execution-profiles.json"))


def load_automation_backlog() -> list[dict[str, object]]:
    backlog = cast(list[dict[str, object]], _read_json_file(CATALOG_ROOT / "automation-backlog.json"))
    priority_order = {"P0": 0, "P1": 1, "P2": 2, "P3": 3}
    return sorted(
        backlog,
        key=lambda item: (
            priority_order.get(str(item.get("priority", "P9")), 9),
            str(item.get("phase", "")),
            str(item.get("id", "")),
        ),
    )


def _all_android_versions(matrix: list[dict[str, object]]) -> list[str]:
    return [str(item.get("androidVersion", "")).strip() for item in matrix if str(item.get("androidVersion", "")).strip()]


def _priority_from_suite_id(suite_id: str, group: str) -> str:
    suite_key = f"{suite_id} {group}".lower()
    if any(token in suite_key for token in ("security", "rules", "e2e", "usb", "dual", "release", "connected")):
        return "P0"
    if any(token in suite_key for token in ("integration", "lint", "build", "static", "python")):
        return "P1"
    return "P2"


def _test_level_id(group: str, suite_id: str) -> str:
    suite_key = suite_id.lower()
    if group == "device" and any(token in suite_key for token in ("dual", "e2e", "usb")):
        return "system"
    if group == "device":
        return "integration"
    if group == "android" and any(token in suite_key for token in ("unit", "translation")):
        return "module"
    if group == "android":
        return "integration"
    if group == "backend" and any(token in suite_key for token in ("emulator", "integration")):
        return "integration"
    if group in {"backend", "python", "release"}:
        return "software"
    return "integration"


def _test_level_label(level_id: str) -> str:
    return {
        "software": "Softwaretests",
        "module": "Modultests",
        "integration": "Integrationstests",
        "system": "Systemtests",
    }.get(level_id, "Integrationstests")


def _app_role_id(group: str, suite_id: str) -> str:
    suite_key = suite_id.lower()
    if any(token in suite_key for token in ("dual", "e2e", "pair", "sync")):
        return "both"
    if "master" in suite_key or "parent" in suite_key:
        return "parent"
    if "child" in suite_key:
        return "child"
    if group in {"backend", "python", "release"}:
        return "platform"
    return "both"


def _app_role_label(role_id: str) -> str:
    return {
        "parent": "Eltern-App",
        "child": "Kinder-App",
        "both": "Beide Apps",
        "platform": "Plattform / QA",
    }.get(role_id, "Beide Apps")


def _recommended_execution_profiles(level_id: str, device_mode: str, android_versions: list[str]) -> list[str]:
    profiles = ["full"]
    if level_id in {"software", "module"}:
        profiles.insert(0, "minimal")
    if level_id in {"integration", "system"}:
        profiles.insert(0, "standard")
    if level_id == "integration" and device_mode == "host":
        profiles.insert(0, "minimal")
    if android_versions and set(android_versions).issubset({"10", "14", "16"}) and "minimal" not in profiles:
        profiles.insert(0, "minimal")
    result: list[str] = []
    for profile_id in profiles:
        if profile_id not in result:
            result.append(profile_id)
    return result


def _risk_from_suite_id(suite_id: str, group: str) -> str:
    suite_key = f"{suite_id} {group}".lower()
    if any(token in suite_key for token in ("security", "rules", "release", "pair", "e2e", "usb")):
        return "critical"
    if any(token in suite_key for token in ("device", "connected", "integration", "android")):
        return "high"
    if any(token in suite_key for token in ("python", "lint", "build")):
        return "medium"
    return "low"


def _level_from_suite(group: str, suite_id: str) -> str:
    suite_key = suite_id.lower()
    if group == "backend":
        return "L2"
    if group == "android" and any(token in suite_key for token in ("unit", "translation")):
        return "L1"
    if group == "android":
        return "L2"
    if group == "device":
        return "L4" if any(token in suite_key for token in ("e2e", "dual", "usb")) else "L3"
    if group == "python":
        return "L0"
    if group == "release":
        return "L0"
    return "L2"


def _device_mode_from_suite(group: str, suite_id: str) -> str:
    suite_key = suite_id.lower()
    if any(token in suite_key for token in ("dual", "e2e", "shell-script")):
        return "dual-device"
    if group == "device":
        return "single-device"
    return "host"


def _owner_from_suite(group: str, suite_id: str) -> str:
    suite_key = suite_id.lower()
    if any(token in suite_key for token in ("security", "rules")):
        return "Security/Compliance"
    if group in {"android", "device"}:
        return "Android QA"
    if group == "python":
        return "QA Automation"
    if group == "release":
        return "Release Management"
    return "Backend QA"


def _suite_android_versions(group: str, suite_id: str, matrix: list[dict[str, object]]) -> list[str]:
    suite_key = suite_id.lower()
    all_versions = _all_android_versions(matrix)
    if group in {"android", "device"}:
        return all_versions
    if "android" in suite_key:
        return all_versions
    return []


def _normalize_suite_input(entry: object) -> dict[str, object]:
    if hasattr(entry, "suite_id"):
        suite = entry
        return {
            "suiteId": getattr(suite, "suite_id"),
            "title": getattr(suite, "title"),
            "group": getattr(suite, "group"),
            "command": " ".join(getattr(suite, "command")),
            "prereqs": list(getattr(suite, "required_prereqs")),
            "timeoutSec": getattr(suite, "timeout_sec"),
            "prereqsMet": None,
            "prereqReason": None,
        }
    return cast(dict[str, object], entry or {})


def build_suite_entries(
    matrix: list[dict[str, object]],
    suites: Iterable[object] | None = None,
) -> list[dict[str, object]]:
    if suites is None:
        from test_automation import SUITES as automation_suites

        suites = automation_suites

    entries: list[dict[str, object]] = []
    for raw_entry in suites:
        suite = _normalize_suite_input(raw_entry)
        suite_id = str(suite.get("suiteId", "")).strip()
        group = str(suite.get("group", "misc")).strip()
        android_versions = _suite_android_versions(group, suite_id, matrix)
        device_mode = _device_mode_from_suite(group, suite_id)
        test_level = _test_level_id(group, suite_id)
        app_role = _app_role_id(group, suite_id)
        entries.append(
            {
                "id": suite_id,
                "title": str(suite.get("title", suite_id)),
                "entryType": "suite",
                "automationStatus": "automated",
                "level": _level_from_suite(group, suite_id),
                "deviceMode": device_mode,
                "testLevel": test_level,
                "testLevelLabel": _test_level_label(test_level),
                "appRole": app_role,
                "appRoleLabel": _app_role_label(app_role),
                "priority": _priority_from_suite_id(suite_id, group),
                "risk": _risk_from_suite_id(suite_id, group),
                "owner": _owner_from_suite(group, suite_id),
                "group": group,
                "androidVersions": android_versions,
                "executionProfiles": _recommended_execution_profiles(test_level, device_mode, android_versions),
                "deviceRoleA": "parent" if app_role in {"parent", "both"} and device_mode == "dual-device" else app_role,
                "deviceRoleB": "child" if app_role == "both" and device_mode == "dual-device" else "",
                "command": str(suite.get("command", "")),
                "prereqs": cast(list[str], suite.get("prereqs") or []),
                "prereqsMet": suite.get("prereqsMet"),
                "prereqReason": suite.get("prereqReason"),
                "timeoutSec": suite.get("timeoutSec"),
                "scope": suite.get("scope") or ("device" if group == "device" else "host"),
                "scopeNote": suite.get("scopeNote") or "",
            }
        )
    return sorted(entries, key=lambda item: (item["priority"], item["group"], item["id"]))


def _inventory_entry_for_path(path: Path, matrix: list[dict[str, object]]) -> dict[str, object]:
    relative = path.relative_to(REPO_ROOT).as_posix()
    parts = relative.split("/")
    if relative.startswith("test/"):
        level = "L2"
        owner = "Backend QA"
        device_mode = "host"
        android_versions: list[str] = []
    elif "/src/test/" in relative:
        level = "L1"
        owner = "Android QA"
        device_mode = "host"
        android_versions = _all_android_versions(matrix)
    elif "/src/androidTest/" in relative:
        level = "L3"
        owner = "Android QA"
        device_mode = "single-device"
        android_versions = _all_android_versions(matrix)
    elif relative.startswith("scripts/tests/"):
        level = "L0"
        owner = "QA Automation"
        device_mode = "host"
        android_versions = []
    else:
        level = "L2"
        owner = "Engineering"
        device_mode = "host"
        android_versions = []

    lowered = relative.lower()
    if relative.startswith("test/system/") or "/src/androidtest/" in lowered and any(token in lowered for token in ("deeplink", "e2e", "commissioning")):
        test_level = "system"
    elif relative.startswith("test/integration/") or "/src/androidtest/" in lowered:
        test_level = "integration"
    elif relative.startswith("test/module/") or "/src/test/" in relative:
        test_level = "module"
    else:
        test_level = "software"

    if any(token in lowered for token in ("masterapp", "parent", "master")):
        app_role = "parent"
    elif any(token in lowered for token in ("childapp", "child", "pairing")):
        app_role = "child"
    elif lowered.startswith("scripts/tests/"):
        app_role = "platform"
    else:
        app_role = "both"

    if any(token in lowered for token in ("dual", "e2e", "commissioning", "pairing")) and device_mode != "host":
        device_mode = "dual-device" if "dual" in lowered or "e2e" in lowered else device_mode

    if any(token in lowered for token in ("security", "rules", "pairing", "sync", "device")):
        priority = "P0"
    elif any(token in lowered for token in ("integration", "ui", "screen", "viewmodel")):
        priority = "P1"
    else:
        priority = "P2"

    risk = "critical" if priority == "P0" else "high" if priority == "P1" else "medium"
    return {
        "id": f"inventory:{relative.replace('/', ':')}",
        "title": path.stem,
        "entryType": "inventory",
        "sourcePath": relative,
        "automationStatus": "automated",
        "level": level,
        "testLevel": test_level,
        "testLevelLabel": _test_level_label(test_level),
        "deviceMode": device_mode,
        "appRole": app_role,
        "appRoleLabel": _app_role_label(app_role),
        "priority": priority,
        "risk": risk,
        "owner": owner,
        "androidVersions": android_versions,
        "executionProfiles": _recommended_execution_profiles(test_level, device_mode, android_versions),
        "deviceRoleA": "parent" if app_role in {"parent", "both"} and device_mode == "dual-device" else app_role,
        "deviceRoleB": "child" if app_role == "both" and device_mode == "dual-device" else "",
        "platform": parts[0],
    }


def build_repo_inventory(matrix: list[dict[str, object]]) -> list[dict[str, object]]:
    patterns = (
        "test/**/*.test.ts",
        "masterApp/src/test/**/*.kt",
        "childApp/src/test/**/*.kt",
        "masterApp/src/androidTest/**/*.kt",
        "childApp/src/androidTest/**/*.kt",
        "scripts/tests/test_*.py",
    )
    entries: list[dict[str, object]] = []
    for pattern in patterns:
        for path in sorted(REPO_ROOT.glob(pattern)):
            if path.is_file():
                entries.append(_inventory_entry_for_path(path, matrix))
    return entries


def build_qa_catalog(suites: Iterable[object] | None = None) -> dict[str, object]:
    matrix = load_android_version_matrix()
    profiles = load_device_profiles()
    execution_profiles = load_execution_profiles()
    scenarios = load_dual_device_scenarios()
    scenario_mappings = load_android_scenario_mappings()
    backlog = load_automation_backlog()
    suite_entries = build_suite_entries(matrix, suites=suites)
    inventory_entries = build_repo_inventory(matrix)

    dual_device_count = sum(1 for item in suite_entries if item.get("deviceMode") == "dual-device")
    single_device_count = sum(1 for item in suite_entries if item.get("deviceMode") == "single-device")
    host_count = sum(1 for item in suite_entries if item.get("deviceMode") == "host")
    mapped_scenario_ids = {
        str(item.get("scenarioId", "")).strip()
        for item in scenario_mappings
        if str(item.get("scenarioId", "")).strip()
    }
    all_scenario_ids = {
        str(item.get("scenarioId", "")).strip()
        for item in scenarios
        if str(item.get("scenarioId", "")).strip()
    }
    unmapped_scenario_ids = sorted(all_scenario_ids - mapped_scenario_ids)

    return {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "catalogMaturity": "seed",
        "androidMatrix": matrix,
        "deviceProfiles": profiles,
        "executionProfiles": execution_profiles,
        "dualDeviceScenarios": scenarios,
        "androidScenarioMappings": scenario_mappings,
        "suiteEntries": suite_entries,
        "inventoryEntries": inventory_entries,
        "automationBacklog": backlog,
        "summary": {
            "suiteCount": len(suite_entries),
            "inventoryCount": len(inventory_entries),
            "androidVersions": _all_android_versions(matrix),
            "executionProfileCount": len(execution_profiles),
            "dualDeviceScenarioCount": len(scenarios),
            "androidScenarioMappingCount": len(scenario_mappings),
            "mappedScenarioCount": len(mapped_scenario_ids),
            "unmappedScenarioCount": len(unmapped_scenario_ids),
            "unmappedScenarioIds": unmapped_scenario_ids,
            "dualDeviceSuiteCount": dual_device_count,
            "singleDeviceSuiteCount": single_device_count,
            "hostSuiteCount": host_count,
            "p0BacklogCount": sum(1 for item in backlog if item.get("priority") == "P0"),
            "p1BacklogCount": sum(1 for item in backlog if item.get("priority") == "P1"),
        },
    }


def export_qa_catalog(path: Path, suites: Iterable[object] | None = None) -> dict[str, object]:
    payload = build_qa_catalog(suites=suites)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exportiert den kanonischen MiniMaster-QA-Katalog.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT, help="Zielpfad fuer den exportierten QA-Katalog.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    export_qa_catalog(args.json_out)
    print(f"QA-Katalog exportiert nach {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
