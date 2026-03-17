# MiniMaster Project Hardening & Completion Plan

This document tracks the hardening status and remaining production-readiness work.

## PR #117 Summary — Hardening Update

This PR completes the following changes. Reviewers should pay attention to the areas listed below.

### Changes made

**1. Task status notifications (`src/triggers.ts`)**
- Extended `onTaskStatusChange` to notify the **child device** when a task is approved or rejected, in addition to the existing master notification when a task is submitted for review.
- Child FCM token is fetched from `children/{childId}` and used to send a targeted data message with `taskId`, `childId`, and `status` fields.
- If no FCM token is present for the child, a warning is logged and no notification is sent (no crash).

**2. Firestore rules — task schema enforcement (`firestore.rules`)**
- The previous implementation had a separate `allow create, update: if isSignedIn()` clause that allowed any authenticated user to write tasks. This has been replaced.
- Task `create` is now gated by `isMasterOfChild()` **and** inline schema validation.
- Task `update` is now gated by `isMasterOfChild() || isChildDevice()` **and** inline schema validation.
- Accepted field set updated to match the actual data model: `description`, `deadline`, `status`, `photoUrl`, `createdAt`, `completedAt`, `updatedAt`, `masterImei`, `rejectionReason`.
- Status values corrected to lowercase: `pending`, `pending_approval`, `approved`, `rejected`.
- Optional fields (`photoUrl`, `rejectionReason`, `deadline`, timestamps) validated as the correct type when present.

**3. New tests (`test/task-status-notifications.test.ts`, `test/firestore-rules.test.ts`)**
- `test/task-status-notifications.test.ts` covers:
  - Master receives notification when task moves to `pending_approval`.
  - Child receives notification when task is `approved`.
  - Child receives notification when task is `rejected`.
  - No notification is sent when status does not change.
- `test/firestore-rules.test.ts` covers:
  - Lowercase status values (`pending`, `pending_approval`, `approved`, `rejected`).
  - `photoUrl` field presence in the task schema.
  - Client writes to `pairingCodes` and `subscriptions` are denied.

### Rollout notes

- Deploy `functions` and `firestore` together (`firebase deploy --only functions,firestore`) so the rules change and the trigger update go live together.
- Verify FCM tokens are populated for test devices before exercising the notification paths.
- Run `npm test` to confirm the related test coverage stays green before deploying.
- No schema migration is required; the rules update is backwards-compatible with existing task documents.

## 1. Delivery Status (Updated)

### ✅ Implemented security hardening

- Firestore rules now enforce role- and ownership-based access instead of blanket authenticated access.
- `setAdminClaim` is protected by admin authorization checks.
- Security-focused test scenarios are documented in `docs/TEST_SCENARIOS_SECURITY.md`.

### ✅ Implemented core functionality

- Child ID is resolved via provider (`ChildIdProviderImpl`) in proof submission flow.
- Task review notifications exist for master (submission) and child (approved/rejected).
- Admin panel includes user search, pagination, and detail modals.

### ✅ Implemented UX/error handling

- Child proof upload flow surfaces upload failures via user-facing toast.
- Web/admin panels show loading states for async operations.

## 2. Remaining Gaps

### ⚠️ Environment validation gap

- Full Android unit test execution can still be blocked by local Java/Gradle mismatch depending on machine setup.
- Recommendation: enforce Java toolchain version in CI + local setup script.

### ⚠️ Optional production hardening

- Add emulator-backed Firestore rules CI tests (beyond structural assertions).
- Add screenshot-based web smoke tests to CI for UI regression detection.
- Continue migration away from any legacy client-passed secrets towards strict token-based auth only.

## 3. Next Milestone Checklist

1. Pin and verify JDK/Gradle toolchain in CI and local docs.
2. Add Firebase Emulator rules integration tests for deny/allow scenarios.
3. Keep this document in sync with release notes to avoid stale “missing” items.
