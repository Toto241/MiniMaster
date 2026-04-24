# CI Revalidation Report

Generated: 2026-04-24 14:00:00 +02:00
Repository: Toto241/MiniMaster

## Status Overview

| Workflow | Status | Notes |
|----------|--------|-------|
| Node CI (`test`) | ✅ pass | 89 suites, 2429 tests, 0 errors |
| PR152 Guard (`guard:pr152`) | ✅ pass | All P0/P1/P2 checks pass |
| Lint (`lint`) | ✅ pass | 0 errors, ~16k warnings (existing) |
| Firebase Functions (`functions`) | ✅ pass | Build & lint OK |
| Firestore Rules | ✅ pass | Rules validation OK |
| Android CI (`android`) | ⚠️ conditional | Network health check skips build when `dl.google.com` unreachable |
| Android Instrumentation | ⏭️ skipping | Requires emulator matrix |
| CodeQL JavaScript | ❌ fail | Code Scanning not enabled — repository owner must enable in Settings → Code security (Issue #158) |
| CodeQL Java | ❌ fail | Code Scanning not enabled — repository owner must enable in Settings → Code security (Issue #158) |
| Submit Gradle | ✅ pass | Gradle wrapper validation OK |

## Changes Applied

1. **ESLint Errors Fixed** (Commit auf main)
   - `test/admin-panel-remaining-modules.test.ts`: removed unused vars
   - `test/manual-test-conversions.test.ts`: prefixed unused args with `_`
   - `test/admin-panel-gap-fillers.test.ts`: quote style fix

2. **CI Workflow Resilience** (Commit `64e5618`)
   - `android-ci.yml`: added network health check for `dl.google.com`
   - `codeql-analysis.yml`: added network health check for Java CodeQL Android build

3. **PR #152 Selective Integration Complete**
   - PR #157 merged (Legal Drafts + Android Localisation)
   - PR #152 closed (original diverged branch)

4. **Security Hardening P3 Applied**
   - Root `package.json`: Electron `^36.4.0` → `^41.3.0`
   - Desktop `package.json`: Electron `^31.0.0` → `^41.3.0`, electron-builder `^24.13.3` → `^26.8.1`
   - `engines.node`: `22` → `>=22`
   - `overrides` added for `@tootallnate/once` and `uuid` transitive dependency vulnerabilities
   - Pending: `npm install` cannot complete because `node_modules\electron\dist\resources\default_app.asar` is locked by another Windows process (likely VS Code); see `docs/SECURITY_HARDENING_P3.md`

## Remaining Blockers

| Blocker | Impact | Resolution Path |
|---------|--------|-----------------|
| Code Scanning disabled | CodeQL checks fail on every PR | Repository Settings → Enable Code Scanning (Issue #158) |
| `dl.google.com` unreachable | Android CI skips build when network down | Workflow now handles gracefully; root cause is GitHub Actions infrastructure |
| npm audit vulnerabilities (2) | 1 high (Electron → config upgraded to 41.3.0), 1 moderate (firebase-admin chain → overrides applied) | Pending `npm install` to resolve; see `docs/SECURITY_HARDENING_P3.md` |

## Next Steps

1. Enable GitHub Code Scanning to resolve CodeQL failures permanently.
2. Evaluate Electron upgrade path (36.9.5 → 41.x) for desktop launcher security.
3. Evaluate firebase-admin dependency chain cleanup.
