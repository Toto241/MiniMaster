# MiniMaster Project Hardening & Completion Plan

This document tracks the hardening status and remaining production-readiness work.

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
