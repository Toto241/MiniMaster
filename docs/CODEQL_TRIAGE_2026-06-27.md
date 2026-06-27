# CodeQL Triage — 2026-06-27 (first scan after going public)

After the repo became public, CodeQL/code scanning activated and produced its first
real analysis: **181 open alerts** (18 error · 25 warning · 138 note).

## By area
| Area | Alerts | Notes |
|---|---|---|
| admin-panel (web) | 152 | ~131 are `js/unused-local-variable` (note-level noise) |
| childApp (Android) | 12 | incl. error-level security findings |
| masterApp (Android) | 4 | incl. implicit-PendingIntent |
| **src/ (backend)** | **5** | all warning-level (see below) |
| web-control | 3 | |
| test / scripts / desktop | 5 | low priority |

## Backend (`src/`) — in scope
| Severity | Rule | Location | Status |
|---|---|---|---|
| warning | js/incomplete-multi-character-sanitization | validation.ts:40 | **FIXED** — `stripHtml` now loops until stable |
| warning | js/polynomial-redos | validation.ts:40 | addressed (regex is linear; documented) |
| warning | js/file-access-to-http | support.ts:117 | accepted — intended Gemini API call (outbound) |
| warning | js/file-access-to-http | admin.ts:683 | accepted — intended outbound API call |
| warning | js/useless-assignment-to-local | support.ts:761 | low; cosmetic |

The backend has **no error-level** CodeQL findings.

## Priority backlog (out of the backend scope; needs Android/web build envs to fix+verify)

### P1 — security errors (Android)
- `java/android/implicit-pendingintents` ×3 — MasterFcmService.kt:183, TaskMonitoringService.kt:165/171. Implicit, potentially-mutable PendingIntents can be hijacked → add `FLAG_IMMUTABLE`/explicit intents.
- `java/log-injection` — childApp MainActivity.kt:217. Sanitize user input before logging.
- `java/comparison-of-identical-expressions` — DebugSessionManager.kt:154. Likely a real logic bug.

### P1 — security errors (web)
- `js/clear-text-storage-of-sensitive-data` ×5 — admin-panel/app.js (10068/10245/10588/10620), wizard.js:337. Review what is persisted to localStorage/sessionStorage.
- `js/call-to-non-callable` ×6 — admin-panel modules (revenue-analytics, operator-effective, operator-config, core/command). Likely real runtime bugs.
- `js/xss-through-dom` ×2, `js/incomplete-multi-character-sanitization` ×N, `js/file-access-to-http` — admin-panel/web-control. Review DOM sinks + sanitizers.

### P2/P3 — quality/noise
- `js/unused-local-variable` ×131 (admin-panel), `java/sensitive-log` ×4, `java/local-variable-is-never-read` ×4, deprecated calls, trivial conditionals.

## Recommendation
1. Backend findings: addressed (this change).
2. Android P1 security: fix in a dedicated change with the Android toolchain (JDK 17 + SDK) so fixes can be built/tested.
3. Web (admin-panel) P1: fix the call-to-non-callable + clear-text-storage + XSS findings with the web test harness; treat the 131 unused-var notes as a cleanup sweep.
4. Consider enabling CodeQL **default setup** and/or a `code-scanning` PR gate now that the repo is public, so new findings are caught per-PR.
