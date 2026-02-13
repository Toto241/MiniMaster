# Security Configuration Guide

This document provides comprehensive security configuration instructions for the MiniMaster parental control system.

## Table of Contents

1. [Environment Variables](#environment-variables)
2. [Input Validation](#input-validation)
3. [Rate Limiting](#rate-limiting)
4. [Firestore Security Rules](#firestore-security-rules)
5. [Security Headers](#security-headers)
6. [Deployment](#deployment)
7. [Security Best Practices](#security-best-practices)

---

## Environment Variables

### Overview

All Firebase configuration values should be stored in environment variables, never hardcoded in source code. This prevents accidental exposure of sensitive credentials in version control.

### Required Variables

#### Admin Panel (`admin-panel/.env`)

```bash
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc123
```

#### Web Control Panel (`web-control/.env`)

```bash
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-bucket.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123:web:abc123
```

#### Backend (Cloud Functions)

Set these via Firebase CLI or Google Cloud Console:

```bash
# OpenAI API key for AI-powered support agent (optional)
OPENAI_API_KEY=sk-...

# Google Application Credentials for Play API
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json
```

### Setup Instructions

1. **Copy the example files:**
   ```bash
   cp admin-panel/.env.example admin-panel/.env
   cp web-control/.env.example web-control/.env
   ```

2. **Fill in actual values:**
   - Get Firebase config from [Firebase Console](https://console.firebase.google.com/)
   - Navigate to Project Settings → General
   - Scroll to "Your apps" section
   - Select your web app
   - Copy the configuration values

3. **Verify `.gitignore`:**
   Ensure `.env` files are listed in `.gitignore`:
   ```gitignore
   .env
   .env.local
   .env.production
   admin-panel/.env
   web-control/.env
   ```

4. **Never commit:**
   - ⛔ Never commit `.env` files
   - ⛔ Never commit service account keys
   - ⛔ Never hardcode credentials in source code

---

## Input Validation

### Overview

All user inputs are validated both client-side (for UX) and server-side (for security). The backend uses the `ValidationUtils` object for consistent validation across all Cloud Functions.

### Validation Rules

#### IMEI Validation
- **Format:** Exactly 15 digits
- **Regex:** `^[0-9]{15}$`
- **Used by:** `registerMasterDevice`, `setDeviceLocked`, `createTask`

```typescript
ValidationUtils.isValidIMEI("123456789012345") // true
ValidationUtils.isValidIMEI("12345") // false
ValidationUtils.isValidIMEI("abc123456789012") // false
```

#### Email Validation
- **Format:** RFC 5322 compliant
- **Regex:** `^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`
- **Used by:** Admin panel login

```typescript
ValidationUtils.isValidEmail("user@example.com") // true
ValidationUtils.isValidEmail("invalid-email") // false
```

#### Child ID Validation
- **Format:** 15-digit IMEI OR valid UUID v4
- **Regex:** `^[0-9]{15}$` OR `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
- **Used by:** `setDeviceLocked`, `createTask`

```typescript
ValidationUtils.isValidChildId("123456789012345") // true (IMEI)
ValidationUtils.isValidChildId("550e8400-e29b-41d4-a716-446655440000") // true (UUID)
```

#### Pairing Code Validation
- **Format:** Exactly 6 digits
- **Regex:** `^[0-9]{6}$`
- **Used by:** `validatePairingCode`

```typescript
ValidationUtils.isValidPairingCode("123456") // true
ValidationUtils.isValidPairingCode("12345") // false
```

#### UUID Validation
- **Format:** Standard UUID v4
- **Regex:** `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
- **Used by:** `validatePairingToken`

```typescript
ValidationUtils.isValidUUID("550e8400-e29b-41d4-a716-446655440000") // true
```

#### String Sanitization
- **Max length:** 1000 characters (default), 5000 for task descriptions
- **Removes:** `<` and `>` characters (XSS prevention)

```typescript
ValidationUtils.sanitizeString("<script>alert('xss')</script>", 100)
// Returns: "scriptalert('xss')/script" (truncated to 100 chars)
```

### Client-Side Validation

**Web Control Panel:**
```javascript
// IMEI validation before login
function validateIMEI(imei) {
    return /^[0-9]{15}$/.test(imei);
}

// Secret key length check
if (secretKey.length < 32) {
    showNotification('Invalid secret key format.', 'error');
    return;
}
```

**Admin Panel:**
```javascript
// Email validation before login
function validateEmail(email) {
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}
```

### Error Responses

Invalid inputs return standardized `HttpsError` with appropriate codes:

| Error Code | When to Use | Example |
|------------|-------------|---------|
| `invalid-argument` | Wrong format, missing fields | "Invalid IMEI format. Must be exactly 15 digits." |
| `unauthenticated` | Missing or invalid auth | "User must be authenticated." |
| `permission-denied` | Unauthorized access | "Master not authorized for this child." |
| `not-found` | Resource doesn't exist | "Child device not found." |
| `resource-exhausted` | Rate limit exceeded | "Rate limit exceeded. Max 10 requests per 60s." |

---

## Rate Limiting

### Overview

Rate limiting protects the backend from abuse and ensures fair resource usage. Limits are tracked in Firestore per user per function.

### Current Limits

| Function | Max Requests | Time Window | Notes |
|----------|--------------|-------------|-------|
| `setDeviceLocked` | 10 | 60 seconds | Prevents rapid lock/unlock abuse |
| `createTask` | 5 | 60 seconds | Prevents task spam |
| `validatePairingCode` | 3 | 300 seconds (5 min) | Prevents brute-force code guessing |
| `validatePairingToken` | 3 | 300 seconds (5 min) | Prevents brute-force token guessing |
| **Default** | 20 | 60 seconds | Applied to all other functions |

### How It Works

1. **Request arrives** → Function calls `checkRateLimit(userId, functionName)`
2. **Check history** → Fetches recent request timestamps from Firestore
3. **Filter old requests** → Removes timestamps outside time window
4. **Count recent requests** → If count ≥ limit, throw error
5. **Record request** → Add current timestamp to history

### Implementation Details

**Storage Location:**
```
/rate_limits/{userId}/calls/{functionName}
```

**Data Structure:**
```typescript
{
  calls: [timestamp1, timestamp2, ...],
  window: windowStartTimestamp
}
```

**Error Response:**
```json
{
  "code": "resource-exhausted",
  "message": "Rate limit exceeded. Max 10 requests per 60s. Please wait 45s."
}
```

### Adjusting Limits

To modify rate limits, edit the `RateLimits` object in `index.ts`:

```typescript
const RateLimits: { [key: string]: RateLimitConfig } = {
  setDeviceLocked: { maxRequests: 15, windowMs: 60000 },  // Increased to 15
  createTask: { maxRequests: 10, windowMs: 120000 },      // Increased window to 2 min
  // ... other limits
};
```

### Monitoring

Rate limit hits are logged automatically:

```typescript
functions.logger.warn(`Rate limit exceeded for ${userId}/${functionName}`);
```

Monitor these logs in Firebase Console → Functions → Logs.

---

## Firestore Security Rules

### Overview

Firestore Security Rules provide defense-in-depth by validating all database operations, even when using the Admin SDK from Cloud Functions cannot bypass these rules when accessed from client SDKs.

### Key Security Features

#### 1. Authentication Checks
```javascript
function isAuthenticated() {
  return request.auth != null;
}

function isOwner(userId) {
  return request.auth != null && request.auth.uid == userId;
}

function isAdmin() {
  return isSignedIn() && request.auth.token.role == 'admin';
}
```

#### 2. Field Validation

**Masters Collection:**
```javascript
allow create: if isOwner(masterId) &&
  request.resource.data.keys().hasOnly([
    'imei', 'uid', 'role', 'createdAt', 'email', 
    'childCount', 'secretKey', 'isPremium', 'lastSeen'
  ]) &&
  isValidIMEI(request.resource.data.imei);
```

**Tasks Collection:**
```javascript
allow create, update: if 
  request.resource.data.description.size() > 0 &&
  request.resource.data.description.size() <= 5000 &&
  request.resource.data.status in [
    'pending', 'pending_approval', 'approved', 'rejected'
  ];
```

#### 3. Ownership Enforcement

**Children Collection:**
```javascript
allow read: if isAuthenticated() && (
  resource.data.masterImei == request.auth.uid ||  // Master owns child
  childId == request.auth.uid ||                   // Child device itself
  isAdmin()                                         // Admin for support
);
```

#### 4. Rate Limits Collection

```javascript
match /rate_limits/{userId}/calls/{functionName} {
  allow read, write: if isAuthenticated() && isOwner(userId);
}
```

### Testing Rules

Use the Firebase Emulator Suite to test rules:

```bash
firebase emulators:start --only firestore

# In another terminal, run rule tests
npm run test:rules  # If you have rule tests set up
```

### Common Rule Patterns

**Read-only for users:**
```javascript
match /subscriptions/{subId} {
  allow read: if resource.data.masterId == request.auth.uid;
  allow write: if false;  // Only Cloud Functions can write
}
```

**Prevent field modification:**
```javascript
allow update: if 
  !('secretKey' in request.resource.data.diff(resource.data).affectedKeys());
```

**Validate IMEI format:**
```javascript
function isValidIMEI(imei) {
  return imei is string && imei.matches('^[0-9]{15}$');
}
```

---

## Security Headers

### Overview

Security headers protect against common web vulnerabilities like XSS, clickjacking, and MIME-sniffing attacks.

### Recommended Headers

All static HTML/JS apps should include these headers:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://apis.google.com; style-src 'self' 'unsafe-inline';
```

### Firebase Hosting Configuration

Add to `firebase.json`:

```json
{
  "hosting": {
    "public": "web-control",
    "headers": [
      {
        "source": "**",
        "headers": [
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          },
          {
            "key": "X-Frame-Options",
            "value": "DENY"
          },
          {
            "key": "X-XSS-Protection",
            "value": "1; mode=block"
          },
          {
            "key": "Strict-Transport-Security",
            "value": "max-age=31536000; includeSubDomains"
          }
        ]
      }
    ]
  }
}
```

---

## Deployment

### Pre-Deployment Checklist

- [ ] All `.env.example` files created
- [ ] Production `.env` files configured (not committed)
- [ ] All tests passing: `npm test`
- [ ] Firestore rules validated
- [ ] Security review completed

### Deployment Steps

1. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Deploy Cloud Functions:**
   ```bash
   firebase deploy --only functions
   ```

3. **Deploy Web Panels:**
   ```bash
   # For static hosting
   firebase deploy --only hosting:web-control
   firebase deploy --only hosting:admin-panel
   
   # Or build with environment variables for external hosting
   cd web-control && npm run build
   cd admin-panel && npm run build
   ```

4. **Verify Deployment:**
   - Test login with valid credentials
   - Verify rate limiting (make 11+ requests rapidly)
   - Test invalid inputs (should be rejected)
   - Check Firebase Console → Functions → Logs for errors

### Environment-Specific Configuration

**Development:**
```bash
# Use Firebase Emulator Suite
firebase emulators:start
```

**Staging:**
```bash
# Deploy to staging project
firebase use staging
firebase deploy --only functions,firestore
```

**Production:**
```bash
# Deploy to production project
firebase use production
firebase deploy --only functions,firestore
```

---

## Security Best Practices

### 1. Credential Management

- ✅ Use environment variables for all sensitive values
- ✅ Rotate API keys regularly
- ✅ Use least-privilege service accounts
- ✅ Store service account keys in secure secret managers
- ⛔ Never commit `.env` files
- ⛔ Never log sensitive data

### 2. Input Validation

- ✅ Validate on both client and server
- ✅ Use whitelists (allowed values) over blacklists
- ✅ Sanitize all user input before storage
- ✅ Set maximum lengths for all string fields
- ⛔ Trust client-side validation alone
- ⛔ Allow unbounded input

### 3. Authentication & Authorization

- ✅ Require authentication for all sensitive operations
- ✅ Verify ownership before allowing access
- ✅ Use custom claims for role-based access
- ✅ Implement rate limiting on auth endpoints
- ⛔ Rely on client-provided user IDs
- ⛔ Allow anonymous access to sensitive data

### 4. Rate Limiting

- ✅ Apply rate limits to all public endpoints
- ✅ Use stricter limits for expensive operations
- ✅ Log rate limit violations
- ✅ Consider IP-based limits for public endpoints
- ⛔ Allow unlimited API calls
- ⛔ Use client-side rate limiting only

### 5. Firestore Security

- ✅ Use the principle of least privilege
- ✅ Validate all field types and formats
- ✅ Prevent unauthorized field modifications
- ✅ Test rules with the emulator
- ⛔ Use overly permissive rules
- ⛔ Allow write access to system fields

### 6. Monitoring & Logging

- ✅ Monitor failed authentication attempts
- ✅ Log rate limit violations
- ✅ Track unusual access patterns
- ✅ Set up alerts for security events
- ⛔ Log sensitive data (passwords, tokens)
- ⛔ Ignore security warnings

### 7. Dependency Management

- ✅ Keep all dependencies up to date
- ✅ Run `npm audit` regularly
- ✅ Use lock files (`package-lock.json`)
- ✅ Review security advisories
- ⛔ Ignore dependency warnings
- ⛔ Use deprecated packages

---

## Support & Resources

### Internal Documentation

- [API Documentation](../API_DOCUMENTATION.md)
- [Error Codes](../ERROR_CODES.md)
- [Architecture](../ARCHITECTURE.md)

### External Resources

- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Cloud Functions Best Practices](https://firebase.google.com/docs/functions/tips)

### Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** create a public issue
2. Email security concerns to: [security contact - add actual email]
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

---

**Last Updated:** 2026-02-13  
**Version:** 1.0.0
