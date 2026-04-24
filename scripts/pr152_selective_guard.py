#!/usr/bin/env python3
"""Guard against unsafe regressions from PR #152.

PR #152 contains useful legal/admin ideas, but also changes that would weaken
security hardening and remove resilience/validation modules. This guard is a
small static check that prevents accidental reintroduction of those regressions.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_SECURITY_FILES = (
    "src/validation.ts",
    "src/resilience.ts",
    "src/rate-limiter.ts",
    "src/error-handler.ts",
    "test/validation.test.ts",
    "test/resilience.test.ts",
    "test/error-handler.test.ts",
)

REQUIRED_ESLINT_MARKERS = (
    "plugin:security/recommended",
    "recommended-requiring-type-checking",
    "security",
    "import",
    "@typescript-eslint/no-explicit-any",
    "@typescript-eslint/no-floating-promises",
    "security/detect-eval-with-expression",
)


@dataclass(frozen=True)
class GuardFinding:
    status: str
    severity: str
    title: str
    evidence: str
    remediation: str


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def evaluate() -> dict[str, object]:
    findings: list[GuardFinding] = []

    missing_files = [relative for relative in REQUIRED_SECURITY_FILES if not (REPO_ROOT / relative).exists()]
    findings.append(GuardFinding(
        status="done" if not missing_files else "failed",
        severity="P0",
        title="Security hardening files must not be removed",
        evidence=f"missing_files={missing_files}",
        remediation="Restore validation/resilience/rate-limiter/error-handler modules and their tests before merging.",
    ))

    eslint = read_text(REPO_ROOT / ".eslintrc.js")
    missing_eslint_markers = [marker for marker in REQUIRED_ESLINT_MARKERS if marker not in eslint]
    explicit_any_off = "@typescript-eslint/no-explicit-any" in eslint and "off" in eslint.split("@typescript-eslint/no-explicit-any", 1)[1][:80]
    findings.append(GuardFinding(
        status="done" if not missing_eslint_markers and not explicit_any_off else "failed",
        severity="P0",
        title="ESLint security and strict TypeScript rules must stay active",
        evidence=f"missing_markers={missing_eslint_markers}; explicit_any_off={explicit_any_off}",
        remediation="Keep the current hardened .eslintrc.js and do not import the weakened config from PR #152.",
    ))

    firestore_rules = read_text(REPO_ROOT / "firestore.rules")
    firestore_indexes = read_text(REPO_ROOT / "firestore.indexes.json")
    rules_too_small = len(firestore_rules.splitlines()) < 50
    indexes_too_small = firestore_indexes.count("collectionGroup") < 5
    findings.append(GuardFinding(
        status="done" if not rules_too_small and not indexes_too_small else "review_required",
        severity="P1",
        title="Firestore rules and indexes must not be reduced to an unsafe minimal state",
        evidence=f"rules_lines={len(firestore_rules.splitlines())}; collectionGroup_count={firestore_indexes.count('collectionGroup')}",
        remediation="Review Firestore rules/index changes manually and keep existing production access/index coverage.",
    ))

    monetisation_modules = [
        "admin-panel/modules/tabs/pricing-management.js",
        "admin-panel/modules/tabs/b2b-dashboard.js",
        "admin-panel/modules/tabs/affiliate-dashboard.js",
        "admin-panel/modules/tabs/revenue-analytics.js",
    ]
    missing_monetisation = [relative for relative in monetisation_modules if not (REPO_ROOT / relative).exists()]
    findings.append(GuardFinding(
        status="done" if not missing_monetisation else "review_required",
        severity="P2",
        title="Monetisation tabs must not be silently removed",
        evidence=f"missing_monetisation_modules={missing_monetisation}",
        remediation="Only remove monetisation UI after an explicit product decision and matching backend cleanup.",
    ))

    failed = [finding for finding in findings if finding.status == "failed"]
    payload = {
        "guard": "pr152_selective_guard",
        "passed": not failed,
        "failed_count": len(failed),
        "findings": [asdict(finding) for finding in findings],
    }
    return payload


def main() -> int:
    payload = evaluate()
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if payload["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
