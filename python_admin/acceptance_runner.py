# ==================== ACCEPTANCE RUNNER ====================

import json
import re
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path("/tmp/MiniMaster")
LOG_DIR = REPO_ROOT / "python_admin" / "logs"
ACCEPTANCE_RUNS_DIR = LOG_DIR / "acceptance_runs"
ACCEPTANCE_RUNS_DIR.mkdir(parents=True, exist_ok=True)

_acceptance_runs: dict[str, dict[str, object]] = {}
_acceptance_lock = threading.Lock()


def _run_acceptance_task(run_id: str, mode: str, with_coverage: bool) -> None:
    """Background task that runs lint/build/test and stores results."""
    started_at = datetime.now(timezone.utc).isoformat()
    log_lines: list[str] = []
    results: dict[str, dict[str, object]] = {
        "lint": {"passed": False, "errors": 0, "warnings": 0, "durationMs": 0},
        "build": {"passed": False, "durationMs": 0},
        "test": {"passed": False, "suitesTotal": 0, "suitesPassed": 0, "testsTotal": 0, "testsPassed": 0, "durationMs": 0},
    }
    if with_coverage:
        results["coverage"] = {"branches": 0, "functions": 0, "lines": 0, "statements": 0}

    def _run_cmd(cmd: list[str], label: str, timeout: int = 1800) -> tuple[int, str, str]:
        log_lines.append(f"[{datetime.now(timezone.utc).isoformat()}] Start: {label}")
        start = time.time()
        try:
            proc = subprocess.run(
                cmd,
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                timeout=timeout,
                encoding="utf-8",
                errors="replace",
            )
            duration = int((time.time() - start) * 1000)
            stdout = proc.stdout or ""
            stderr = proc.stderr or ""
            log_lines.append(f"[{datetime.now(timezone.utc).isoformat()}] Done: {label} (exit={proc.returncode}, {duration}ms)")
            if stderr:
                log_lines.extend(stderr.strip().split("\n")[-50:])  # last 50 lines
            return proc.returncode, stdout, stderr
        except subprocess.TimeoutExpired:
            duration = int((time.time() - start) * 1000)
            log_lines.append(f"[{datetime.now(timezone.utc).isoformat()}] TIMEOUT: {label} ({duration}ms)")
            return -1, "", f"Timeout after {timeout}s"
        except Exception as exc:
            duration = int((time.time() - start) * 1000)
            log_lines.append(f"[{datetime.now(timezone.utc).isoformat()}] ERROR: {label} — {exc}")
            return -1, "", str(exc)

    # ── Lint ──
    lint_rc, lint_out, lint_err = _run_cmd(["npm", "run", "lint"], "Lint")
    lint_errors = lint_out.count("error") + lint_err.count("error")
    lint_warnings = lint_out.count("warning") + lint_err.count("warning")
    results["lint"] = {
        "passed": lint_rc == 0,
        "errors": lint_errors,
        "warnings": lint_warnings,
        "durationMs": 0,  # updated below
    }

    # ── Test ──
    test_cmd = ["npm", "test", "--", "--silent"]
    if mode == "quick":
        test_cmd.extend(["--testPathPattern=", "(auth|pairing|device)"])
    if with_coverage:
        test_cmd.append("--coverage")
    test_rc, test_out, test_err = _run_cmd(test_cmd, "Test")

    suites_total = 0
    suites_passed = 0
    tests_total = 0
    tests_passed = 0
    for line in (test_out + test_err).split("\n"):
        # Parse Jest summary lines
        if "Test Suites:" in line:
            # "Test Suites: 91 passed, 91 total"
            parts = line.split(",")
            for part in parts:
                if "passed" in part:
                    suites_passed = int(re.search(r"(\d+)\s+passed", part).group(1)) if re.search(r"(\d+)\s+passed", part) else 0
                if "total" in part:
                    suites_total = int(re.search(r"(\d+)\s+total", part).group(1)) if re.search(r"(\d+)\s+total", part) else suites_passed
        if "Tests:" in line and "Snapshots:" not in line:
            # "Tests: 2474 passed, 2474 total"
            parts = line.split(",")
            for part in parts:
                if "passed" in part:
                    tests_passed = int(re.search(r"(\d+)\s+passed", part).group(1)) if re.search(r"(\d+)\s+passed", part) else 0
                if "total" in part:
                    tests_total = int(re.search(r"(\d+)\s+total", part).group(1)) if re.search(r"(\d+)\s+total", part) else tests_passed

    results["test"] = {
        "passed": test_rc == 0 and suites_passed >= suites_total,
        "suitesTotal": suites_total,
        "suitesPassed": suites_passed,
        "testsTotal": tests_total,
        "testsPassed": tests_passed,
        "durationMs": 0,
    }

    # ── Build (nur bei full) ──
    if mode == "full":
        build_rc, build_out, build_err = _run_cmd(["npm", "run", "build"], "Build")
        results["build"] = {
            "passed": build_rc == 0,
            "durationMs": 0,
        }
    else:
        results["build"] = {"passed": True, "durationMs": 0, "skipped": True}

    # ── Coverage parsen ──
    if with_coverage:
        cov_file = REPO_ROOT / "coverage" / "coverage-summary.json"
        if cov_file.exists():
            try:
                cov_data = json.loads(cov_file.read_text(encoding="utf-8"))
                totals = cov_data.get("total", {})
                results["coverage"] = {
                    "branches": round(totals.get("branches", {}).get("pct", 0)),
                    "functions": round(totals.get("functions", {}).get("pct", 0)),
                    "lines": round(totals.get("lines", {}).get("pct", 0)),
                    "statements": round(totals.get("statements", {}).get("pct", 0)),
                }
            except Exception:
                pass

    completed_at = datetime.now(timezone.utc).isoformat()
    status = "success" if all(r.get("passed") for r in [results["lint"], results["build"], results["test"]]) else "failed"

    run_data = {
        "runId": run_id,
        "mode": mode,
        "startedAt": started_at,
        "completedAt": completed_at,
        "status": status,
        "results": results,
        "logs": log_lines[-500:],  # keep last 500 lines
    }

    # Save to file
    run_file = ACCEPTANCE_RUNS_DIR / f"{run_id}.json"
    run_file.write_text(json.dumps(run_data, indent=2, ensure_ascii=False), encoding="utf-8")

    # Update in-memory
    with _acceptance_lock:
        _acceptance_runs[run_id] = run_data


