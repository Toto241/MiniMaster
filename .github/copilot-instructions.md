<!-- High-signal instructions for AI coding agents working on MiniMaster -->
# MiniMaster Agent Guide

Parental control suite: Firebase Cloud Functions (TypeScript) + two Android apps (Kotlin/Compose) + static web panel. **Prototype status** – actual device blocking not implemented.

## Architecture Overview

```
index.ts          → All callable Cloud Functions (auth, pairing, tasks, subscription)
firebase.ts       → Singleton Firebase Admin init (lazy getters: db(), auth(), storage())
firestore.rules   → Flat schema validation (families/* denied)
masterApp/        → Parent Android app (Kotlin/Compose/Hilt)
childApp/         → Child Android app (receives rules via FCM, no enforcement yet)
web-control/      → Static JS panel for parent actions
test/             → Jest tests with firebase-functions-test
```

## Data Model (Flat Firestore)

Collections: `masters`, `children`, `children/{childId}/tasks`, `pairingCodes`, `pairingTokens`

**Do NOT add `families/...`** – rules explicitly deny. Task fields allowed: `description, status, photoUrl, createdAt, updatedAt, deadline, completedAt, masterImei`. Extending requires: `firestore.rules` update + unit test.

## Cloud Function Patterns

1. **Early validate** → throw `functions.https.HttpsError` (codes from `ERROR_CODES.md` only)
2. **Auth via `masterImei` + `secretKey`** – no Firebase Auth tokens; re-check ownership before mutations
3. **Corrupt/expired docs**: delete then throw (log with `DATA_CORRUPTION` prefix)
4. **Minimal response payloads**; preserve `validatePairingToken` quirk: `{ childId: masterImei }`
5. **Timestamps**: use `admin.firestore.Timestamp.now()` or `FieldValue.serverTimestamp()`

```typescript
// Pattern example from index.ts
if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
  throw new functions.https.HttpsError("unauthenticated", "Invalid master IMEI or secret key.");
}
```

## Pairing Flow

```
registerMasterDevice → secretKey
    ↓
generatePairingLink (5m token) OR createPairingCode (6-digit, 24h)
    ↓
validatePairingToken/Code → creates child doc, deletes ephemeral doc
    ↓
onChildDeviceUpdateV2 trigger → FCM diff push (only changed keys)
```

## Task State Machine

```
pending → pending_approval (completeTask) → approved (approveTask)
Invalid transitions → failed-precondition
```

## Development Commands

```bash
npm install          # Install dependencies
npm run lint         # ESLint check
npm test             # Jest tests (mocks firebase-admin)
firebase deploy --only functions,firestore,storage  # Deploy after green tests
firebase functions:secrets:set KEY                  # Manage secrets
```

## Testing Conventions

- Use `firebase-functions-test` wrapper; see `test/setup-env.ts` for emulator env vars
- Mock `admin.firestore.Timestamp` as class with `now()`, `fromDate()`, `seconds/nanoseconds`
- Cover: happy path, auth failure, invalid args, expiry boundary, malformed stored data (ensure cleanup), state transitions (`failed-precondition`)
- No deep collection paths in tests

## Android Notes

- **masterApp**: `com.minimaster.masterapp` – Hilt DI, Compose screens, Play Billing
- **childApp**: `com.google.pairing` (+ `.child` subpackage) – FCM sync via `RuleSyncService`, `MiniMasterAccessibilityService` for app blocking
- `getRulesForChild` function allows child device to pull current rules from backend
- CI network probe skips Android build if `dl.google.com` unreachable (expected in restricted envs)
- Run locally: `./gradlew assembleDebug`, `./gradlew testDebugUnitTest`

## Error Codes Reference

| Code | Usage |
|------|-------|
| `invalid-argument` | Missing/wrong type args (early throw) |
| `unauthenticated` | Invalid IMEI/secretKey combo |
| `permission-denied` | Master not owner of child |
| `not-found` | Document doesn't exist |
| `deadline-exceeded` | Expired pairing token/code |
| `failed-precondition` | Invalid task state transition |
| `already-exists` | IMEI already registered |
| `resource-exhausted` | 10 pairing code collisions |

## Commit Checklist

- [ ] `npm run lint && npm test` green
- [ ] No new collection paths without rules update
- [ ] Error codes match `ERROR_CODES.md`
- [ ] New FCM diff fields added to trigger + tests (change/no-change branches)
- [ ] No service account JSON committed

## Key Files

- `index.ts` – All Cloud Functions
- `firebase.ts` – Admin SDK init pattern
- `firestore.rules` – Schema enforcement
- `ERROR_CODES.md` – Allowed HttpsError codes
- `ARCHITECTURE.md` – Migration plans (flat→families)
- `test/index.test.ts` – Jest test patterns
