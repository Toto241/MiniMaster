# CI Revalidation Report

Generated: 2026-05-30
Repository: Toto241/MiniMaster

## Status Overview

| Workflow | Status | Notes |
|----------|--------|-------|
| Node CI (`test`) | ✅ pass | Local security/commissioning suites green (2026-05-30) |
| PR152 Guard (`guard:pr152`) | ✅ pass | All P0/P1/P2 checks pass |
| Local security evidence | ✅ pass | `npm run security:evidence:collect` → `build/security-evidence/latest-summary.json` |
| Local commissioning evidence | 🔄 partial | Backend automated checks pass; physical device pending |
| CodeQL JavaScript | ❌ fail | Code Scanning not enabled — enable via Settings → Code security (Issue #158) or `npm run code-scanning:enable` |
| CodeQL Java | ❌ fail | Same blocker as JavaScript matrix job |
| Android CI (`android`) | ⚠️ conditional | Network health check skips build when `dl.google.com` unreachable |

## Repo-side automation added (2026-05-30)

1. `scripts/enable-code-scanning.ps1` + `npm run code-scanning:enable`
2. `scripts/collect-security-evidence.ps1` + `npm run security:evidence:collect`
3. `scripts/collect-commissioning-evidence.ps1` + `npm run commissioning:evidence:collect`
4. CodeQL workflow: `workflow_dispatch` + SARIF artifact upload fallback

## Remaining Blockers

| Blocker | Impact | Resolution Path |
|---------|--------|-----------------|
| Code Scanning disabled | CodeQL SARIF upload rejected | Settings → Code security → Enable Code Scanning; then `npm run code-scanning:enable -TriggerWorkflow` |
| Physical commissioning | Go-Live gate open | Run `scripts/run-dual-device-commissioning.ps1` with adb devices |
| Play Console submission | Store gate open | Follow `docs/PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md` |

## Next Steps

1. Enable GitHub Code Scanning (Issue #158).
2. Execute physical commissioning on paired Android devices.
3. Submit Play Console package using the May 2026 submission packet.
