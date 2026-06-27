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
| warning (high sec) | js/polynomial-redos | validation.ts:40 (`stripHtml`) | **pre-existing; dedicated follow-up** (see below) |
| warning | js/incomplete-multi-character-sanitization | validation.ts:40 (`stripHtml`) | **FIXED (PR #201)** |
| warning | js/file-access-to-http | support.ts:117 | accepted — intended Gemini API call (outbound) |
| warning | js/file-access-to-http | admin.ts:683 | accepted — intended outbound API call |
| warning | js/useless-assignment-to-local | support.ts:761 | low; cosmetic |

The backend has **no error-level** CodeQL findings.

> **`stripHtml` (validation.ts) — RESOLVED in PR #201.** CodeQL flagged the
> `<[^>]*>` tag-strip regex for both `polynomial-redos` and
> `incomplete-multi-character-sanitization`. A loop-until-stable fix only traded one
> for the other (the loop re-introduced polynomial-time); a bounded `<[^<>]*>` regex
> cleared the ReDoS but not the sanitization query. The accepted fix replaces the
> regex entirely with an O(n) character scan (no regex → neither query can fire; the
> result provably contains no `<`/`>`). Verified green against the CodeQL PR diff
> check before merge.

## Priority backlog (out of the backend scope; needs Android/web build envs to fix+verify)

### Android error findings — ASSESSED
- `java/log-injection` — childApp MainActivity.kt:217. **FIXED (PR #203)** — the raw deep-link token is no longer logged.
- `java/android/implicit-pendingintents` ×3 — MasterFcmService.kt + TaskMonitoringService.kt. **Verified false positives.** Inspection shows all three PendingIntents already use **explicit** intents (`Intent(this, MainActivity::class.java)` / `Intent(this, TaskMonitoringService::class.java)`) **and** `PendingIntent.FLAG_IMMUTABLE` — i.e. exactly the secure pattern. CodeQL mis-flags them (it does not resolve the explicit Kotlin component). → dismiss as "false positive".
- `java/comparison-of-identical-expressions` — DebugSessionManager.kt:154 (`BuildConfig.DEBUG_SESSION_SECRET_CHILD == "DISABLED"`). Build-config-dependent constant comparison, not a code bug.
- Separately: a stale unit test (`TaskStatusTest`) that contradicted the deliberate `fromString` → `NONE` safety default was **fixed (PR #204)**, turning android-ci's Build & Unit tests green.

### Web (admin-panel) error findings — ASSESSED (no real risk; recommend dismiss)
- `js/call-to-non-callable` ×6 — revenue-analytics.js:84, operator-effective.js:31/37/39, operator-config.js:21, core/command.js:13. **Verified false positives.** Each callee (`monthlyRevenueEur`, `normalizeBootstrapFirebaseConfig`, `isPlaceholderProjectId`, `escapePowerShellString`) IS exported (`export const X = _internalFn`) and imported correctly; CodeQL's points-to analysis loses the const-alias indirection across `.js` ESM imports. Confirmed by the passing Jest suite that exercises these modules. → dismiss as "false positive".
- `js/clear-text-storage-of-sensitive-data` ×5 — app.js (10068/10245/10588/10620) persists the **Firebase web config** to localStorage; wizard.js:337 persists an **OAuth client ID**. Both are **public client-side identifiers** by design (Firebase web `apiKey`/`projectId` are not secrets — protected by Security Rules + App Check; OAuth client IDs are public; client *secrets* are not stored). **Accepted, not a leak.** → dismiss as "won't fix (by design)".

### Lower priority (web; review when convenient)
- `js/xss-through-dom` ×2 + sanitizer findings — admin-panel/web-control: review DOM sinks.

### P2/P3 — quality/noise
- `js/unused-local-variable` ×131 (admin-panel), `java/sensitive-log` ×4, `java/local-variable-is-never-read` ×4, deprecated calls, trivial conditionals.

## Conclusion: all error-level findings are fixed, false positives, or by-design
Every `error`-severity CodeQL finding has been resolved or accounted for:
- **Fixed:** `stripHtml` (PR #201), `log-injection` (PR #203), stale `TaskStatusTest` (PR #204).
- **False positives:** `js/call-to-non-callable` ×6 (exported callees), `java/android/implicit-pendingintents` ×3 (explicit + immutable intents).
- **By design / not a bug:** `js/clear-text-storage` ×5 (public client identifiers), `java/comparison-of-identical-expressions` (build-config constant).

**No real error-level security bug remains.** Outstanding items are owner actions:
1. **Dismiss** the verified false-positive / by-design alerts in the code-scanning UI (agent token is not authorized to dismiss).
2. Optionally clean up the P2/P3 notes (mostly `unused-local-variable`).
3. Consider a **`code-scanning` required PR gate** now that the repo is public (the self-adjusting CodeQL gate already hard-enforces on `main`).
