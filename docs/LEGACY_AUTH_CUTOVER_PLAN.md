# Legacy Auth Migration Cutover Plan

Status: actionable cutover plan for decommissioning secretKey/IMEI-based authentication.

## 1. Objective

Eliminate production dependency on client-passed legacy credentials (`masterImei + secretKey`) by activating `DISABLE_LEGACY_SECRETKEY_AUTH=true` and verifying zero residual usage.

## 2. Current State

### Controlled Endpoints

| Endpoint | Legacy Pattern | Feature Flag Effect |
|----------|---------------|-------------------|
| `generateCustomToken` | `masterImei + secretKey` login | Returns `failed-precondition` when disabled |
| `registerMasterDevice` | IMEI-only registration without `context.auth` | Forces `context.auth` requirement when disabled |

### Telemetry

All legacy auth calls are recorded in `legacyAuthUsage` collection with fields: `endpoint`, `mode`, `identifier`, `timestamp`, `projectId`.

### Monitoring

Legacy usage dashboard is available in the Admin Panel under Compliance > Legacy-Auth Nutzungsmonitor.

## 3. Pre-Cutover Checklist

- [ ] All active client apps (MasterApp, web-control) support Firebase Auth login flow.
- [ ] `generateCustomToken` with `context.auth` path verified in production.
- [ ] `registerMasterDevice` with `context.auth` path verified in production.
- [ ] Legacy usage telemetry reviewed: zero calls for 14 consecutive days.
- [ ] Admin Panel Legacy-Auth Monitor shows green status.
- [ ] Rollback strategy documented and rehearsed.

## 4. Cutover Sequence

### Phase 1: Monitoring (Current)

1. Legacy telemetry is being collected.
2. Admin Panel monitors usage trends.
3. Clients are migrating to Firebase Auth flows.

### Phase 2: Soft Disable (Pre-Cutover)

1. Set `DISABLE_LEGACY_SECRETKEY_AUTH=true` in Functions environment.
2. Deploy updated functions.
3. Monitor for `failed-precondition` errors from legacy clients.
4. If errors detected: evaluate whether affected clients need update push.

### Phase 3: Hard Cutover

Precondition: Zero legacy auth usage for 14 consecutive days.

1. Confirm zero usage via Admin Panel monitor.
2. Archive final telemetry snapshot.
3. Deploy with `DISABLE_LEGACY_SECRETKEY_AUTH=true` permanently.
4. Remove legacy code paths in next release cycle (Phase 3 of AUTH_MIGRATION_PLAN.md).

## 5. Rollback Strategy

If cutover causes regression:

1. Set `DISABLE_LEGACY_SECRETKEY_AUTH=false` (or remove the env variable).
2. Redeploy functions: `firebase deploy --only functions`.
3. Verify legacy login works again via web-control panel.
4. Investigate and resolve client migration gaps before retrying.

Rollback time: under 10 minutes (environment variable change + deploy).

## 6. Post-Cutover Cleanup

After 30 days with no rollback:

1. Remove `LEGACY_AUTH_DISABLED` flag and code paths from `src/auth.ts`.
2. Remove `logLegacyAuthUsage` function.
3. Remove `legacyAuthUsage` collection (archive data first).
4. Remove `secretKey` field from `masters` documents (data migration required).
5. Update `firestore.rules` to remove `secretKey` field validation.
6. Update `LEGACY_AUTH_INVENTORY.md` to mark Phase 2 as complete.

## 7. Success Criteria

1. `DISABLE_LEGACY_SECRETKEY_AUTH=true` is active in production.
2. Zero legacy auth usage for 14+ consecutive days.
3. No increase in authentication error rates.
4. All client apps function normally with Firebase Auth.
5. Legacy usage snapshot archived for compliance records.
