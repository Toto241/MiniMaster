<!-- Compact, high-signal instructions for AI coding agents working in MiniMaster -->
# Mini-Master: Agent Operations Guide (Concise)

Focus of this repository: Firebase Cloud Functions backend (TypeScript) + two Android apps (`masterApp` parent, `childApp` child) + simple web control. Many Android CI steps may be intentionally skipped in restricted / offline environments; backend tests and lint are the reliable always-green signal.

## Core Mental Model
1. All sensitive logic lives in backend Cloud Functions (`index.ts`). Clients are thin requesters.
2. Firestore structure actually USED in functions is mostly flat (`masters`, `children`, `pairingCodes`, `pairingTokens`) although docs mention nested families—do NOT invent deeper paths unless code shows them.
3. Pairing flows: `registerMasterDevice` -> `generatePairingLink` (5‑min token) OR `createPairingCode` (6‑digit / 24h) -> validation (`validatePairingCode` / token) -> child document creation.
4. Real-time child enforcement: Changes in `children` trigger `onChildDeviceUpdateV2` (see tests) which sends selective FCM messages (only fields that changed: `isLocked`, `appBlacklist`, `usageRules`).
5. Tests mock `firebase-admin` & `db()`; follow those patterns when adding new functions—keep input validation + typed error codes.

## Fast Validation Loop (ALWAYS)
```bash
npm install        # one-time / when deps change
npm run lint       # ~5s, ignore TS version warning
npm test           # ~15–30s (jest, memory flag already set)
```
Optional type check (no emit): `npx tsc --noEmit` (silent on success).

## Adding / Modifying Cloud Functions
- Pattern: Validate arguments early; throw `functions.https.HttpsError(code, message)` with precise codes: `invalid-argument`, `already-exists`, `unauthenticated`, `permission-denied`, `resource-exhausted`, `deadline-exceeded`, `internal`.
- Use `admin.firestore.Timestamp.now()` for time; when creating expiries compute seconds manually (see `createPairingCode`). Keep retry caps (`maxAttempts=10`) to avoid infinite loops.
- Return minimal shaped objects `{ pairingCode }`, `{ childId }`, `{ success: true }`—do not embed internal timestamps.
- When reading docs: remove malformed data defensively (see validation branch deleting expired/malformed pairing codes) before throwing.

## Writing Tests (Jest)
- Wrap functions via `firebase-functions-test`: `const wrapped = testEnv.wrap(myFunctions.fnName)`.
- Mock strategy already centralized: see `index.test.ts` for collision / expiry / malformed field tests. Replicate those scenarios for new functions: success, auth failure, malformed input, edge expiry.
- Keep each new Firestore collection access behind `db().collection(name)` for easy spying.

## Android / CI Reality
- Android Gradle steps frequently fail without Google Maven (`dl.google.com`) network; do NOT “fix” by removing those jobs—document skip like existing workflow (`ci.yml` network-test step).
- Never block backend work waiting for Android build if network test fails; proceed with backend validation only.

## Firestore & Messaging Conventions
- Child updates: only send FCM fields that changed; keep payload small (`data` map with JSON-stringified arrays/objects where needed).
- Do NOT introduce writes that bypass existing collections without updating tests + security rules (`firestore.rules`).

## Files of Authority
`index.ts` (functions), `firebase.ts` (singleton initialization), `test/index.test.ts` & `test/onChildDeviceUpdateV2.test.ts` (patterns), `.github/workflows/ci.yml` (network gating), `Testanleitung.md` (manual flows), `ARCHITECTURE.md` (conceptual—but note mismatch: families nesting not yet implemented).

## Planned Data Model Migration (Families)  ❗ (Point 1)
Docs mention a hierarchical `families/{familyId}/children/{childId}` model, but current live code + rules intentionally use a flat layout (`masters`, `children`, nested `children/{id}/tasks`). A future migration would require:
- New writes duplicating data into `families/{fid}/children` OR a one-shot backfill script.
- Adjusted security rules (remove current explicit denial for `/families/**`).
- Refactor every function touching `children` / `masters` (auth assumptions: masterImei links).
Agents MUST NOT silently introduce the hierarchical path—open an explicit migration issue instead (include: phased dual-write plan, cleanup step, rule changes, test updates).

## FCM Event Strategy & Extension (Point 2)
Current push surface: single Firestore trigger `onChildDeviceUpdateV2` pushing only changed keys among: `isLocked`, `appBlacklist`, `usageRules` with small `data` payload. To add new sync fields:
1. Add field write in relevant callable (update child doc).
2. Extend diff logic (compare old vs new) and JSON.stringify if object/array.
3. Keep notification text generic unless a distinct UX path exists.
4. Add unit test: one test per new diff branch + “no-change” safeguard.
Do NOT add multiple overlapping triggers on the same path (retain single responsibility to avoid duplicate FCM sends).

