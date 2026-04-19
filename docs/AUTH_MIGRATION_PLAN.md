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
1. **Firebase Auth**
   - Master app: sign in via Firebase Auth before calling backend (anonymous or full account).
   - Child app: sign in via Firebase Auth before pairing.
2. **Device ID**
   - Replace IMEI usage with Android ID (or Firebase Installation ID).
3. **Secrets Removal**
   - Remove `secretKey` from all UI and storage.
   - Remove IMEI/secretKey fields in web panel.

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
