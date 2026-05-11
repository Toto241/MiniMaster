# QA Release Gap Closure Plan

Generated: 2026-05-11
Branch: `fix/qa-ci-open-gaps`

This document turns the currently open P0/P1 release blockers into an executable QA and release checklist. It is intentionally operational: every row has an owner area, expected evidence, and a completion gate.

## Scope

Covered blockers:

- GitHub Actions billing/spending limit blocks release evidence.
- GitHub Code Scanning is not enabled, so CodeQL cannot be treated as a release gate.
- Legacy `secretKey` authentication cutover is not fully closed for web-control, parent-panel and child-panel.
- Android 10-16 two-device QA evidence is still missing.
- Production Firebase, App Check, Play Console and secrets are not fully connected.
- Legal texts, consent flows and store-readiness approvals are not finalized.

Not covered here:

- Real production secrets or service-account material.
- Store publication.
- Manual legal approval itself.

## Release gate checklist

| Gate | Priority | Evidence file/location | Required result |
|------|----------|------------------------|-----------------|
| Actions billing and spending limit fixed | P0 | GitHub Actions run URL in release ticket | Workflows can start and complete |
| Code Scanning enabled | P0 | CodeQL workflow run URL and Security tab screenshot/reference | CodeQL JS and Java jobs pass or fail on real findings only |
| Legacy auth cutover | P1 | Auth tests, bootstrap-session tests, migration note | `masterImei + secretKey` login disabled outside explicit rollback flag |
| Android 10-16 matrix | P1 | QA register export plus emulator/device artifacts | Parent/Child flows pass for Android 10, 11, 12, 13, 14, 15, 16 |
| Production Firebase/App Check | P1 | Firebase setup checklist, `.firebaserc`, App Check evidence | Production project bound and all runtime checks green |
| Legal and market go/no-go | P1 | Versioned legal policy files and consent evidence | DE/EN/FR/ES/IT release texts signed off |

## Android 10-16 matrix definition

The release matrix is complete only when each Android version has at least one parent device and one child device run.

| Android | API | Parent app checks | Child app checks | Dual-device checks |
|---------|-----|-------------------|------------------|--------------------|
| 10 | 29 | install, login, pairing-code generation, lock/unlock command | install, accessibility onboarding, pairing redemption, command ack | pairing, task proof, offline cache, sync recovery |
| 11 | 30 | same as Android 10 | same as Android 10 | same as Android 10 |
| 12 | 31/32 | same as Android 10 plus notification/runtime permission review | same as Android 10 plus overlay/accessibility review | same as Android 10 |
| 13 | 33 | same as Android 12 plus notification permission | same as Android 12 plus notification permission | same as Android 10 |
| 14 | 34 | same as Android 13 plus background restriction review | same as Android 13 plus foreground/background service review | same as Android 10 |
| 15 | 35 | same as Android 14 | same as Android 14 | same as Android 10 |
| 16 | 36 | preview/beta compatibility run where image is available | preview/beta compatibility run where image is available | smoke-level dual-device run until stable images exist |

## Required evidence schema

Every matrix run should write or attach evidence with this minimum schema:

```json
{
  "runId": "qa-android-YYYYMMDD-HHMMSS-api33",
  "androidVersion": "13",
  "apiLevel": 33,
  "deviceMode": "dual-device",
  "parentDevice": "emulator-5554",
  "childDevice": "emulator-5556",
  "startedAt": "2026-05-11T10:00:00Z",
  "finishedAt": "2026-05-11T10:15:00Z",
  "status": "pass",
  "artifacts": [
    "build/test-automation/latest-summary.json",
    "build/qa-artifacts/<runId>/logcat-parent.txt",
    "build/qa-artifacts/<runId>/logcat-child.txt"
  ],
  "blockingFailures": []
}
```

## Cutover guard for legacy auth

The release-ready state is:

1. Default runtime rejects legacy `masterImei + secretKey` login.
2. Emergency rollback is possible only through a named explicit flag.
3. The flag is documented as temporary and not enabled in production.
4. Tests prove both default rejection and explicit rollback behavior.

Suggested validation commands after implementation:

```bash
npm test -- --runInBand auth
npm run test:security
npm run validate:readiness
```

## Operator execution order

1. Fix Actions billing/spending limit in GitHub account/repository settings.
2. Enable Code Scanning in GitHub security settings.
3. Close local dependency hardening: close VS Code/Electron processes, run `npm install` in root and `desktop`, then commit lockfile updates if changed.
4. Run backend and security checks.
5. Execute Android matrix from API 29 to API 36, starting with one standard profile and then full profile.
6. Attach QA register export and artifacts to the release ticket.
7. Perform production Firebase/App Check checklist.
8. Finalize legal texts and consent versioning.

## Done definition

This plan is complete when:

- All P0 issues are closed with evidence.
- Every P1 issue has a linked artifact or signed manual approval.
- `docs/CI_REVALIDATION_LATEST.md` is regenerated after a successful full revalidation.
- No release-blocking gate remains in `manual_required` or `not_run` state.
