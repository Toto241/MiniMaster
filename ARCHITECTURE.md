# Architecture Document

> **Note:** This document is a work in progress. It is missing a formal C4 context diagram and detailed sequence diagrams for key user flows.

This document outlines the high-level architecture of the Mini-Master application suite.

## 1. High-Level Diagram (C4 - Context)

A context diagram should be placed here, showing the main components and their interactions:

- **Parent User** -> `masterApp`
- **Child User** -> `childApp`
- `masterApp` <-> **Firebase Backend**
- `childApp` <-> **Firebase Backend**
- **Firebase Backend** <-> **Google Play API**

## 2. Component Breakdown (Current State vs Intended)

### 2.1. `masterApp` (Parent App)

- **Purpose:** Allows parents to manage devices, set rules, create tasks, and review proofs.
- **Tech:** Kotlin, Jetpack Compose, Hilt, WorkManager, Google Play Billing Library.
- **Key Screens:** Registration, Dashboard, Create Task, Review Task, Subscription.

### 2.2. `childApp` (Child App)

- **Purpose:** Receives rule state (lock flag, app blacklist structure, usage rules object), displays tasks, uploads photo proof, heartbeat ping.
- **Tech:** Kotlin / Jetpack Compose / Hilt.
- **Key Components (implemented):**
  - `RuleSyncService` (FCM-triggered sync)
  - `HeartbeatWorker` (lastSeen updates)
  - `MiniMasterAccessibilityService` (foreground monitoring, app blocking, usage limits)
  - `BlockingOverlayService` (overlay-based app blocking)
- **Remaining gaps:** Robust offline policy cache with conflict resolution, stronger anti-tamper hardening, and broader device-level E2E validation.

### 2.3. Firebase Backend

- **Cloud Functions (TypeScript):** Core business logic. Key functions include pairing, task lifecycle, subscription verification.
- **Firestore:** Flat schema (see section 4). Security rules rely on auth presence; fine-grained auth enforced in functions.
- **Firebase Storage:** Photo proof storage.
- **Firebase Cloud Messaging (FCM):** Diff-based child device updates.

## 3. Key Architectural Decisions & Patterns

- **Server-Authoritative Logic:** All mutations gated by callable functions (argument validation + secretKey checks). Clients remain thin.
- **FCM Diff Strategy:** `onChildDeviceUpdateV2` computes *minimal* changed fields (lock, blacklist, usage rules) → reduces payload & avoids redundant updates.
- **Flat Firestore Schema (Interim):** Active collections: `masters`, `children`, nested `children/{id}/tasks`, `pairingCodes`, `pairingTokens`. Legacy/in-progress hierarchical `families/*` path intentionally disabled in `firestore.rules`.
- **Strict Expiry Semantics:** Pairing tokens (5 min) vs 6-digit codes (24 h); expired or malformed docs deleted proactively.
- **MVVM + Hilt:** ViewModels isolate UI; injection used but not security-critical.

## 4. Data Model (Firestore – Current vs Planned)

### Current (Implemented)

```text
masters/{imei}
children/{childImei}
children/{childImei}/tasks/{taskId}
pairingTokens/{uuid}
pairingCodes/{6digit}
```
Child document fields (selected): `masterImei`, `isLocked`, `appBlacklist` (array), `usageRules` (object), `fcmToken`, `lastSeen`.

### Planned (Not Implemented Yet)

```text
families/{familyId}
  children/{childId}
  tasks/{taskId}
```
Blocked until: migration design (dual-write + backfill), updated rules, updated queries, test refactor.

## 5. Migration Considerations (Flat → Hierarchical Families)

| Aspect | Current | Future Target | Migration Notes |
|--------|---------|---------------|-----------------|
| Ownership Linking | child.masterImei | familyId + relation doc | Introduce mapping layer first |
| Security Rules | Auth-only + function-level auth | Role-based + claim checks | Requires new auth model (claims) |
| Queries | Direct collection scans | Scoped under family | Add composite indexes post-move |
| Triggers | on children/{childId} | families/{fid}/children/{childId} | Maintain both during transition |
| Code Paths | Direct `children` reads | Resolver by family context | Provide adapter util |

Phased approach recommended: (1) Introduce families collection w/ deny rules lifted only for read via Cloud Functions. (2) Dual-write. (3) Backfill. (4) Switch reads. (5) Remove flat collections.

