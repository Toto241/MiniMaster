#!/usr/bin/env python3
"""Generate the iOS/Android parity readiness report.

The report is deliberately repository-local. It verifies the iOS source and
documentation markers that can be checked on Windows, and keeps Apple-account,
macOS/Xcode, entitlement, TestFlight, and physical-device evidence as explicit
external release blockers.
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
DEFAULT_JSON_OUT = REPO_ROOT / "build" / "ios-readiness" / "latest.json"
DEFAULT_MARKDOWN_OUT = REPO_ROOT / "build" / "ios-readiness" / "latest.md"


@dataclass(frozen=True)
class Criterion:
    id: str
    title: str
    scope: str
    severity: str
    status: str
    evidence: str
    nextAction: str
    paths: list[str]
    missingMarkers: list[str]
    gateBlocking: bool
    releaseBlocking: bool


def _read(relative_path: str) -> str:
    path = REPO_ROOT / relative_path
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def _missing_markers(relative_path: str, markers: Iterable[str]) -> list[str]:
    text = _read(relative_path).lower()
    if not text:
        return [f"file:{relative_path}", *markers]
    return [marker for marker in markers if marker.lower() not in text]


def _criterion(
    criterion_id: str,
    title: str,
    *,
    scope: str,
    severity: str,
    status: str,
    evidence: str,
    next_action: str,
    paths: list[str],
    missing: list[str] | None = None,
    gate_blocking: bool = False,
    release_blocking: bool = False,
) -> Criterion:
    return Criterion(
        id=criterion_id,
        title=title,
        scope=scope,
        severity=severity,
        status=status,
        evidence=evidence,
        nextAction=next_action,
        paths=paths,
        missingMarkers=missing or [],
        gateBlocking=gate_blocking,
        releaseBlocking=release_blocking,
    )


def _repo_criterion(
    criterion_id: str,
    title: str,
    *,
    severity: str,
    path: str,
    markers: Iterable[str],
    evidence: str,
    next_action: str,
    extra_paths: list[str] | None = None,
) -> Criterion:
    missing = _missing_markers(path, markers)
    return _criterion(
        criterion_id,
        title,
        scope="repo",
        severity=severity,
        status="pass" if not missing else "open",
        evidence=evidence,
        next_action=next_action,
        paths=[path, *(extra_paths or [])],
        missing=missing,
        gate_blocking=True,
        release_blocking=True,
    )


def collect_criteria() -> list[Criterion]:
    criteria: list[Criterion] = [
        _repo_criterion(
            "ios-parent-native-ui",
            "Native iOS parent UI covers Android owner workflows",
            severity="P1",
            path="iosMasterApp/Sources/MiniMasterParent/App/RootView.swift",
            markers=("DashboardView()", "PairingView()", "TaskListView()", "SubscriptionView()"),
            evidence="Parent SwiftUI tabs expose dashboard, child pairing, task review, and subscription management.",
            next_action="Keep the parent tab surface aligned with Android owner workflows.",
        ),
        _repo_criterion(
            "ios-child-native-ui",
            "Native iOS child UI exposes pairing, status, tasks, and Screen Time recovery",
            severity="P1",
            path="iosChildApp/Sources/MiniMasterChild/Views/MainChildView.swift",
            markers=(
                "familyControlsSection",
                "blockingManager.requestAuthorization",
                "unpairDevice()",
                "policyStore.reset()",
                "fetchTasks(childId:",
            ),
            evidence="Child SwiftUI now shows FamilyControls status/action, task list, refresh, and safe unpair cleanup.",
            next_action="Validate the flow on a physical iPhone after provisioning the Family Controls entitlement.",
            extra_paths=["iosChildApp/Sources/MiniMasterChild/Views/ChildPairingView.swift"],
        ),
        _repo_criterion(
            "ios-child-enforcement",
            "iOS child enforcement uses Screen Time APIs and cleans local shields",
            severity="P1",
            path="iosChildApp/Sources/MiniMasterChild/Services/AppBlockingManager.swift",
            markers=(
                "import ManagedSettings",
                "import FamilyControls",
                "import DeviceActivity",
                "func clearPolicy()",
                "applyShields(isLocked:",
                "ScreenTimeAppBlacklistCodec.decodeTokens",
            ),
            evidence="ManagedSettings shields, Screen-Time tokens, DeviceActivity schedule, and shield cleanup are wired in source.",
            next_action="Add DeviceActivityMonitor extension evidence before claiming daily-limit enforcement parity.",
            extra_paths=["iosChildApp/MiniMasterChild.entitlements"],
        ),
        _repo_criterion(
            "ios-child-sync-offline-heartbeat",
            "iOS child sync has offline cache, command ack, endpoint registration, and foreground heartbeat",
            severity="P1",
            path="iosChildApp/Sources/MiniMasterChild/Services/CommandSyncService.swift",
            markers=(
                "syncPolicySnapshot",
                "fetchAndApplyAllCommands",
                "acknowledgeCommand",
                "registerDeviceEndpoint",
                "reportHeartbeat",
                "startForegroundHeartbeat",
                "OfflinePolicyCache",
            ),
            evidence="Control-plane sync, FCM wake-up handling, offline policy retention, endpoint registration, and heartbeat are present.",
            next_action="Back this with remote macOS/iPhone evidence in the release register.",
            extra_paths=["iosChildApp/Sources/MiniMasterChild/Models/OfflinePolicyCache.swift"],
        ),
        _repo_criterion(
            "ios-parent-subscription",
            "iOS parent subscription flow is backed by StoreKit and backend verification",
            severity="P1",
            path="iosMasterApp/Sources/MiniMasterParent/Services/SubscriptionService.swift",
            markers=("import StoreKit", "Product.products", "verifyPurchase", "Transaction"),
            evidence="Parent app has StoreKit2 product loading, purchase, transaction finish, and backend verifyPurchase wiring.",
            next_action="Validate product IDs and sandbox purchases in App Store Connect.",
        ),
    ]

    docs_missing = []
    docs_missing.extend(_missing_markers(
        "docs/IOS_BETA_TESTING.md",
        ("Xcode 26", "iOS 26 SDK", "App Store Connect API", "TestFlight", "FamilyControls"),
    ))
    docs_missing.extend(_missing_markers(
        "docs/UI_AVAILABILITY_STATUS.md",
        ("Native iOS Parent", "Native iOS Child", "iosMasterApp", "iosChildApp"),
    ))
    docs_missing.extend(_missing_markers(
        "docs/IOS_ANDROID_PARITY_PLAN_2026-06-19.md",
        ("DeviceActivityMonitor", "Task Photo Upload", "Remote-Mac-Agent", "Family Controls entitlement"),
    ))
    criteria.append(_criterion(
        "ios-docs-current",
        "iOS release and UI documentation reflects native apps and 2026 Apple upload requirements",
        scope="repo",
        severity="P1",
        status="pass" if not docs_missing else "open",
        evidence="iOS docs distinguish native Swift apps from PWA fallback and document current App Store/TestFlight gates.",
        next_action="Update iOS beta, UI availability, and parity plan docs when Apple requirements or local evidence change.",
        paths=[
            "docs/IOS_BETA_TESTING.md",
            "docs/UI_AVAILABILITY_STATUS.md",
            "docs/IOS_ANDROID_PARITY_PLAN_2026-06-19.md",
        ],
        missing=docs_missing,
        gate_blocking=True,
        release_blocking=True,
    ))

    test_missing = []
    test_missing.extend(_missing_markers(
        "scripts/tests/test_ios_readiness.py",
        ("ios_readiness.py", "repoGateReady", "releaseReady"),
    ))
    test_missing.extend(_missing_markers(
        "iosChildApp/Tests/MiniMasterChildTests/MiniMasterChildTests.swift",
        ("familyControlsSection", "clearPolicy", "startForegroundHeartbeat"),
    ))
    criteria.append(_criterion(
        "ios-readiness-tests",
        "Repo-side iOS readiness checks are automated",
        scope="repo",
        severity="P1",
        status="pass" if not test_missing else "open",
        evidence="Python readiness report and Swift source-contract tests guard the current iOS parity surface.",
        next_action="Run npm run ios:readiness:gate before release sign-off.",
        paths=[
            "scripts/ios_readiness.py",
            "scripts/tests/test_ios_readiness.py",
            "iosChildApp/Tests/MiniMasterChildTests/MiniMasterChildTests.swift",
        ],
        missing=test_missing,
        gate_blocking=True,
        release_blocking=True,
    ))

    criteria.extend([
        _criterion(
            "ios-deviceactivity-monitor-extension",
            "Daily usage-limit parity requires a DeviceActivityMonitor extension",
            scope="planned",
            severity="P0",
            status="planned",
            evidence="AppBlockingManager starts a DeviceActivity schedule, but no monitor extension is present to enforce thresholds.",
            next_action="Create the monitor extension in Xcode, bind threshold events, and add device evidence.",
            paths=["iosChildApp/Sources/MiniMasterChild/Services/AppBlockingManager.swift"],
            gate_blocking=False,
            release_blocking=True,
        ),
        _criterion(
            "ios-task-proof-upload",
            "Task photo-proof parity requires camera/storage upload on iOS child",
            scope="planned",
            severity="P0",
            status="planned",
            evidence="Child app lists tasks, but Android-level photo proof submission is not implemented in iOS source.",
            next_action="Add PhotosUI/camera capture, Firebase Storage upload, and task_proof event submission on macOS/Xcode.",
            paths=["iosChildApp/Sources/MiniMasterChild/Views/MainChildView.swift"],
            gate_blocking=False,
            release_blocking=True,
        ),
        _criterion(
            "ios-family-controls-entitlement",
            "Family Controls entitlement must be approved and provisioned by Apple",
            scope="external",
            severity="P0",
            status="external_blocked",
            evidence="Entitlement plist is present, but Apple Developer account approval/provisioning cannot be proven from this Windows workspace.",
            next_action="Enable Family Controls, Managed Settings, and Device Activity in Apple Developer; archive provisioning evidence.",
            paths=["iosChildApp/MiniMasterChild.entitlements"],
            gate_blocking=False,
            release_blocking=True,
        ),
        _criterion(
            "ios-xcode26-testflight-build",
            "App Store/TestFlight upload requires macOS Xcode 26+ with iOS 26 SDK",
            scope="external",
            severity="P0",
            status="external_blocked",
            evidence="xcodebuild is unavailable on this Windows host; no current archive/TestFlight upload can be produced locally.",
            next_action="Run archive/export/upload on macOS with Xcode 26+ and attach build logs.",
            paths=["docs/IOS_BETA_TESTING.md"],
            gate_blocking=False,
            release_blocking=True,
        ),
        _criterion(
            "ios-physical-device-e2e",
            "iOS FamilyControls enforcement must be validated on a real child device",
            scope="external",
            severity="P0",
            status="external_blocked",
            evidence="Apple Screen Time enforcement cannot be validated in the iOS Simulator or on Windows.",
            next_action="Run pairing, lock/unlock, app token blacklist, offline policy, and TestFlight smoke on physical iPhone/iPad.",
            paths=["docs/IOS_BETA_TESTING.md"],
            gate_blocking=False,
            release_blocking=True,
        ),
        _criterion(
            "ios-app-store-connect-privacy",
            "App Store Connect records, age rating, privacy labels, and subscriptions must be configured",
            scope="external",
            severity="P0",
            status="external_blocked",
            evidence="App Store Connect cannot be inspected from the local repo; privacy/subscription evidence is not attached.",
            next_action="Create Parent/Child app records, answer privacy labels and age rating, configure products, and archive screenshots/API output.",
            paths=["docs/IOS_ANDROID_PARITY_PLAN_2026-06-19.md"],
            gate_blocking=False,
            release_blocking=True,
        ),
    ])

    return criteria


def build_report(criteria: list[Criterion] | None = None, *, generated_at: str | None = None) -> dict[str, object]:
    evaluated = criteria if criteria is not None else collect_criteria()
    repo_gate_blockers = [item for item in evaluated if item.gateBlocking and item.status != "pass"]
    release_blockers = [item for item in evaluated if item.releaseBlocking and item.status != "pass"]
    return {
        "generatedAt": generated_at or datetime.now(timezone.utc).isoformat(),
        "type": "ios-android-parity-readiness",
        "summary": {
            "total": len(evaluated),
            "passed": sum(1 for item in evaluated if item.status == "pass"),
            "repoGateOpen": len(repo_gate_blockers),
            "repoGateReady": len(repo_gate_blockers) == 0,
            "releaseOpen": len(release_blockers),
            "releaseReady": len(release_blockers) == 0,
        },
        "criteria": [asdict(item) for item in evaluated],
        "requiredExternalEvidence": [
            "Apple Developer Family Controls entitlement approval/provisioning screenshots",
            "macOS Xcode 26+ archive/export/upload logs for Parent and Child apps",
            "App Store Connect Parent and Child app records with bundle IDs",
            "TestFlight internal build processing screenshot/API evidence",
            "Physical iPhone/iPad FamilyControls E2E evidence",
            "App Store privacy labels, age rating, subscription products, and review notes",
        ],
    }


def render_markdown(report: dict[str, object]) -> str:
    summary = report["summary"]  # type: ignore[index]
    lines = [
        "# iOS Android-Paritaets-Readiness",
        "",
        f"**Generated at:** {report['generatedAt']}",
        f"**Repo gate:** {'READY' if summary['repoGateReady'] else 'OPEN'} ({summary['repoGateOpen']} offen)",
        f"**Release gate:** {'READY' if summary['releaseReady'] else 'OPEN'} ({summary['releaseOpen']} offen)",
        "",
        "## Kriterien",
        "",
        "| ID | Scope | Severity | Status | Evidence | Missing markers |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for item in report["criteria"]:  # type: ignore[index]
        missing = ", ".join(item["missingMarkers"]) or "-"
        lines.append(
            f"| {item['id']} | {item['scope']} | {item['severity']} | {item['status']} | "
            f"{item['evidence']} | {missing} |"
        )
    lines.extend([
        "",
        "## Externe Nachweise",
        "",
    ])
    for item in report["requiredExternalEvidence"]:  # type: ignore[index]
        lines.append(f"- [ ] {item}")
    lines.append("")
    return "\n".join(lines)


def write_outputs(report: dict[str, object], json_out: Path, markdown_out: Path) -> None:
    json_out.parent.mkdir(parents=True, exist_ok=True)
    markdown_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    markdown_out.write_text(render_markdown(report), encoding="utf-8")


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json-out", type=Path, default=DEFAULT_JSON_OUT)
    parser.add_argument("--markdown-out", type=Path, default=DEFAULT_MARKDOWN_OUT)
    parser.add_argument(
        "--fail-on-repo-open",
        action="store_true",
        help="Return exit code 1 when a repository-checkable iOS criterion is open.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(list(argv or sys.argv[1:]))
    report = build_report()
    write_outputs(report, args.json_out, args.markdown_out)
    print(json.dumps(report["summary"], ensure_ascii=False))
    if args.fail_on_repo_open and not report["summary"]["repoGateReady"]:  # type: ignore[index]
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
