# MiniMaster API Documentation

This document provides comprehensive documentation for all Cloud Functions in the MiniMaster Firebase backend.

## Authentication

Most Cloud Functions require an authenticated Firebase user context.

- Device ownership and authorization are enforced via server-side checks (`masterId`/`childId`, `secretKey`, ownership relations).
- `generateCustomToken` additionally supports web-control login via `masterImei + secretKey`.
- Field names like `imei`, `masterImei`, `childImei` are legacy API names and currently carry app-scoped stable device IDs (not Telephony IMEI reads in Android apps).

## Cloud Functions

### 1. createPairingCode

Creates a unique 6-digit pairing code for a child device.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string  // Required: Unique identifier for the child device
}
```

**Response**:
```typescript
{
  pairingCode: string  // 6-digit numeric code (e.g., "123456")
}
```

**Errors**:
- `invalid-argument`: Missing or invalid `childId` parameter
- `resource-exhausted`: Failed to generate unique code after 10 attempts
- `internal`: Unexpected error during code generation

**Example Usage**:
```javascript
const functions = getFunctions();
const createPairingCode = httpsCallable(functions, 'createPairingCode');

try {
  const result = await createPairingCode({ childId: 'child-device-123' });
  console.log('Pairing code:', result.data.pairingCode);
} catch (error) {
  console.error('Error:', error.code, error.message);
}
```

### 2. validatePairingToken

Validates a pairing token and creates the master-child relationship.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  pairingToken: string,  // Required: Token from QR code or manual entry
  // Child is resolved from authenticated caller (uid)
}
```

**Response**:
```typescript
{
  childId: string,
  masterId: string
}
```

**Errors**:
- `invalid-argument`: Missing required parameters
- `not-found`: Invalid or non-existent pairing token
- `deadline-exceeded`: Pairing token has expired (>24 hours old)
- `already-exists`: Child device already paired with another master
- `internal`: Unexpected error during validation

**Example Usage**:
```javascript
const validatePairingToken = httpsCallable(functions, 'validatePairingToken');

try {
  const result = await validatePairingToken({
    pairingToken: 'abc123def456'
  });
  console.log('Pairing result:', result.data.childId, result.data.masterId);
} catch (error) {
  console.error('Pairing failed:', error.code, error.message);
}
```

### 3. registerMasterDevice

Registers a new master (parent) device in the system.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  imei: string,           // Required: Master device IMEI
  deviceName?: string,    // Optional: Human-readable device name
  fcmToken?: string       // Optional: FCM token for push notifications
}
```

**Response**:
```typescript
{
  success: boolean,
  message: string
}
```

### 4. updateMasterDevice

Updates master device information including FCM token.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  imei: string,           // Required: Master device IMEI
  deviceName?: string,    // Optional: Updated device name
  fcmToken?: string       // Optional: Updated FCM token
}
```

### 5. registerChildDevice

Registers a new child device in the system.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  imei: string,           // Required: Child device IMEI
  deviceName?: string,    // Optional: Human-readable device name
  fcmToken?: string       // Optional: FCM token for push notifications
}
```

### 6. updateChildDevice

Updates child device information and settings.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  imei: string,           // Required: Child device IMEI
  deviceName?: string,    // Optional: Updated device name
  fcmToken?: string,      // Optional: Updated FCM token
  isLocked?: boolean,     // Optional: Device lock status
  allowedApps?: string[]  // Optional: Array of allowed app package names
}
```

### 7. setDeviceLocked

Locks or unlocks a child device. Change is propagated via `onChildDeviceUpdateV2` FCM trigger.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  isLocked: boolean       // Required: true to lock, false to unlock
}
```

**Response**:
```typescript
{
  success: boolean,
  isLocked: boolean
}
```

**Errors**:
- `invalid-argument`: Missing or invalid `childId` / `isLocked`
- `not-found`: Master account not found
- `permission-denied`: Master not authorized for this child
- `internal`: Unexpected error

### 8. updateAppBlacklist

Updates the list of blocked apps for a child device.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  appBlacklist: string[]  // Required: Array of blocked app package names
}
```

