# Security Policy

> **Note:** This document provides a foundational security overview. The threat model is a basic draft and should be actively maintained and expanded as the application evolves.

This document outlines the security policies and considerations for the Mini-Master project.

## Threat Model (STRIDE)

A basic threat model should be maintained here.

- **Spoofing:**
  - *Threat:* An unauthorized user pretends to be a parent or child.
  - *Mitigation:* All callable Cloud Functions require authentication via a secret key (`masterApp`) or will require custom auth tokens (`childApp`).
- **Tampering:**
  - *Threat:* Data (e.g., a task's status) is modified illicitly.
  - *Mitigation:* Firestore rules prevent direct client writes. All mutations go through Cloud Functions which validate the request. Field-level validation in rules prevents malformed data.
- **Repudiation:**
  - *Threat:* A user denies performing an action.
  - *Mitigation:* Key events (e.g., task creation, approval) should have `createdAt` and `updatedAt` server timestamps, creating an audit trail.
- **Information Disclosure:**
  - *Threat:* A user gains access to data belonging to another parent/child pair.
  - *Mitigation:* (Current) Logic-layer checks in Cloud Functions enforce that a `masterImei` + `secretKey` pair controls only its linked children. Firestore rules themselves are coarse (authenticated access). Future migration: role / family claims + rule hardening.
- **Denial of Service:**
  - *Threat:* A user uploads excessively large files to incur costs or overload the system.
  - *Mitigation:* Storage rules enforce a 5MB limit on uploads. Cloud Functions have built-in rate limiting and timeout mechanisms.
- **Elevation of Privilege:**
  - *Threat:* A child user performs an action only a parent should be able to.
  - *Mitigation:* Currently prevented indirectly because privileged calls require `masterImei` + `secretKey` which the child app does not possess. Future: explicit role-bearing tokens / custom claims.

## Data Classification

- **Public:** None.
- **Confidential (User-facing):** Task descriptions, child device status.
- **Secret (Internal):** `secretKey` for master device, FCM tokens, purchase tokens.

## Secrets & Credentials Management

- **`secretKey` (master device credential):** UUID v4, single factor + IMEI. Improvement needed: rotation endpoint, replay protection, optional binding to signed Android attestation.
- **`google-services.json`:** Not committed; required at build time.
- **Git hygiene enforcement:** `**/google-services.json` is git-ignored; only `google-services.template.json` placeholders are versioned.
- **Service Account (Play API):** Must be stored in secret manager / CI secret store. Never embed JSON in code. Production deployments should rely on Application Default Credentials (ADC) instead of bundling keys.
- **Future Hardening:** Replace `secretKey` with short-lived signed tokens (e.g. custom auth tokens + role claims) and enforce claims in Firestore rules.

## Vulnerability Reporting

Please report any security vulnerabilities to `security@minimaster.app`. We will acknowledge receipt within 48 hours.

---

## Current Weaknesses (To Track)

| Area | Current State | Desired Future |
|------|---------------|----------------|
| Auth Model | IMEI + static secret (frozen, see below) | Rotatable, scoped tokens + roles |
| Firestore Rules | Auth present = allow (logic in functions) | Principle-of-least-privilege + claim checks |
| Least Privilege | No separation of duties | Parent/Child roles + limited child operations |
| Transport of Secret | Stored locally; not rotated | Add expiration + rotation flow |
| Subscription Integrity | Single verification call | Scheduled renewal + revocation listener |

---

## v2.2.0 Security Hardening (implemented)

### Legacy Auth Freeze

New policy (`LEGACY_AUTH_INVENTORY.md`): No new Cloud Functions may use `secretKey`/IMEI-based authentication. All new endpoints **must** use `context.auth` (Firebase Authentication). Existing legacy endpoints are inventoried and scheduled for phased migration.

The environment variable `DISABLE_LEGACY_SECRETKEY_AUTH=true` can be set to reject all legacy login attempts at runtime, forcing callers through Firebase Auth.

### Session Timeout

All operator and master web panels enforce aligned session policies (AP-N3):

| Panel | Idle timeout | Max session | Re-auth |
|-------|-------------|-------------|---------|
| `admin-panel` | 15 min | 8 h (+ T3/T4 tiers) | Password + Admin-PIN for critical ops |
| `web-control`, `parent-panel`, `child-panel` | 15 min | 8 h | Auto-logout (custom-token sessions) |

Master panels use `shared-ui-session-manager.js`; the operator dashboard uses `admin-panel/modules/core/session-manager.js`. On expiry, users are signed out via `firebase.auth().signOut()`.

### Content Security Policy (CSP)

CSP headers are configured in `firebase.json` for all hosting targets:
- `default-src 'self'`
- `script-src 'self'` (no inline scripts unless `'unsafe-inline'` required for legacy)
- `connect-src` whitelisted to Firebase APIs, Resend API
- `frame-ancestors 'none'` (equivalent to X-Frame-Options: DENY)

Additional headers enforced: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (HSTS).

### Photo URL SSRF Prevention

`completeTask` validates that `photoUrl`:
- Matches the Firebase Storage URL pattern (`https://firebasestorage.googleapis.com/...`)
- Does not exceed 2048 characters
- Rejects arbitrary URLs to prevent Server-Side Request Forgery (SSRF) in downstream AI analysis (`analyzeTaskPhoto`)

### Operator Access Key System

Operator role assignment uses SHA-256 hashed one-time keys (`createOperatorAccessKey` / `redeemOperatorAccessKey`) with:
- Configurable TTL (1–10080 minutes)
- Single-use enforcement (transaction-based redemption)
- Bootstrap exception: first admin key creatable without existing admin
- Keys never stored in plaintext (only SHA-256 hash persisted)

### Firebase App Check

App Check integration prepared in admin-panel (`appcheck-init.js`). Requires a valid reCAPTCHA v3 site key in production. The placeholder key is guarded and will not activate App Check until configured.

### Audit Logging

All security-relevant operations (role changes, account resets, support access grants/revocations, legal consent, data export/deletion) are logged via `AuditLogger` to the `audit_logs` Firestore collection with:
- Caller UID, role, IP (where available)
- Action name, target resource, timestamp
- Duration and operation-specific metadata

### CodeQL Automated Scanning

GitHub CodeQL runs on every push/PR to `main` and weekly, scanning TypeScript and Java/Kotlin for:
- Injection vulnerabilities (SQL, XSS, SSRF)
- Insecure crypto usage
- Credential exposure
- Custom queries in `codeql-custom-queries-actions/`

---

> This document reflects prototype security; do not treat current measures as production-grade without implementing the listed future improvements.

*This is a foundational security document. It should be regularly reviewed and updated as the application evolves.*
