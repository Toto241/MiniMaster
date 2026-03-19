# Legacy Auth Inventar: secretKey/IMEI-basierte Authentifizierung

> **Richtlinie:** Keine neuen Endpunkte mit secretKey/IMEI-Auth. Alle neuen Funktionen MÜSSEN `context.auth` verwenden (siehe AUTH_MIGRATION_PLAN.md).

## Status: EINGEFROREN (Freeze)

Die bestehende secretKey/IMEI-basierte Authentifizierung wird nicht erweitert.
Alle neuen Cloud Functions nutzen ausschließlich Firebase Auth (`context.auth`).

---

## 1. Funktionen mit secretKey/IMEI-Auth (Legacy)

### `generateCustomToken` (src/auth.ts)
- **Pattern:** `data.masterImei` + `data.secretKey` → Firestore-Lookup `masters/{masterImei}` → `secretKey`-Vergleich → Custom Token
- **Zweck:** Web-Control-Login (Eltern-Panel)
- **Migration:** Phase 2 — Eltern-Panel auf Firebase Auth UI umstellen

### `registerMasterDevice` (src/auth.ts)
- **Pattern:** Legacy-Fallback erlaubt Registrierung ohne `context.auth` nur über `imei`; bevorzugt ist authentifizierte Registrierung (`context.auth.uid`).
- **Zweck:** Erstregistrierung eines Eltern-Geräts
- **Migration:** Phase 2 — IMEI durch Firebase Installation ID / Android ID ersetzen

## 1.1 Legacy-Freeze Steuerung (neu)

- `DISABLE_LEGACY_SECRETKEY_AUTH=true`
	- Deaktiviert in `generateCustomToken` den Legacy-Login via `masterImei + secretKey`.
	- Deaktiviert in `registerMasterDevice` den IMEI-only Fallback ohne `context.auth`.
- Legacy-Nutzungstelemetrie wird best-effort in `legacyAuthUsage` geschrieben (`endpoint`, `mode`, `identifier`, `timestamp`).

## 2. Funktionen mit context.auth (Modern) — bereits migriert

| Funktion | Datei | Auth-Pattern |
|----------|-------|-------------|
| `setAdminClaim` | src/auth.ts | `requireAdmin(context)` |
| `setUserRole` | src/auth.ts | `requireAdmin(context)` |
| `bootstrapFirstAdmin` | src/auth.ts | `context.auth` + listUsers-Check |
| `revokeUserTokens` | src/auth.ts | `requireAdmin(context)` |
| `generatePairingLink` | src/pairing.ts | `requireAuth(context)` |
| `createPairingCode` | src/pairing.ts | `requireAuth(context)` |
| `validatePairingToken` | src/pairing.ts | Public (Token-basiert) |
| `validatePairingCode` | src/pairing.ts | Public (Code-basiert) |
| `updateChildDevice` | src/device.ts | `requireMasterOwnership(context, childId)` |
| `setChildLock` | src/device.ts | `requireMasterOwnership(context, childId)` |
| `setAppBlacklist` | src/device.ts | `requireMasterOwnership(context, childId)` |
| `setUsageRules` | src/device.ts | `requireMasterOwnership(context, childId)` |
| `reportChildStatus` | src/device.ts | `requireAuth(context)` |
| `createTask` | src/tasks.ts | `requireMasterOwnership(context, childId)` |
| `completeTask` | src/tasks.ts | `requireAuth(context)` |
| `approveTask` | src/tasks.ts | `requireMasterOwnership(context, childId)` |
| `rejectTask` | src/tasks.ts | `requireMasterOwnership(context, childId)` |
| `createSupportTicket` | src/support.ts | `requireAuth(context)` |
| `addTicketMessage` | src/support.ts | `requireAuth(context)` |
| `revokeSupportAccess` | src/support.ts | `requireAuth(context)` |
| `rateSupportTicket` | src/support.ts | `requireAuth(context)` |
| `deleteUserAccount` | src/admin.ts | `requireAdmin(context)` |
| `getAuditLogs` | src/admin.ts | `requireAdmin(context)` |
| Alle Admin-BI-Funktionen | src/admin.ts | `requireAdmin(context)` |

## 3. Datenfelder mit Legacy-Referenz

| Collection | Feld | Verwendung |
|------------|------|-----------|
| `masters` | `secretKey` | Legacy-Auth Vergleichswert (nur für verbleibenden Fallback in `generateCustomToken`) |
| `masters` | (doc ID = masterImei) | Legacy-Geräte-ID |
| `children` | `masterImei` | Owner-Zuordnung zum Master |
| `children/{id}/tasks` | `masterImei` | Task-Ersteller-Referenz |
| `pairingCodes` | `masterId` / `masterImei` | Pairing-Zuordnung |
| `pairingTokens` | `masterId` / `masterImei` | Pairing-Zuordnung |
| `supportTickets` | `masterImei` | Ticket-Ersteller |
| `supportAccessGrants` | `masterImei` | Grant-Zuordnung |

## 4. Client-Nutzung

### MasterApp (Android)
- `MasterCredentialsRepository`: speichert aktuell `masterImei` (und historisch `secretKey`) lokal
- `registerMasterDevice` wird bei Erststart aufgerufen
- Alle API-Aufrufe nutzen Firebase Auth nach `generateCustomToken`-Login

### Web-Control
- Login-Formular: `masterImei` + `secretKey` → `generateCustomToken`
- Nach Login: Firebase Auth Token für alle weiteren Aufrufe

### Admin-Panel
- Rein Firebase Auth basiert (Email/Password) — KEIN Legacy-Auth

---

## Migrations-Reihenfolge

Siehe [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md) für die detaillierte Phasenplanung.

**Kurzfassung:**
1. ~~Phase 1: Backend auf `context.auth` umstellen~~ → **Größtenteils erledigt** (Legacy-Fallback in `generateCustomToken` und optional in `registerMasterDevice` nur noch kontrolliert via Feature-Flag)
2. Phase 2: Clients auf Firebase Auth UI umstellen, IMEI durch Firebase Installation ID ersetzen
3. Phase 3: Legacy-Felder entfernen, Daten migrieren
