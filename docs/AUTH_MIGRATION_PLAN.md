# Auth Migration Plan (SecretKey/IMEI → Firebase Auth)

## Goals
- Replace `secretKey` + IMEI authentication with Firebase Auth (OIDC/JWT).
- Enforce strict ownership and role-based access via claims.
- Remove `secretKey` usage from all clients and backend APIs.

## Phase 1 — Backend & Rules (Now)
1. **Callable Functions**
   - Require `context.auth` for all privileged actions.
   - Replace `{ masterImei, secretKey }` payloads with `context.auth.uid`.
   - Use `childId` in payload only where necessary.
2. **Claims**
   - Set `role: "master"` on registration.
   - Set `role: "admin"` for operators via `setAdminClaim`.
3. **Rules**
   - Firestore: enforce ownership checks (`request.auth.uid == docId` or `masterImei`).
   - Storage: enforce `childId` ownership and admin override.

## Phase 2 — Client Auth & Device Identity

**Status (2026-05-30):** Completed in repository.

1. **Firebase Auth**
   - Master app: anonymous Firebase Auth before backend calls (`registerAuthenticatedMaster`).
   - Child app: anonymous Firebase Auth before pairing (`pairAuthenticatedChild`).
   - Web-control: bootstrap/custom-token only; direct secretKey login removed.
   - iOS parent: `registerAuthenticatedMaster` + custom token; no local secretKey storage.
2. **Device ID**
   - Master app: stable app-scoped ID via ANDROID_ID fallback (`getStableMasterId`).
   - Child app: stable app-scoped ID via `ChildIdentityStorage.getOrCreateStableChildId`.
3. **Secrets Removal**
   - Master credentials repository stores `masterId` only; legacy `secretKey` purged on read.
   - Web panels and iOS parent no longer persist secretKey locally.

Regression guard: `test/auth-migration-phase2-completion.test.ts`.

## Phase 3 — Cleanup & Enforcement
1. **Data Migration**
   - Backfill `masters/{uid}` if legacy IDs exist.
   - Migrate `pairingTokens`/`pairingCodes` to `masterId`.
2. **Deprecation**
   - Keep `DISABLE_LEGACY_SECRETKEY_AUTH=false` as the deployment default until all
     active clients are migrated and legacy telemetry shows zero calls for 14 days.
   - Switch `DISABLE_LEGACY_SECRETKEY_AUTH=true` only as an explicit release gate.
   - Remove backward compatibility fields (`masterImei`) where no longer used.
3. **Security Testing**
   - Verify Firestore rules deny cross-tenant access.
   - Validate all APIs fail without auth token.