**Response**:
```typescript
{
  success: boolean
}
```

**Errors**:
- `invalid-argument`: Missing or invalid parameters
- `not-found`: Master account not found
- `permission-denied`: Master not authorized for this child

### 9. setUsageRules

Sets daily usage limits and bedtime rules for a child device.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  usageRules: {
    dailyLimit?: number,  // Daily screen time limit in minutes
    bedtimeStart?: string,// Bedtime start (HH:MM format)
    bedtimeEnd?: string   // Bedtime end (HH:MM format)
  }
}
```

**Response**:
```typescript
{
  success: boolean
}
```

**Errors**:
- `invalid-argument`: Invalid time format or parameters
- `not-found`: Master account not found
- `permission-denied`: Master not authorized for this child

### 10. getRulesForChild

Retrieves lock state, app blacklist, and usage rules for a child device.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string         // Required: Child device ID
}
```

**Response**:
```typescript
{
  isLocked: boolean,
  appBlacklist: string[],
  usageRules: object
}
```

**Errors**:
- `invalid-argument`: Missing `childId`
- `not-found`: Child device not found
- `permission-denied`: Not owner master or child device itself

### 11. recordHeartbeat

Child device reports online status. Updates `lastSeen` timestamp.

**Function Type**: `httpsCallable`

**Parameters**: None (uses `context.auth.uid` as child ID)

**Response**:
```typescript
{
  success: boolean
}
```

### 12. registerFcmToken

Child device registers its FCM token for push notifications.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  token: string           // Required: FCM registration token
}
```

**Response**:
```typescript
{
  success: boolean
}
```

### 13. updateFCMToken

Master device updates its FCM token.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  fcmToken: string        // Required: Updated FCM token
}
```

**Response**:
```typescript
{
  success: boolean
}
```

### 14. reportDailyUsage

Child device reports daily screen time to `usageHistory` subcollection.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  date: string,           // Required: Date string (e.g., "2026-03-20")
  usageMillis: number     // Required: Total usage in milliseconds
}
```

**Response**:
```typescript
{
  success: boolean
}
```

**Errors**:
- `invalid-argument`: Missing or invalid `date` / `usageMillis`

### 15. reportTamperEvent

Child device reports tamper/bypass attempts (e.g., AccessibilityService disabled). Sends FCM alert to parent.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  eventType: string,      // Required: Type of tamper event
  timestamp: number       // Required: Event timestamp (epoch ms)
}
```

**Response**:
```typescript
{
  success: boolean
}
```

**Errors**:
- `invalid-argument`: Missing parameters
- `permission-denied`: Child not authorized
- `not-found`: Child document not found

## Task Functions

### createTask

Creates a new task assigned to a child device.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  description: string,    // Required: Task description
  deadlineISO: string,    // Required: Deadline as ISO date string
  unlockDuration?: number // Optional: Minutes to unlock device after approval
}
```

**Response**:
```typescript
{
  success: boolean,
  taskId: string
}
```

**Errors**:
- `invalid-argument`: Missing required fields or invalid `unlockDuration`
- `not-found`: Master account not found
- `permission-denied`: Master not authorized for this child
- `resource-exhausted`: No active subscription or trial

### completeTask

Child submits proof (photo) for task completion. Transitions status from `pending` → `pending_approval`.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  taskId: string,         // Required: Task ID
  photoUrl: string        // Required: Firebase Storage URL (validated, max 2048 chars)
}
```

**Response**: `{ success: boolean }`

**Errors**:
- `invalid-argument`: Missing fields or invalid `photoUrl`
- `not-found`: Task doesn't exist
- `failed-precondition`: Task not in `pending` state

### approveTask

