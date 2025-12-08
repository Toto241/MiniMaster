<!-- High-signal instructions for AI coding agents working on MiniMaster -->
# MiniMaster Agent Guide

Parental control suite: Firebase Cloud Functions (TypeScript) + two Android apps (Kotlin/Compose) + static web panel. **Prototype status** – actual device blocking not implemented.

## Architecture Overview

```
index.ts          → All callable Cloud Functions (auth, pairing, tasks, subscription, admin)
firebase.ts       → Singleton Firebase Admin init (lazy getters: db(), auth(), storage())
firestore.rules   → Flat schema validation (families/* explicitly denied!)
masterApp/        → Parent Android app (Kotlin/Compose/Hilt/Play Billing)
childApp/         → Child Android app (FCM sync, AccessibilityService stub)
web-control/      → Static JS panel for parent actions
admin-panel/      → Admin dashboard for subscription management
test/             → Jest tests with firebase-functions-test
```

## Data Model (Flat Firestore) — CRITICAL

Collections: `masters`, `children`, `children/{childId}/tasks`, `pairingCodes`, `pairingTokens`, `subscriptions`

**NEVER add `families/...`** – `firestore.rules` explicitly denies access. This is intentional until migration is approved.

Task document fields (enforced by rules):
```
description, status, photoUrl, createdAt, updatedAt, deadline, completedAt, masterImei, aiAnalysis
```
Extending requires: update `firestore.rules` validation + add unit test.

## Cloud Function Patterns

1. **Early validate** → throw `functions.https.HttpsError` (codes from `ERROR_CODES.md` only)
2. **Auth via `masterImei` + `secretKey`** – no Firebase Auth tokens; always re-check ownership before mutations
3. **Corrupt/expired docs**: delete document first, then throw (log with `DATA_CORRUPTION` prefix)
4. **Minimal response payloads**; preserve legacy quirk: `validatePairingToken` returns `{ childId: masterImei }`
5. **Timestamps**: use `admin.firestore.Timestamp.now()` for reads, `FieldValue.serverTimestamp()` for writes

```typescript
// Standard auth pattern (index.ts)
const masterDoc = await masterDeviceRef.get();
if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
  throw new functions.https.HttpsError("unauthenticated", "Invalid master IMEI or secret key.");
}
```

## Key Flows

### Pairing Flow
```
registerMasterDevice → returns secretKey (store securely!)
    ↓
generatePairingLink (5m token, UUID) OR createPairingCode (6-digit, 24h)
    ↓
validatePairingToken/Code → creates child doc, deletes ephemeral doc
    ↓
onChildDeviceUpdateV2 trigger → FCM diff push (only changed keys)
```

### Task State Machine
```
pending → pending_approval (completeTask with photoUrl)
       → approved (approveTask by master)

Invalid transitions → throw "failed-precondition"
```

### FCM Diff Strategy (`onChildDeviceUpdateV2`)
Only sends changed fields (`isLocked`, `appBlacklist`, `usageRules`) via FCM data message. Test both change and no-change branches.

## Development Commands

```bash
# Backend (TypeScript Cloud Functions)
npm install          # Install dependencies
npm run lint         # ESLint check (must pass before deploy)
npm test             # Jest tests (mocks firebase-admin)
npm run test:watch   # Watch mode for TDD

# Deploy (after tests green)
firebase deploy --only functions,firestore,storage

# Android (from root)
./gradlew assembleDebug                    # Build both apps
./gradlew :masterApp:testDebugUnitTest     # Master app tests
./gradlew :childApp:testDebugUnitTest      # Child app tests
```

## Testing Conventions

- Use `firebase-functions-test` wrapper; see `test/setup-env.ts` for emulator config
- Mock `admin.firestore.Timestamp` as class with `now()`, `fromDate()`, `seconds`, `nanoseconds`
- Required test coverage per function:
  - Happy path
  - Auth failure (`unauthenticated`)
  - Invalid args (`invalid-argument`)
  - Expiry boundary (`deadline-exceeded`)
  - Malformed stored data (ensure cleanup + `internal` error)
  - State transitions where applicable (`failed-precondition`)

## Android Package Structure

- **masterApp**: `com.minimaster.masterapp`
  - Hilt DI (`di/`), Compose screens, ViewModels, Play Billing (`BillingClientWrapper.kt`)
  - `MasterCredentialsRepository` stores IMEI/secretKey

- **childApp**: `com.google.pairing` (legacy package name)
  - `RuleSyncService` – FirebaseMessagingService for rule pushes
  - `HeartbeatWorker` – WorkManager periodic lastSeen updates (15min)
  - `child/MiniMasterAccessibilityService` – app blocking (NOT yet enforcing)
  - Rules stored in SharedPreferences for AccessibilityService to read

## Error Codes (from ERROR_CODES.md)

| Code | When to use |
|------|-------------|
| `invalid-argument` | Missing/wrong type args (validate early) |
| `unauthenticated` | Invalid IMEI/secretKey combination |
| `permission-denied` | Master not owner of child / admin check failed |
| `not-found` | Document doesn't exist |
| `deadline-exceeded` | Expired pairing token/code |
| `failed-precondition` | Invalid task state transition |
| `already-exists` | IMEI already registered |
| `resource-exhausted` | Code collision limit (10) or free tier limit (1 child) |

## Commit Checklist

- [ ] `npm run lint && npm test` passes
- [ ] No new Firestore paths without `firestore.rules` update
- [ ] Error codes match `ERROR_CODES.md`
- [ ] FCM trigger changes: test both change and no-change branches
- [ ] No `google-services.json` or service account keys committed
- [ ] Android: `./gradlew lint` passes if Android code changed

## Key Files Reference

| File | Purpose |
|------|---------|
| `index.ts` | All Cloud Functions (~1150 lines) |
| `firebase.ts` | Singleton Admin SDK init with lazy getters |
| `firestore.rules` | Schema enforcement + `families/*` deny |
| `ERROR_CODES.md` | Allowed HttpsError codes (German) |
| `ARCHITECTURE.md` | Migration plans (flat→families) |
| `test/index.test.ts` | Main test suite patterns |
| `test/setup-env.ts` | Emulator environment config |
| `gradle/libs.versions.toml` | Android version catalog |
