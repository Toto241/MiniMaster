#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterable


REPO_ROOT = Path(__file__).resolve().parent.parent
IS_WINDOWS = os.name == "nt"
DEFAULT_SUMMARY_PATH = REPO_ROOT / "build" / "test-automation" / "latest-summary.json"
IGNORED_INVENTORY_PARTS = {".git", ".venv", "node_modules", "build", "coverage", "lib", ".gradle"}
SECURITY_ENV_FILES = (
    REPO_ROOT / ".security-test.env",
    REPO_ROOT / "scripts" / "security-test.env",
)


def npm_command() -> str:
    return "npm.cmd" if IS_WINDOWS else "npm"


def adb_command() -> str:
    return "adb.exe" if IS_WINDOWS else "adb"


def gradle_wrapper() -> Path:
    return REPO_ROOT / ("gradlew.bat" if IS_WINDOWS else "gradlew")


def resolve_android_sdk() -> Path | None:
    candidates = [os.environ.get("ANDROID_HOME"), os.environ.get("ANDROID_SDK_ROOT")]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return Path(candidate)

    local_properties = REPO_ROOT / "local.properties"
    if not local_properties.exists():
        return None

    for line in local_properties.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("sdk.dir="):
            value = line.split("=", 1)[1].strip().replace("\\:", ":").replace("\\\\", "\\")
            sdk_path = Path(value)
            if sdk_path.exists():
                return sdk_path
    return None


def java_available() -> bool:
    java_home = os.environ.get("JAVA_HOME")
    if java_home and (Path(java_home) / "bin" / ("java.exe" if IS_WINDOWS else "java")).exists():
        return True
    return shutil.which("java") is not None


