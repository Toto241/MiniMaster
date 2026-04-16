<!-- markdownlint-disable MD024 MD060 -->

# Security Baseline Checklist

Status: security baseline assessment for operator-facing web and desktop surfaces.

## 1. Web Panel: web-control (Parent Panel)

### Content Security Policy (CSP)

| Directive | Value | Status |
|-----------|-------|--------|
| `default-src` | `'self'` | ✅ Pass |
| `script-src` | `'self' https://www.gstatic.com https://cdn.jsdelivr.net` | ✅ Pass |
| `style-src` | `'self' 'unsafe-inline'` | ⚠️ Accepted (inline styles needed for dynamic UI) |
| `connect-src` | `'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net` | ✅ Pass |
| `img-src` | `'self' data: https:` | ✅ Pass |
| `font-src` | `'self'` | ✅ Pass |

### Subresource Integrity (SRI)

| Script | SRI Hash | Status |
|--------|----------|--------|
| firebase-app-compat.js | sha384-ajMUF... | ✅ Applied |
| firebase-app-check-compat.js | sha384-HTm9D... | ✅ Applied |
| firebase-auth-compat.js | sha384-xD1t9... | ✅ Applied |
| firebase-firestore-compat.js | sha384-XMIl1... | ✅ Applied |
| firebase-functions-compat.js | sha384-Cn425... | ✅ Applied |
| chart.js (CDN) | sha384-jb8JQ... | ✅ Applied |

### Security Headers

| Header | Value | Status |
|--------|-------|--------|
| `X-Content-Type-Options` | `nosniff` | ✅ Pass |
| `X-Frame-Options` | `DENY` | ✅ Pass |
| `X-XSS-Protection` | `1; mode=block` | ✅ Pass |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ Pass |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | ✅ Pass |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` | ✅ Pass |

### Session and Authentication

| Item | Status | Notes |
|------|--------|-------|
| Session timeout (30 min inactivity) | ✅ Pass | Auto-logout with 5-min warning |
| Credential storage | ✅ Pass | Only masterImei stored, secretKey NOT persisted |
| Firebase Auth token management | ✅ Pass | Managed by Firebase SDK |

---

## 2. Web Panel: admin-panel (Operator Dashboard)

### Content Security Policy (CSP)

| Directive | Value | Status |
|-----------|-------|--------|
| `default-src` | `'self'` | ✅ Pass |
| `script-src` | `'self' https://www.gstatic.com` | ✅ Pass |
| `style-src` | `'self' 'unsafe-inline'` | ⚠️ Accepted (inline styles needed) |
| `connect-src` | `'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net` | ✅ Pass |

### Subresource Integrity (SRI)

| Script | Status |
|--------|--------|
| firebase-app-compat.js | ✅ Applied |
| firebase-auth-compat.js | ✅ Applied |
| firebase-firestore-compat.js | ✅ Applied |
| firebase-functions-compat.js | ✅ Applied |

### Security Headers

Same as web-control — ✅ all headers applied via firebase.json.

### Session and Authentication

| Item | Status | Notes |
|------|--------|-------|
| Session timeout (30 min inactivity) | ✅ Pass | Identical to web-control |
| Auth method | ✅ Pass | Firebase Auth (email/password), no legacy auth |
| Role-based access | ✅ Pass | Custom claims: admin, support, auditor |

---

## 3. Desktop App (Electron)

### Electron Security Settings

| Setting | Value | Status |
|---------|-------|--------|
| `contextIsolation` | `true` | ✅ Pass |
| `nodeIntegration` | `false` | ✅ Pass |
| `preload` via `contextBridge` | Yes | ✅ Pass |
| External URL handling | `shell.openExternal` + deny new window | ✅ Pass |

### CLI Execution Security

| Control | Implementation | Status |
|---------|---------------|--------|
| Command whitelist | `firebase, npm, npx, node, adb` only | ✅ Pass |
| Multi-line command check | Each line validated against whitelist | ✅ Pass |
| Argument sanitization | Shell metacharacters stripped | ✅ Pass |
| Process cleanup on exit | All running processes killed on window-all-closed | ✅ Pass |

### Exposed APIs via contextBridge

| API | Scope | Status |
|-----|-------|--------|
| Parent preload | Path constants only (no executable APIs) | ✅ Pass |
| Operator preload | CLI execution + abort via IPC | ✅ Pass (whitelisted) |

---

## 4. Residual Risk Register

| ID | Surface | Risk | Severity | Status | Mitigation |
|----|---------|------|----------|--------|------------|
| R-01 | web-control, admin-panel | `style-src 'unsafe-inline'` | Low | Accepted | Required for dynamic styling; no user-controlled style injection path |
| R-02 | Desktop | `shell: true` in spawn | Medium | Accepted | Command whitelist + argument sanitization applied; no direct user input to shell |
| R-03 | web-control | Legacy IMEI/secretKey login form | Medium | Mitigating | Feature flag `DISABLE_LEGACY_SECRETKEY_AUTH` available; cutover plan active |

---

## 5. Verification Date

- **Last reviewed:** 2026-03-19
- **Reviewer:** _(fill)_
- **Next review due:** Before each release candidate