def get_acceptance_run_status(run_id: str) -> dict[str, object] | None:
    with _acceptance_lock:
        if run_id in _acceptance_runs:
            data = dict(_acceptance_runs[run_id])
            data["logs"] = data.get("logs", [])[-50:]
            return data
    run_file = ACCEPTANCE_RUNS_DIR / f"{run_id}.json"
    if run_file.exists():
        return json.loads(run_file.read_text(encoding="utf-8"))
    return None


def get_acceptance_run_report(run_id: str) -> dict[str, object] | None:
    run_file = ACCEPTANCE_RUNS_DIR / f"{run_id}.json"
    if run_file.exists():
        return json.loads(run_file.read_text(encoding="utf-8"))
    return None


def load_acceptance_history(limit: int = 50) -> list[dict[str, object]]:
    runs: list[dict[str, object]] = []
    for f in sorted(ACCEPTANCE_RUNS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            started = data.get("startedAt", "")
            completed = data.get("completedAt", "")
            duration_ms = 0
            if started and completed:
                try:
                    t1 = datetime.fromisoformat(started.replace("Z", "+00:00"))
                    t2 = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                    duration_ms = int((t2 - t1).total_seconds() * 1000)
                except Exception:
                    pass
            runs.append({
                "runId": data.get("runId", f.stem),
                "startedAt": started,
                "status": data.get("status", "unknown"),
                "mode": data.get("mode", "unknown"),
                "durationMs": duration_ms,
            })
        except Exception:
            continue
        if len(runs) >= limit:
            break
    return runs
