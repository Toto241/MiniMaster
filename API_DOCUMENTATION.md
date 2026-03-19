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

### 7. lockChildDevice

Immediately locks a child device and sends push notification.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  masterImei: string,     // Required: Master device IMEI (for authorization)
  childImei: string       // Required: Child device IMEI to lock
}
```

**Push Notification**: Sends FCM message with action `LOCK_DEVICE`

### 8. unlockChildDevice

Immediately unlocks a child device and sends push notification.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  masterImei: string,     // Required: Master device IMEI (for authorization)
  childImei: string       // Required: Child device IMEI to unlock
}
```

**Push Notification**: Sends FCM message with action `UNLOCK_DEVICE`

### 9. getLinkedChildren

Retrieves all child devices linked to a master device.

**Function Type**: `httpsCallable`

**Parameters**:
```typescript
{
  masterImei: string      // Required: Master device IMEI
}
```

**Response**:
```typescript
{
  children: Array<{
    imei: string,
    deviceName?: string,
    isLocked?: boolean,
    lastSeen?: Timestamp,
    allowedApps?: string[]
  }>
}
```

## Firestore Triggers

### onChildDeviceUpdateV2

**Trigger**: `onDocumentUpdated("children/{childId}")`

**Purpose**: Automatically sends push notifications when child device data changes

**Triggered Changes**:
- `isLocked` status changes → Sends LOCK_DEVICE or UNLOCK_DEVICE notification
- `allowedApps` changes → Sends UPDATE_ALLOWED_APPS notification
- Any other field changes → Sends DEVICE_UPDATE notification

**FCM Message Format**:
```typescript
{
  data: {
    action: "LOCK_DEVICE" | "UNLOCK_DEVICE" | "UPDATE_ALLOWED_APPS" | "DEVICE_UPDATE",
    childImei: string,
    // Additional data based on action type
  }
}
```

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

Publishes a new version of a legal policy.

**Parameters**: `{ policyType: "terms" | "privacy", country: string, locale: string, version: string, contentUrl: string }`
**Errors**: `invalid-argument` (invalid policyType or missing version)

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
  status: "pending" | "completed" | "approved" | "rejected";
  photoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deadline: Timestamp;
  completedAt?: Timestamp;
}
```

## Error Handling

All Cloud Functions use Firebase's standard error codes:

- `invalid-argument`: Invalid or missing parameters
- `not-found`: Requested resource doesn't exist
- `already-exists`: Resource already exists
- `permission-denied`: Insufficient permissions
- `deadline-exceeded`: Operation timeout or expired resource
- `resource-exhausted`: Rate limit or quota exceeded
- `internal`: Unexpected server error

## Rate Limiting

- Pairing code generation: Limited to 10 attempts per request
- Device updates: No explicit rate limiting (handled by Firebase)
- Push notifications: Subject to FCM quotas

## Security

- All functions require Firebase Authentication
- Master-child relationships are verified before operations
- Sensitive operations (lock/unlock) require master device authorization
- Firestore security rules provide additional data access control

## Testing

Backend functions are thoroughly tested with Jest:
- `createPairingCode`: 4 test cases covering success, collision retry, validation, and limits
- `validatePairingToken`: 3 test cases covering valid tokens, invalid tokens, and expiration

Run tests with:
```bash
npm test
```
