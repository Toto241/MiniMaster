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

**NEVER add `families/...`** – `firestore.rules` explicitly denies access. This is intentional until migration is approved (see ARCHITECTURE.md for phased migration plan).

Task document fields (enforced by rules):
```
description, status, photoUrl, createdAt, updatedAt, deadline, completedAt, masterImei, aiAnalysis
```
Extending requires: (1) update `firestore.rules` validation, (2) add unit test covering field constraints.

## Cloud Function Patterns

1. **Early validate** → throw `functions.https.HttpsError` (codes from `ERROR_CODES.md` only)
2. **Auth via `masterImei` + `secretKey`** – no Firebase Auth tokens; always re-check ownership before mutations
3. **Corrupt/expired docs**: delete document first, then throw (log with `DATA_CORRUPTION` prefix)
4. **Minimal response payloads**; preserve legacy quirk: `validatePairingToken` returns `{ childId: masterImei }` (deprecation planned: future should return `{ masterImei }`)
5. **Timestamps**: use `admin.firestore.Timestamp.now()` for reads, `FieldValue.serverTimestamp()` for writes
6. **Firebase Admin SDK**: Always access via lazy getters in `firebase.ts` (e.g., `db()`, `auth()`, `storage()`) for clean emulator support

```typescript
// Standard auth pattern (index.ts)
const masterDoc = await db().collection("masters").doc(masterImei).get();
if (!masterDoc.exists || masterDoc.data()?.secretKey !== secretKey) {
  throw new functions.https.HttpsError("unauthenticated", "Invalid master IMEI or secret key.");
}
```

## Key Flows

### Pairing Flow
```
registerMasterDevice → returns secretKey (store securely in MasterCredentialsRepository!)
    ↓
generatePairingLink (5m token, UUID) OR createPairingCode (6-digit, 24h)
    ↓
validatePairingToken/Code → creates child doc, deletes ephemeral doc, returns legacy { childId: masterImei }
    ↓
onChildDeviceUpdateV2 trigger → FCM diff push (only changed keys to child)
```

### Task State Machine
```
pending → pending_approval (completeTask: child submits photoUrl proof)
       → approved (approveTask: master reviews & approves)

Invalid transitions → throw "failed-precondition"
```

### FCM Diff Strategy (`onChildDeviceUpdateV2`)
Only sends changed fields (`isLocked`, `appBlacklist`, `usageRules`) via FCM data message. Test both "data changed" and "no change" branches to prevent redundant pushes.

### Admin/Support Access (Firestore + Claims)
- Admin users set via `setAdminClaim` function (gated by existing admin)
- `isAdmin()` helper in rules checks `request.auth.token.role == 'admin'`
- Support tickets & access grants enable scoped admin access (not blanket master data access)

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
- Use `testEnv.wrap()` to call functions; mocks are injected via `jest.spyOn()` on Firestore stubs
- Always call `testEnv.cleanup()` after each test suite to reset Firebase state

## Android Package Structure

- **masterApp**: `com.minimaster.masterapp`
  - Hilt DI (`di/`), Compose screens, ViewModels, Play Billing (`BillingClientWrapper.kt`)
  - `MasterCredentialsRepository` stores IMEI/secretKey securely (critical: must persist across app restarts)
  - Screens: Dashboard, CreateTask, TaskReview, Subscription
  - Key: subscription validation before allowing new tasks/rules

- **childApp**: `com.google.pairing` (legacy package name from initial pairing intent)
  - `RuleSyncService` – FCM receiver; processes locked/appBlacklist/usageRules updates
  - `HeartbeatWorker` – WorkManager 15min periodic task; updates `lastSeen` timestamp
  - `MiniMasterAccessibilityService` – app blocking logic (NOT yet enforcing)
  - `BlockingOverlayService` – shows block UI (stub)
  - Rules stored in SharedPreferences (read by AccessibilityService)
  - Key: emulator/real device pairing via QR code or 6-digit code

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
- [ ] Firestore rules changes: verify legacy `families/*` deny still intact
- [ ] New callable functions: include early validation + proper error codes

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

---

## Migration Roadmap (Future)

`families/*` migration blocked in `firestore.rules`. See `ARCHITECTURE.md` section 5 for phased approach: (1) Introduce families read-only via Cloud Functions, (2) Dual-write, (3) Backfill, (4) Switch reads, (5) Remove flat collections. Requires updated queries, composite indexes, and auth model changes.