## Compliance and retention status

- Legal policy publishing and re-consent enforcement run on dedicated Cloud Functions with Firestore-backed `legalPolicies` and `masterLegalConsents` collections.
- DSAR export and account deletion must cover compliance side-data in addition to the core profile domain, especially `masterLegalConsents`, `supportTickets`, `supportAccessGrants`, and user-scoped observability collections.
- Audit and error logs are prepared for Firestore TTL rollout via per-document `ttl` timestamps; `performance_metrics` remains the next observability collection to align.

## 5.1. Backend Module Overview

The Cloud Functions backend is split into domain modules under `src/`:

| Module | File | Purpose | Key Exports |
|--------|------|---------|-------------|
| **Auth** | `src/auth.ts` | Registration, token generation, operator key management, account reset | `registerMasterDevice`, `generateCustomToken`, `createOperatorAccessKey`, `redeemOperatorAccessKey`, `resetOperatorAccounts`, `resetAllAuthUsers` |
| **Pairing** | `src/pairing.ts` | Master-child pairing via codes and tokens | `createPairingCode`, `validatePairingCode`, `generatePairingLink`, `validatePairingToken` |
| **Rules** | `src/rules.ts` | Device lock, app blacklist, usage rules, heartbeat, FCM registration | `setDeviceLocked`, `updateAppBlacklist`, `setUsageRules`, `getRulesForChild`, `recordHeartbeat`, `registerFcmToken` |
| **Tasks** | `src/tasks.ts` | Task CRUD and photo proof lifecycle | `createTask`, `completeTask`, `approveTask`, `rejectTask` |
| **Subscription** | `src/subscription.ts` | Play Store purchase verification, subscription status, scheduled expiry | `verifyPurchase`, `getSubscriptionStatus`, `revokeSubscription`, `checkExpiredSubscriptions` |
| **Support** | `src/support.ts` | AI-assisted tickets, debug access, email follow-up, scheduled grant cleanup | `createSupportTicket`, `grantDebugAccess`, `skipDebugMode`, `processUserReplyMessage`, `analyzeWithDebugData`, `getDebugInfo`, `onTicketCreated`, `onSupportTicketUpdated` |
| **Legal** | `src/legal.ts` | GDPR consent, legal policy publishing, re-consent enforcement | `getActiveLegalPolicies`, `needsLegalReconsent`, `recordLegalConsent`, `publishLegalPolicy`, `markLegalReconsentRequired` |
| **Admin** | `src/admin.ts` | Health check, error analysis, auto-fix, knowledge base, FCM testing | `adminHealthCheck`, `analyzeSystemErrors`, `executeAutoFix`, `getKnowledgeBase`, `updateKnowledgeBase`, `sendTestFcmMessage` |
| **Triggers** | `src/triggers.ts` | Firestore-triggered FCM diff push, task photo analysis | `onChildDeviceUpdateV2`, `analyzeTaskPhoto`, `onTaskStatusChange` |
| **Shared** | `src/shared.ts` | `requireAdmin()`, `AuditLogger`, role types | Internal utilities used by all modules |
| **Entrypoint** | `index.ts` | Re-exports all callable functions + triggers | — |
| **Init** | `firebase.ts` | Singleton Firebase Admin SDK (lazy getters: `db()`, `auth()`, `storage()`) | `db`, `auth`, `storage` |

## 6. Gaps & Future Work

- Hardening of enforcement engine (OEM-specific behavior, bypass resistance, battery optimization handling)
- Subscription renewal / entitlement revocation scheduler
- Photo proof validation (size/content)
- Structured auth (token claims replacing raw secret keys)
- Metrics & audit logging pipeline (beyond functions.logger)

## 7. Sequence (Conceptual) – Pairing (Current)

1. Master: `registerMasterDevice` → receives `secretKey`.
2. Master: `generatePairingLink` (5m token) OR `createPairingCode` (6-digit / 24h).
3. Child: submits token/code + its IMEI (`validatePairingToken` / `validatePairingCode`).
4. Backend: creates child doc, deletes ephemeral token/code, returns linkage confirmation.
5. Subsequent state changes (lock, blacklist, usageRules) propagate via trigger → FCM diff payload.

---
*This document reflects current prototype boundaries. Update when migration or enforcement engine designs are approved.*