Master approves a submitted task. Transitions status from `pending_approval` → `approved`.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  taskId: string          // Required: Task ID
}
```

**Response**: `{ success: boolean }`

**Errors**:
- `invalid-argument`: Missing required fields
- `not-found`: Master or task not found
- `permission-denied`: Master not authorized
- `failed-precondition`: Task not in `pending_approval` state

### rejectTask

Master rejects a submitted task. Transitions status from `pending_approval` → `rejected`.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  childId: string,        // Required: Child device ID
  taskId: string,         // Required: Task ID
  reason?: string         // Optional: Rejection reason
}
```

**Response**: `{ success: boolean }`

**Errors**:
- `invalid-argument`: Missing required fields
- `not-found`: Master or task not found
- `permission-denied`: Master not authorized
- `failed-precondition`: Task not in `pending_approval` state

## Pairing Functions

### generatePairingLink

Generates a UUID-based pairing token with 5-minute expiry.

**Function Type**: `httpsCallable`

**Parameters**: None (uses `context.auth.uid`)

**Response**:
```typescript
{
  pairingToken: string    // UUID token
}
```

**Errors**:
- `not-found`: Master not found
- `resource-exhausted`: No active subscription or trial

## Subscription Functions

### verifyPurchase

Verifies a Google Play subscription purchase and activates it.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  purchaseToken: string,  // Required: Google Play purchase token
  sku: string             // Required: Subscription SKU
}
```

**Response**: `{ success: boolean, subscriptionStatus: "active" }`

### getSubscriptionStatus

Returns current subscription status, trial countdown, and child limit.

**Function Type**: `httpsCallable`

**Parameters**: None

**Response**:
```typescript
{
  subscriptionStatus: object,
  trialDaysRemaining?: number,
  isTrialActive?: boolean,
  hasAccess: boolean,
  childLimit: number
}
```

### revokeSubscription (Admin)

Revokes a subscription by ID or master ID.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  subscriptionId?: string,// Subscription document ID
  masterId?: string       // OR master ID to find subscription
}
```

**Response**: `{ message: string }`

## Auth Functions

### bootstrapFirstAdmin

Promotes the first authenticated user to admin if no admin exists yet.

**Function Type**: `httpsCallable`

**Parameters**: None

**Response**: `{ success: boolean, message: string }`

### setAdminClaim (Admin)

Sets `role: "admin"` custom claim for a user.

**Function Type**: `httpsCallable`

**Parameters**: `{ uid: string }`

### setUserRole (Admin)

Sets an operator role custom claim for a user.

**Function Type**: `httpsCallable`

**Parameters**: `{ uid: string, role: "admin" | "support" | "auditor" }`

### revokeUserTokens (Admin)

Revokes all refresh tokens for a user (security incident response).

**Function Type**: `httpsCallable`

**Parameters**: `{ uid: string }`

## Support Functions

### createSupportTicket

User creates a support ticket with optional support access grant.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  problemDescription: string,   // Required: Problem text (max 5000 chars)
  allowSupportAccess: boolean,  // Required: Grant 48h data access
  consentSource?: string        // Optional: Source of consent
}
```

**Response**: `{ success: boolean, ticketId: string }`

### grantSupportAccess

Master grants 48-hour support access for a ticket.

**Parameters**: `{ ticketId: string }`

### revokeSupportAccess

Master revokes an existing support access grant.

**Parameters**: `{ grantId: string }`

### getTicketUserData

Support/admin retrieves user data via active support grant.

**Parameters**: `{ ticketId: string }`

### provideSolutionFeedback

User accepts or rejects AI-generated solution.

**Parameters**: `{ ticketId: string, feedback: "accepted" | "rejected", comment?: string }`

### grantDebugAccess

Parent confirms that KI may activate debug mode for the current ticket.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{ ticketId: string }
```

**Behavior**:
- Creates a time-limited debug support grant (48h)
- Sets ticket to debug-active state
- Starts KI follow-up analysis automatically

