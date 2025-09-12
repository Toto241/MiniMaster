<!-- High-signal instructions for AI coding agents working in MiniMaster -->
# Mini-Master: Focused Agent Guide

Backend (TypeScript Firebase Functions) + two Android apps + minimal web control. Treat backend tests + lint as primary quality gate; Android CI may be skipped when Google Maven blocked.

## Core Model
1. Authoritative logic only in Cloud Functions (`index.ts`); clients just call.
2. Active Firestore schema is FLAT: `masters`, `children`, `pairingCodes`, `pairingTokens`, nested `children/{childId}/tasks`. Ignore future `families/...` paths (explicitly denied in `firestore.rules`).
3. Pairing: `registerMasterDevice` → (`generatePairingLink` 5m token OR `createPairingCode` 24h code) → `validatePairingToken|validatePairingCode` → child doc create.
4. Differential sync: Firestore trigger `onChildDeviceUpdateV2` sends only changed keys among `isLocked`, `appBlacklist`, `usageRules` via FCM data payload.
5. Time: always `admin.firestore.Timestamp.now()`; manual epoch math for expiries (see pairing code/token).

## Dev Loop
```bash
npm install
npm run lint
npm test           # jest; mocks firebase-admin
```
Optional: `npx tsc --noEmit` (type check). CI (`.github/workflows/ci.yml`) gates Android steps behind a network probe to `dl.google.com`.

## Function Pattern
- Early input validation; throw `functions.https.HttpsError` using ONLY observed codes: `invalid-argument`, `already-exists`, `unauthenticated`, `permission-denied`, `resource-exhausted`, `deadline-exceeded`, `internal`, `not-found`, `failed-precondition` (Task state machine). See `ERROR_CODES.md` for matrix.
- Defensive cleanup of malformed / expired docs before error (see `validatePairingCode`, token flows).
- Return minimal objects (`{ success: true }`, `{ pairingCode }`, `{ childId }`). Legacy quirk: `validatePairingToken` returns `{ childId: masterImei }` (compat layer; plan deprecation → do NOT silently change without migration note).
- For new diff-synced fields: update child doc write + extend trigger diff (stringify arrays/objects) + add unit test (change + no-change case).

## Testing Conventions
- Use `firebase-functions-test` wrap: `const wrapped = testEnv.wrap(fn)`.
- Mocking: central jest mocks for `firebase-admin` Timestamp + FieldValue; mimic existing structure for new collection access via `db().collection(name)` to keep spying simple.
- Cover: success | auth failure | malformed input | expiry edge | malformed stored data (delete + error).

## Firestore Rules Awareness
- Rules allow auth-gated flat access; fine-grained auth enforced server-side (IMEI + secretKey checks).
- Tasks schema whitelist: `['description','status','photoUrl','createdAt','updatedAt','deadline','completedAt']`; adding a task field REQUIRES rule + test update BEFORE function writes it.
- Do not introduce `families/...` without a migration plan issue (dual-write + rules change + tests).

## Messaging & Payload Size
- Only include changed keys; stringify complex values. No new trigger duplicates—extend existing `onChildDeviceUpdateV2`.
- Missing or invalid `fcmToken` → log warn, no throw.

## Subscription Handling
- `verifyPurchase` calls Google Play API; sets a 30‑day expiry snapshot (no background renewal). Extending logic → ensure idempotence + add a clock-skew test scenario.

## Secrets & Deployment
```bash
firebase login
firebase use <alias>
firebase deploy --only functions,firestore,storage
```
Never commit service account JSON. New secrets: use `firebase functions:secrets:set` + document retrieval in `RUNBOOK.md`.

## Safety Checklist (Commit Gate)
1. Inputs validated with precise error codes (include `not-found` where appropriate).
2. No unintended deep collection paths.
3. Expiry logic uses server timestamp.
4. Tests for every new branch (success + each failure + no-change trigger path).
5. `npm run lint && npm test` clean.

## Escalate Before Acting If…
- You need hierarchical families data model.
- Adding new FCM sync surface beyond existing trigger.
- Introducing real device blocking (Accessibility service not implemented yet).

Stay minimal: replicate existing patterns; prefer small diffs with consistent `functions.logger` usage (info / warn / error).