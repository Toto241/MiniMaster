# P3 Security Hardening — Electron & Dependency Chain Upgrade

## Status
**Config applied:** ✅  
**Packages installed:** ⚠️ Blocked by Windows file lock  
**Date:** 2026-04-24

## Changes Applied

### 1. Root `package.json`
| Dependency | Before | After | Reason |
|---|---|---|---|
| `electron` (dev) | `^36.4.0` | `^41.3.0` | Fixes **high severity** CVE (AppleScript injection in `app.moveToApplicationsFolder` on macOS) |
| `engines.node` | `22` | `>=22` | Aligns with Node 24 runtime and Electron 41 requirements |
| `overrides` | — | `@tootallnate/once: ^3.0.1`<br>`uuid: ^11.1.0` | Forces patched transitive deps (low/moderate vulns in firebase-admin chain) |

### 2. Desktop `package.json`
| Dependency | Before | After | Reason |
|---|---|---|---|
| `electron` (dev) | `^31.0.0` | `^41.3.0` | Same high-severity fix + Chromium 136→146 upgrade |
| `electron-builder` (dev) | `^24.13.3` | `^26.8.1` | Compatible with Electron 41; latest stable |

### 3. Breaking-Change Assessment
Electron 36→41 breaking changes were reviewed. The desktop codebase **does not use** any of the affected APIs:
- No PDF-specific WebContents detection (Behavior Changed in 41)
- No `clipboard` API in renderer (Deprecated in 40)
- No cookie `'changed'` event reliance on old causes
- `contextIsolation: true`, `nodeIntegration: false` already set (secure defaults)

## Blocker
`npm install` fails with `EBUSY` because `node_modules\electron\dist\resources\default_app.asar` is locked by another process (likely VS Code or an extension). The config files are updated; only the physical install is pending.

## Manual Steps Required
Run these **after closing VS Code** (or any IDE monitoring `node_modules`):

```powershell
# 1. Install root dependencies (Electron 41 + overrides)
npm install

# 2. Install desktop dependencies
cd desktop
npm install
cd ..

# 3. Validate everything still passes
npm run validate:readiness
```

## Post-Install Verification Checklist
- [ ] `npm ls electron` shows `41.3.0`
- [ ] `npm ls electron-builder` in `desktop/` shows `26.8.1`
- [ ] `npm run guard:pr152` passes
- [ ] `npm run test:ci` passes
- [ ] `npm run lint` passes
- [ ] Desktop app starts: `npm run desktop-start`
- [ ] Desktop operator mode starts: `npm run desktop-operator`

## Risk Notes
- **Electron 41** upgrades Chromium from 136→146 and Node from 22→24. The desktop launcher uses only standard `BrowserWindow`, `ipcMain`, `contextBridge`, and `shell` APIs — all stable across this range.
- **electron-builder 26** may require updated code-signing certificates on CI. Monitor the first CI build after this change.
- **uuid override to 11.1.0** is safe because `uuid@11.1.0` is already a direct dependency and tests pass with it.
- **@tootallnate/once override to 3.0.1** is a small utility package with no API changes affecting `http-proxy-agent`.
