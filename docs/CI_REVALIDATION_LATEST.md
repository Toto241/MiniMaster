# CI Revalidation Report

Generated: 2026-06-09
Repository: Toto241/MiniMaster
Commit: `e391dab8c9f2e7552349fce5278e4e59250f7bda`

## Status Overview

| Workflow | Status | Notes |
|----------|--------|-------|
| Node CI | ✅ pass | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229989811 |
| CI | ✅ pass | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229989397 |
| Android CI | ✅ pass | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229989412 |
| CodeQL Security Analysis | ✅ workflow pass / ⛔ repository gate | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229989798. GitHub Code Scanning not enabled; alerts API still returns HTTP 403. |
| Automatic Dependency Submission (Gradle) | ✅ pass | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229986021 |
| Android Release Bundles | ✅ workflow definition fixed | `actionlint` clean and workflow registered as `Android Release Bundles`; Play-ready manual run still requires real Firebase configs and upload-key signing secrets. |

## Remaining Blockers

| Blocker | Impact | Resolution Path |
|---------|--------|-----------------|
| Code Scanning disabled | CodeQL run produces SARIF artifacts, but repository code-scanning alerts API is unavailable | Settings → Code security → Enable Code Scanning; then rerun CodeQL and verify `gh api repos/Toto241/MiniMaster/code-scanning/alerts` returns 200 |
| Dependabot Gradle alerts | GitHub still reports open alerts from `settings.gradle` despite successful dependency submission | Review GitHub dependency graph output after refresh and close/resolve remaining Gradle advisory mappings |
| Physical commissioning | Go-Live gate open | Run `scripts/run-dual-device-commissioning.ps1` with adb devices |
| Play Console submission | Store gate open | Follow `docs/PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md` |

## Next Steps

1. Enable GitHub Code Scanning (Issue #158).
2. Resolve or suppress remaining Gradle dependency alerts with evidence.
3. Execute physical commissioning on paired Android devices.
4. Submit Play Console package using the May 2026 submission packet.