## Security Rules Mapping (Point 3)
`firestore.rules` currently:
- Allows auth-gated read/write on: `masters/*`, `children/*`, `children/*/tasks/*`, `pairingCodes/*`, `pairingTokens/*` (auth = request.auth != null). Fine-grained authorization is enforced in Cloud Functions (secretKey & master-child relation), NOT in rules.
- Explicit DENY for legacy `/families/**` to prevent accidental use.
- Task create/update schema validation (restricts allowed keys) — ensure new task fields go through a rules update FIRST or tasks will fail to write.
Agent implication: When adding collections, mirror pattern: start permissive (auth required) + enforce logic server-side, then tighten later with rules & tests.

## Android Accessibility Service Gap (Point 4)
Critical parental control feature (real app blocking / foreground monitoring) is NOT implemented—only permission scaffolding exists. Do NOT implement stub logic that claims enforcement. Any addition should:
- Be introduced behind a feature flag.
- Emit explicit logs tagging scope (e.g. `ACCESS_SVC_UNIMPLEMENTED` -> future grep).
- Include design doc PR (threat model + battery impact + privacy notes) before code.

## Deployment / Environments (Point 5)
Operational references: `RUNBOOK.md`, `PRODUCTION_DEPLOYMENT.md`.
Minimal agent-safe steps (manual):
```bash
firebase login
firebase use <alias>      # ensure correct project
firebase deploy --only functions,firestore,storage
```
Secrets: Use `firebase functions:secrets:set` (do NOT hardcode). Purchase verification depends on Google Play API creds via ADC. Never embed service account JSON in repo.
If adding new secret usage → add retrieval pattern (ADC or secret manager) + doc line in RUNBOOK.

## Function → Collections → Side Effects (Point 6)
| Function | Collections Read | Collections Write | Other Side Effects |
|----------|------------------|-------------------|--------------------|
| createPairingCode | pairingCodes (exist check) | pairingCodes (create) | log |
| validatePairingCode | pairingCodes | pairingCodes (delete) | log |
| registerMasterDevice | masters | masters (create) | log, uuid |
| generatePairingLink | masters, pairingTokens | pairingTokens (create) | uuid, log |
| setDeviceLocked | masters, children | children (update) | log |
| updateAppBlacklist | masters, children | children (update) | log |
| setUsageRules | masters, children | children (update) | log |
| recordHeartbeat | children | children (update lastSeen) | log |
| registerFcmToken | children | children (update fcmToken) | log |
| onChildDeviceUpdateV2 (trigger) | children (before/after) | (none explicit) | getMessaging().send selective FCM |
| createTask | masters, children | children/*/tasks (create) | log |
| completeTask | children/*/tasks | children/*/tasks (update) | log |
| approveTask | masters, children/*/tasks | children/*/tasks (update) | log |
| verifyPurchase | masters | masters (update subscription) | Google Play API call |
| getSubscriptionStatus | masters | (none) | — |
| validatePairingToken | pairingTokens | children (create), pairingTokens (delete) | log |

When adding a new function, decide: (a) does it mutate existing doc (update) vs create subcollection doc? (b) does it require FCM push extension? (c) security rule coverage? Add rows accordingly.

## Common Pitfalls
- Documentation mentions nested `families/{familyId}/children` but current implementation uses top-level `children` & `masters`. Stay consistent unless performing a coordinated migration (would require rules + data changes + tests).
- Ignore TypeScript version support warning (<5.6.0) – do NOT downgrade; existing toolchain works.
- Avoid adding heavy logic in tests; prefer simple mocks/spies like existing suites.

## Safe Extension Checklist (before commit)
1. Input validation added? (`typeof` checks + clear error code)
2. No accidental deep Firestore paths?
3. Expiry logic uses server timestamp, not client Date.now?
4. Added tests: success + each distinct failure branch.
5. `npm run lint && npm test` passes locally.

## When Unsure
Search in `index.ts` for similar pattern and replicate structure (logging, error handling, defensive deletes). Prefer minimal diff; keep logging via `functions.logger` consistent (info for expected, warn for user misuse, error for unexpected).

---
If you need clarification on: (a) planned migration to nested families model, (b) adding new FCM event types, or (c) Android-side service gaps (Accessibility Service), ask the maintainer before proceeding.