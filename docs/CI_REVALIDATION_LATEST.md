# CI Revalidation Report

Generated: 2026-06-09
Repository: Toto241/MiniMaster
Validated commits: `c7039e6f9f4cfce422899428917e039a49eb25ac` (Gradle classpath hardening) and `8b471e2c5dc715909aa5b9df3818a96e986e2c9e` (dependency-submission workflow fix)

## Status Overview

| Workflow | Status | Notes |
|----------|--------|-------|
| Node CI | ✅ pass | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229989811 |
| CI | ✅ pass | Latest status for Gradle classpath hardening: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27233004247 |
| Android CI | ✅ pass | Latest status for Gradle classpath hardening: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27233004667 |
| CodeQL Security Analysis | ✅ workflow pass / ⛔ repository gate | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27229989798. GitHub Code Scanning not enabled; alerts API still returns HTTP 403. |
| Automatic Dependency Submission (Gradle) | ✅ pass | Latest status: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27233234959 |
| Gradle Dependency Submission | ✅ pass | Manual verification after workflow preflight fix: completed / success — https://github.com/Toto241/MiniMaster/actions/runs/27233258846 |
| Android Release Bundles | ✅ workflow definition fixed | `actionlint` clean and workflow registered as `Android Release Bundles`; Play-ready manual run still requires real Firebase configs and upload-key signing secrets. |

## Remaining Blockers

| Blocker | Impact | Resolution Path |
|---------|--------|-----------------|
| Code Scanning disabled | CodeQL run produces SARIF artifacts, but repository code-scanning alerts API is unavailable | Settings → Code security → Enable Code Scanning; then rerun CodeQL and verify `gh api repos/Toto241/MiniMaster/code-scanning/alerts` returns 200 |
| Physical commissioning | Go-Live gate open | Run `scripts/run-dual-device-commissioning.ps1` with adb devices |
| Play Console submission | Store gate open | Follow `docs/PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md` |

## Next Steps

1. Enable GitHub Code Scanning (Issue #158).
2. Execute physical commissioning on paired Android devices.
3. Submit Play Console package using the May 2026 submission packet.