### skipDebugMode

Parent declines debug mode; KI continues without diagnostic data.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{ ticketId: string }
```

### processUserReplyMessage

Submits a user reply for iterative KI support rounds.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{ ticketId: string, message: string }
```

### analyzeWithDebugData

Runs one KI analysis round for a ticket. Uses debug snapshot if an active debug grant exists.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{ ticketId: string, userMessage?: string }
```

### getDebugInfo

Returns the current debug snapshot for a ticket (requires active debug grant).

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{ ticketId: string }
```

### onSupportTicketUpdated (Firestore Trigger)

Wird bei Ticket-Updates ausgelöst und sendet bei geänderter `adminResponse` automatisch eine Rückfrage-/Antwort-E-Mail an die im Ticket enthaltene ReplyTo-Adresse.

**Trigger**: `onUpdate` auf `supportTickets/{ticketId}`

**Voraussetzungen**:
- Ticket enthält ReplyTo-Markierung im Problemtext (z. B. `[ReplyTo] name@example.com`)
- ENV `RESEND_API_KEY` gesetzt
- ENV `SUPPORT_FROM_EMAIL` gesetzt

**Ticket-Metafelder (automatisch gesetzt):**
- `lastFollowUpEmailStatus`: `sent | failed | skipped_invalid_reply_to`
- `lastFollowUpEmailProvider`: aktuell `resend` (oder `none`)
- `lastFollowUpEmailError`: Fehlertext bei Fehlschlag
- `lastFollowUpEmailAt`: Zeitstempel der letzten Verarbeitung

### aiExplainProblem (Admin/Support)

AI assistant explains setup/config problems using Gemini or OpenAI fallback.

**Parameters**:
```typescript
{
  problemContext: string,      // Required: Problem description
  consentGiven: boolean        // Required: User consent for AI processing
}
```

**Response**: `{ explanation: string, suggestion: string, provider: string, model: string }`

## Admin Functions

### deleteUserAccount (Admin)

Deletes user account and all associated data (GDPR Art. 17).

