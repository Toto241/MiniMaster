# MiniMaster API Documentation

This document provides comprehensive documentation for all Cloud Functions in the MiniMaster Firebase backend.

## Authentication

All Cloud Functions require Firebase Authentication. Users must be signed in with a valid Firebase token.

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
  masterImei: string,    // Required: Master device IMEI
  childImei: string      // Required: Child device IMEI
}
```

**Response**:
```typescript
{
  success: boolean,
  message: string
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
    pairingToken: 'abc123def456',
    masterImei: 'master-device-789',
    childImei: 'child-device-123'
  });
  console.log('Pairing result:', result.data.message);
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