def java_version_for_home(java_home: Path) -> int | None:
    java_binary = java_home / "bin" / ("java.exe" if IS_WINDOWS else "java")
    if not java_binary.exists():
        return None
    result = subprocess.run(
        [str(java_binary), "-version"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    text = (result.stdout or "") + (result.stderr or "")
    marker = 'version "'
    if marker not in text:
        return None
    version_text = text.split(marker, 1)[1].split('"', 1)[0]
    major = version_text.split('.', 1)[0]
    try:
        return int(major)
    except ValueError:
        return None


def supported_android_java_home() -> Path | None:
    candidates: list[Path] = []

    for env_name in ("JAVA17_HOME", "JAVA21_HOME", "JAVA_HOME"):
        value = os.environ.get(env_name)
        if value:
            candidates.append(Path(value))

    if IS_WINDOWS:
        candidates.extend(
            [
                Path("C:/Program Files/Android/Android Studio1/jbr"),
                Path("C:/Program Files/Android/Android Studio/jbr"),
                Path("C:/Program Files/Java/jdk-17"),
                Path("C:/Program Files/Java/jdk-21"),
                Path("C:/Program Files/Eclipse Adoptium/jdk-21.0.10.7-hotspot"),
                Path("C:/Users/torst/.vscode/extensions/redhat.java-1.53.0-win32-x64/jre/21.0.10-win32-x86_64"),
            ]
        )

    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen or not candidate.exists():
            continue
        seen.add(candidate)
        version = java_version_for_home(candidate)
        if version in {17, 21}:
            return candidate
    return None


def command_exists(name: str) -> bool:
    return shutil.which(name) is not None


def has_connected_adb_device() -> bool:
    adb = adb_command()
    if not command_exists(adb):
        return False
    result = subprocess.run(
        [adb, "devices"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return False
    lines = [line.strip() for line in result.stdout.splitlines()[1:] if line.strip()]
    return any(line.endswith("\tdevice") for line in lines)


def is_ignored_inventory_path(path: Path) -> bool:
    return any(part in IGNORED_INVENTORY_PARTS for part in path.parts)


def inventory_counts() -> dict[str, object]:
    def count(pattern: str) -> int:
        matches = []
        for candidate in REPO_ROOT.glob(pattern):
            relative = candidate.relative_to(REPO_ROOT)
            if is_ignored_inventory_path(relative):
                continue
            matches.append(candidate)
        return len(matches)

    return {
        "platform": platform.platform(),
        "backend_test_files": count("test/**/*.test.ts"),
        "android_unit_test_files": count("masterApp/src/test/**/*.kt") + count("childApp/src/test/**/*.kt"),
        "android_instrumentation_test_files": count("masterApp/src/androidTest/**/*.kt") + count("childApp/src/androidTest/**/*.kt"),
        "python_tooling_files": count("**/*.py"),
        "documentation_files": count("docs/**/*.md") + count("*.md"),
    }


def ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def resolved_security_env() -> dict[str, str]:
    resolved: dict[str, str] = {}
    for env_file in SECURITY_ENV_FILES:
        resolved.update(load_env_file(env_file))
    for key in (
        "SECURITY_TEST_ADMIN_EMAIL",
        "SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED",
        "SECURITY_TEST_FUNCTIONS_DEPLOYED",
        "SECURITY_TEST_SERVICE_ACCOUNT",
    ):
        env_value = os.environ.get(key)
        if env_value and env_value.strip():
            resolved[key] = env_value.strip()
    return resolved


def has_security_ci_inputs() -> bool:
    values = resolved_security_env()
    return all(
        bool(values.get(name, "").strip())
        for name in (
            "SECURITY_TEST_ADMIN_EMAIL",
            "SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED",
            "SECURITY_TEST_FUNCTIONS_DEPLOYED",
        )
    )


def has_security_service_account() -> bool:
    exists, _ = security_service_account_status()
    return exists


def security_service_account_status() -> tuple[bool, str | None]:
    values = resolved_security_env()
    configured = values.get("SECURITY_TEST_SERVICE_ACCOUNT", "").strip()
    if configured:
        candidate = Path(configured)
        if not candidate.is_absolute():
            candidate = REPO_ROOT / configured
        if candidate.exists():
            return True, None
        return (
            False,
            (
                "Security service account file not found at "
                f"{candidate}. Set SECURITY_TEST_SERVICE_ACCOUNT in "
                ".security-test.env or scripts/security-test.env, or place serviceAccountKey.json in repo root."
            ),
        )

    fallback = REPO_ROOT / "serviceAccountKey.json"
    if fallback.exists():
        return True, None
    return (
        False,
        (
            "serviceAccountKey.json missing for security runner at "
            f"{fallback}. Set SECURITY_TEST_SERVICE_ACCOUNT in .security-test.env "
            "or scripts/security-test.env, or add serviceAccountKey.json to repo root."
        ),
    )


def check_security_service_account_prereq() -> tuple[bool, str | None]:
    return security_service_account_status()


def prepare_command(command: list[str]) -> list[str]:
    if IS_WINDOWS and command and command[0].lower().endswith(".bat"):
        return ["cmd", "/c", *command]
    return command


def build_process_env(suite: Suite) -> dict[str, str]:
    env = os.environ.copy()
    if suite.group in {"android", "device"}:
        java_home = supported_android_java_home()
        if java_home is not None:
            env["JAVA_HOME"] = str(java_home)
            env["PATH"] = str(java_home / "bin") + os.pathsep + env.get("PATH", "")
    if suite.suite_id == "backend-security":
        env.update(resolved_security_env())
    return env


@dataclass(frozen=True)
class Suite:
    suite_id: str
    title: str
    group: str
    command: list[str]
    required_prereqs: tuple[str, ...]
    timeout_sec: int = 0


@dataclass
class SuiteResult:
    suite_id: str
    title: str
    group: str
    status: str
    duration_sec: float
    returncode: int | None
    command: list[str]
    reason: str | None = None
    stdout: str = ""
    stderr: str = ""


PREREQ_CHECKS: dict[str, Callable[[], tuple[bool, str | None]]] = {
    "npm": lambda: (command_exists(npm_command()), f"{npm_command()} not found in PATH."),
    "node_modules": lambda: ((REPO_ROOT / "node_modules").exists(), "node_modules is missing. Run npm install first."),
    "java": lambda: (java_available(), "Java not found. Configure JAVA_HOME or install a supported JDK."),
    "android_sdk": lambda: (resolve_android_sdk() is not None, "Android SDK not found. Set ANDROID_HOME/ANDROID_SDK_ROOT or local.properties."),
    "adb": lambda: (command_exists(adb_command()), f"{adb_command()} not found in PATH."),
    "adb_device": lambda: (has_connected_adb_device(), "No connected Android device or emulator detected via adb."),
    "gradle_wrapper": lambda: (gradle_wrapper().exists(), f"Gradle wrapper not found at {gradle_wrapper()}."),
    "android_java": lambda: (
        supported_android_java_home() is not None,
        "No supported Android JDK found. Configure JAVA17_HOME/JAVA21_HOME or install Java 17/21.",
    ),
    "security_ci_inputs": lambda: (
        has_security_ci_inputs(),
        "Security CI inputs missing. Set SECURITY_TEST_ADMIN_EMAIL, SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED and SECURITY_TEST_FUNCTIONS_DEPLOYED.",
    ),
    "security_service_account": check_security_service_account_prereq,
}


SUITES: tuple[Suite, ...] = (
    Suite("backend-build", "TypeScript build", "backend", [npm_command(), "run", "build"], ("npm", "node_modules")),
    Suite("backend-lint", "ESLint", "backend", [npm_command(), "run", "lint"], ("npm", "node_modules")),
    Suite("backend-jest", "Jest backend suite", "backend", [npm_command(), "run", "test:ci"], ("npm", "node_modules")),
    Suite("backend-rules-structural", "Firestore rules structural", "backend", [npm_command(), "run", "test:rules:structural"], ("npm", "node_modules")),
    Suite("backend-rules-emulator", "Firestore rules emulator", "backend", [npm_command(), "run", "test:rules:emulator"], ("npm", "node_modules", "java"), timeout_sec=1800),
    Suite("backend-security", "Security regression script", "backend", [npm_command(), "run", "test:security:ci"], ("npm", "node_modules", "security_ci_inputs", "security_service_account"), timeout_sec=1800),
    Suite("android-task-translation-check", "Child task translation completeness", "android", [sys.executable, str(REPO_ROOT / "scripts" / "sync_child_task_translations.py")], tuple()),
    Suite("android-lint", "Android lint", "android", [str(gradle_wrapper()), "lint"], ("gradle_wrapper", "android_java", "android_sdk"), timeout_sec=3600),
    Suite("android-unit-master", "masterApp unit tests", "android", [str(gradle_wrapper()), ":masterApp:testDebugUnitTest"], ("gradle_wrapper", "android_java", "android_sdk"), timeout_sec=3600),
    Suite("android-unit-child", "childApp unit tests", "android", [str(gradle_wrapper()), ":childApp:testDebugUnitTest"], ("gradle_wrapper", "android_java", "android_sdk"), timeout_sec=3600),
    Suite("android-instrumentation-build-master", "masterApp instrumentation build", "android", [str(gradle_wrapper()), ":masterApp:assembleDebugAndroidTest"], ("gradle_wrapper", "android_java", "android_sdk"), timeout_sec=3600),
    Suite("android-instrumentation-build-child", "childApp instrumentation build", "android", [str(gradle_wrapper()), ":childApp:assembleDebugAndroidTest"], ("gradle_wrapper", "android_java", "android_sdk"), timeout_sec=3600),
    Suite("android-connected-master", "masterApp connected test", "device", [str(gradle_wrapper()), ":masterApp:connectedDebugAndroidTest", "-Pandroid.testInstrumentationRunnerArguments.class=com.minimaster.masterapp.MasterAppE2ETest"], ("gradle_wrapper", "android_java", "android_sdk", "adb", "adb_device"), timeout_sec=3600),
    Suite("android-connected-child", "childApp connected test", "device", [str(gradle_wrapper()), ":childApp:connectedDebugAndroidTest", "-Pandroid.testInstrumentationRunnerArguments.class=com.google.pairing.PairingScreenUITest"], ("gradle_wrapper", "android_java", "android_sdk", "adb", "adb_device"), timeout_sec=3600),
    Suite("release-revalidate", "Release gate revalidation", "release", [npm_command(), "run", "ci:revalidate"], ("npm", "node_modules"), timeout_sec=3600),
)


def suite_map() -> dict[str, Suite]:
    return {suite.suite_id: suite for suite in SUITES}


def resolve_selection(groups: list[str], suites: list[str]) -> list[Suite]:
    by_id = suite_map()
    selected: list[Suite] = []
    if groups:
        wanted = set(groups)
        selected.extend(suite for suite in SUITES if suite.group in wanted or "all" in wanted)
    if suites:
        for suite_id in suites:
            suite = by_id.get(suite_id)
            if suite is None:
                raise SystemExit(f"Unknown suite id: {suite_id}")
            if suite not in selected:
                selected.append(suite)
    if not selected:
        selected = [suite for suite in SUITES if suite.group in {"backend", "android"}]
    return selected


def check_prereqs(required_prereqs: Iterable[str]) -> tuple[bool, str | None]:
    for prereq in required_prereqs:
        check = PREREQ_CHECKS[prereq]
        ok, reason = check()
        if not ok:
            return False, reason
    return True, None


def truncate_output(text: str, limit: int = 12000) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...[truncated]...\n" + text[-limit:]


def run_suite(suite: Suite, strict_skips: bool) -> SuiteResult:
    ok, reason = check_prereqs(suite.required_prereqs)
    if not ok:
        return SuiteResult(
            suite_id=suite.suite_id,
            title=suite.title,
            group=suite.group,
            status="failed" if strict_skips else "skipped",
            duration_sec=0.0,
            returncode=None,
            command=suite.command,
            reason=reason,
        )

    started = time.perf_counter()
    completed = subprocess.run(
        prepare_command(suite.command),
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=build_process_env(suite),
        timeout=suite.timeout_sec if suite.timeout_sec > 0 else None,
        check=False,
    )
    duration = time.perf_counter() - started
    return SuiteResult(
        suite_id=suite.suite_id,
        title=suite.title,
        group=suite.group,
        status="passed" if completed.returncode == 0 else "failed",
        duration_sec=round(duration, 2),
        returncode=completed.returncode,
        command=suite.command,
        stdout=truncate_output(completed.stdout),
        stderr=truncate_output(completed.stderr),
    )


def print_inventory() -> None:
    print(json.dumps(inventory_counts(), indent=2))


def print_suite_list() -> None:
    for suite in SUITES:
        prereqs = ", ".join(suite.required_prereqs)
        print(f"{suite.suite_id:35} {suite.group:8} {suite.title} [{prereqs}]")


def print_results(results: list[SuiteResult]) -> None:
    for result in results:
        print(f"[{result.status.upper():7}] {result.suite_id} ({result.group})")
        if result.reason:
            print(f"  reason: {result.reason}")
        else:
            print(f"  duration: {result.duration_sec:.2f}s, returncode: {result.returncode}")


def write_summary(path: Path, selected: list[Suite], results: list[SuiteResult]) -> None:
    ensure_parent_dir(path)
    payload = {
        "generated_at_epoch": int(time.time()),
        "repo_root": str(REPO_ROOT),
        "inventory": inventory_counts(),
        "selected_suites": [suite.suite_id for suite in selected],
        "results": [asdict(result) for result in results],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def overall_exit_code(results: list[SuiteResult], strict_skips: bool) -> int:
    if any(result.status == "failed" for result in results):
        return 1
    if strict_skips and any(result.status == "skipped" for result in results):
        return 2
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Central MiniMaster test automation runner.")
    parser.add_argument("--group", action="append", choices=["backend", "android", "device", "release", "all"], help="Run all suites in a group.")
    parser.add_argument("--suite", action="append", default=[], help="Run a specific suite id.")
    parser.add_argument("--list", action="store_true", help="List known suites and exit.")
    parser.add_argument("--inventory", action="store_true", help="Print inventory summary and exit.")
    parser.add_argument("--json-out", type=Path, default=DEFAULT_SUMMARY_PATH, help="Write JSON summary to this path.")
    parser.add_argument("--strict-skips", action="store_true", help="Treat skipped suites as failures.")
    parser.add_argument("--continue-on-fail", action="store_true", help="Continue after a failing suite.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.inventory:
        print_inventory()
        return 0

    if args.list:
        print_suite_list()
        return 0

    selected = resolve_selection(args.group or [], args.suite or [])
    results: list[SuiteResult] = []
    for suite in selected:
        result = run_suite(suite, strict_skips=args.strict_skips)
        results.append(result)
        print_results([result])
        if result.status == "failed" and not args.continue_on_fail:
            break

    write_summary(args.json_out, selected, results)
    print(f"Summary written to {args.json_out}")
    return overall_exit_code(results, strict_skips=args.strict_skips)


if __name__ == "__main__":
    sys.exit(main())