**Parameters**: `{ masterId?: string }` (defaults to caller's own account)

### exportUserData (Admin)

GDPR/DSAR data export of all user-related collections.

**Parameters**: `{ masterId?: string }`

**Response**: `{ success: boolean, data: { masters, children, subscriptions, tickets, grants, consents, auditLogs } }`

### analyzeSystemErrors (Admin)

AI-powered analysis of system errors using Gemini.

**Parameters**:
```typescript
{
  hours?: number,           // Time window (default: 24h)
  functionFilter?: string,  // Filter by function name
  errorId?: string          // Analyze specific error
}
```

**Response**: `{ analysisId: string, analyses: object[], summary: string, totalErrors: number, model: string }`

### executeAutoFix (Admin)

Executes allowlisted auto-fix actions from AI analysis results.

**Parameters**: `{ analysisId: string, errorIndex: number, action: string }`

## Firestore Triggers

### onChildDeviceUpdateV2

**Trigger**: `onDocumentUpdated("children/{childId}")`

**Purpose**: Sends FCM diff-push when child device settings change. Only sends changed fields (`isLocked`, `appBlacklist`, `usageRules`).

### analyzeTaskPhoto

**Trigger**: `onDocumentUpdated("children/{childId}/tasks/{taskId}")`

**Purpose**: Analyzes task photo with Gemini Vision API when status transitions to `pending_approval`. Validates Firebase Storage URL to prevent SSRF. Falls back to stub analysis without API key. Result written as `aiAnalysis` field.

### onTaskStatusChange

**Trigger**: `onUpdate("children/{childId}/tasks/{taskId}")`

**Purpose**: Sends FCM notification to master when task → `pending_approval`, and to child when task → `approved`/`rejected`.

## Data Models

### Master Device
```typescript
interface MasterDevice {
  imei: string;
  deviceName?: string;
  fcmToken?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

---

## Legal Consent Functions

### getActiveLegalPolicies

Returns active legal policies (terms & privacy) for a country/locale, with automatic locale fallback chain.

**Parameters**: `{ country: string (2-letter ISO), locale: string (BCP-47) }`
**Response**: `{ country, locale, terms: { version, contentUrl }, privacy: { version, contentUrl } }`
**Errors**: `invalid-argument` (invalid country/locale format)

### needsLegalReconsent

Checks if a master user needs to re-accept legal terms.

**Parameters**: `{ country: string, locale: string }`
**Response**: `{ requiresReconsent: boolean, reason: "missing_consent" | "version_or_policy_change" | "up_to_date" }`

### recordLegalConsent

Records a master's acceptance of specific policy versions.

**Parameters**: `{ country: string, locale: string, termsVersion: string, privacyVersion: string }`
**Response**: `{ success: true, termsVersion, privacyVersion }`
**Errors**: `invalid-argument` (missing version), `failed-precondition` (version mismatch with current policies)

### publishLegalPolicy (Admin)

Publishes a new version of a legal policy. Generates a SHA-256 integrity checksum automatically.

**Parameters**:
```typescript
{
  policyType: "terms" | "privacy",  // Required
  country: string,                   // Required: ISO country code
  locale: string,                    // Required: Locale code
  version: string,                   // Required: Semantic version
  contentUrl: string,                // Required: URL to policy content
  effectiveAt?: string,              // Optional: ISO date when effective
  isMajorChange?: boolean            // Optional: Forces re-consent if true
}
```

**Response**: `{ success: true, policyId: string, checksum: string }`
**Errors**: `invalid-argument` (invalid policyType, missing version, or missing fields)

### markLegalReconsentRequired (Admin)

Marks users as requiring re-consent. Scope: single master (with `masterImei`) or all in a country/locale.

**Parameters**: `{ country: string, locale: string, masterImei?: string }`
**Response**: `{ success: true, scope: "single_master" | "country_locale", updatedCount: number }`

---

## Subscription Enforcement

The following functions enforce active subscription/trial:

| Function | Check |
|----------|-------|
| `createTask` | `hasActiveAccess()` — blocks task creation without subscription |
| `createPairingCode` | `hasActiveAccess()` — blocks code generation without subscription |
| `validatePairingCode` | Child-limit check (`childLimit` from subscription plan) |
| `validatePairingToken` | `hasActiveAccess()` + child-limit check |

**Subscription Plans**:

| Plan | `childLimit` | Price |
|------|-------------|-------|
| `single_child_monthly` | 1 | €1.99/mo |
| `single_child_yearly` | 1 | €19.99/yr |
| `family_monthly` | 99 (unlimited) | €4.99/mo |
| `family_yearly` | 99 (unlimited) | €49.99/yr |

Trial: 7-day trial on `registerMasterDevice`, `trialEndsAt` checked by `hasActiveAccess()`.

---

## AI Task Photo Analysis

`completeTask` validates that `photoUrl` is a valid Firebase Storage URL (`https://firebasestorage.googleapis.com/...`) and enforces a max length of 2048 characters to prevent SSRF and injection attacks.

`analyzeTaskPhoto` (Firestore trigger on task status change to `pending_approval`):

- **With `GEMINI_API_KEY`**: Calls Gemini Vision API to analyze the submitted photo against the task description. Returns structured JSON with `labels`, `safeSearch`, `taskCompletion` (completed/unclear/not_completed), `confidence`, and `summary`.
- **Without API key**: Falls back to a neutral stub analysis (`source: "fallback"`).
- Result is written to the task document as `aiAnalysis` field.

---

## Admin Functions

### adminHealthCheck

Pings 5 Firestore collections + Cloud Storage, returns status + AI/environment prerequisites.

### getKnowledgeBase / updateKnowledgeBase

Read/write the AI support knowledge base. Firestore-first, file fallback.

### sendTestFcmMessage

Send test FCM push to a token or child device. **Parameters**: `{ token?: string, childId?: string }`

### triggerScheduledJob

Manually trigger scheduled jobs: `checkExpiredSubscriptions`, `cleanupExpiredGrants`, `sendDailyErrorReport`.

---

## FCM Retry Strategy

All FCM sends use exponential backoff (max 3 attempts, 1s/2s/4s delays). Only transient errors (UNAVAILABLE, INTERNAL, deadline-exceeded) trigger retry.
```

### Child Device
```typescript
interface ChildDevice {
  imei: string;
  deviceName?: string;
  fcmToken?: string;
  masterImei: string;        // Links to master device
  isLocked?: boolean;
  allowedApps?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastSeen?: Timestamp;
}
```

### Pairing Code
```typescript
interface PairingCode {
  childId: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;      // 24 hours after creation
}
```

### Task
```typescript
interface Task {
  description: string;
  status: "pending" | "pending_approval" | "approved" | "rejected";
  photoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deadline: Timestamp;
  completedAt?: Timestamp;
  masterImei: string;
  rejectionReason?: string;
  aiAnalysis?: object;
  unlockDuration?: number;    // Minutes to unlock device after approval
  unlockUntil?: Timestamp;    // Computed when approved with unlockDuration
}
```

### Task State Machine
```
pending → pending_approval   (completeTask: child submits photo proof)
pending_approval → approved  (approveTask: master reviews & approves)
pending_approval → rejected  (rejectTask: master rejects with optional reason)
```

Invalid transitions throw `failed-precondition`.

## Error Handling

All Cloud Functions use standardized Firebase `HttpsError` codes (see `ERROR_CODES.md`):

| Code | Usage |
|------|-------|
| `invalid-argument` | Missing/wrong type parameters (validate early) |
| `unauthenticated` | Invalid IMEI/secretKey or missing auth |
| `not-found` | Document doesn't exist |
| `already-exists` | IMEI already registered |
| `permission-denied` | Master not owner of child / admin check failed |
| `deadline-exceeded` | Expired pairing token/code |
| `failed-precondition` | Invalid task state transition |
| `resource-exhausted` | Code collision limit (10) or free tier limit |
| `internal` | Unexpected server error, data corruption |

## Rate Limiting

- Pairing code generation: Max 10 collision retries per request
- AI analysis: Rate-limited by Gemini/OpenAI API quotas
- FCM notifications: Subject to FCM quotas
- Support tickets: 1 pending ticket per user

## Security

- Legacy endpoints: IMEI + secretKey authentication (see `docs/LEGACY_AUTH_INVENTORY.md`)
- New endpoints: Firebase Authentication via `context.auth`
- Master-child ownership verified before all mutations
- `photoUrl` validation: Must be Firebase Storage URL, max 2048 chars
- AI inputs sanitized to prevent prompt injection
- GDPR: `deleteUserAccount` and `exportUserData` for data subject rights
- Session timeout: 30 min in web panels
- Sensitive operations (lock/unlock) require master device authorization
- Firestore security rules provide additional data access control
- CSP, HSTS, X-Frame-Options (DENY), X-Content-Type-Options headers on all web hosting
- Session timeout (30 Min Inaktivität) in Admin-Panel und Web-Control
- photoUrl-Validierung verhindert SSRF über manipulierte URLs
- Legacy secretKey/IMEI-Auth eingefroren — keine neuen Endpunkte (siehe `docs/LEGACY_AUTH_INVENTORY.md`)
- Storage Rules: Max 5MB, nur `image/*` Content-Type, mit Owner-Prüfung

## Testing

Backend functions are thoroughly tested with Jest:
- `createPairingCode`: 4 test cases covering success, collision retry, validation, and limits
- `validatePairingToken`: 3 test cases covering valid tokens, invalid tokens, and expiration

Run tests with:
```bash
npm test
```
