# Physical Commissioning Checklist (Pre-Go-Live)

**Status:** Must complete before production release
**Timeline:** ~4 hours (2 devices)
**Participants:** QA Lead + Engineering Owner + 1 Ops representative
**Devices Required:**
- 1× Master Device (parent phone, Android 10+)
- 1× Child Device (child phone, Android 10+)

---

## Pre-Commissioning Prep (30 min)

### Step 1: Device Setup

#### Master Device
```
📱 Requirements:
  ✓ Android 10 or higher
  ✓ 4 GB RAM minimum (8 GB recommended)
  ✓ Google Play Services installed & current
  ✓ WiFi + mobile data available
  ✓ Factory reset (if repurposed device)
```

#### Child Device
```
📱 Requirements:
  ✓ Android 10 or higher
  ✓ 2 GB RAM minimum (4 GB recommended)
  ✓ Google Play Services installed & current
  ✓ WiFi + mobile data available
  ✓ Factory reset (if repurposed device)
```

### Step 2: Install APKs

```bash
# Parent App
adb install masterApp-release-2.2.0.apk

# Child App
adb install childApp-release-2.2.0.apk

# Verify installations
adb shell pm list packages | grep -E "(minimaster|pairing)"
# Expected output:
#   com.minimaster.masterapp
#   com.google.pairing
```

### Step 3: Verify Firebase Connectivity

```typescript
// Parent App: Dashboard → Debug Console (if visible)
// Expected:
//   ✓ "Firebase initialized"
//   ✓ "Connected to Firestore"
//   ✓ "Cloud Functions reachable"
```

---

## Phase 1: Basic Setup (45 min)

### Test 1.1: Master App Registration & Auth

**Objective:** Verify parent account creation & login
**Dev:** Engineering Owner
**Evidence:** Screenshot of Dashboard

```
Steps:
  1. Open MiniMaster Parent App
  2. Tap "Register new account"
  3. Enter test email: minimaster-qa-2026@...
  4. Set password: (securely pass to team)
  5. Verify email (check inbox, click confirmation)
  6. Return to app, login with credentials
  7. Should see empty Dashboard (no children yet)

Expected Result:
  ✅ Account created in Firebase Auth
  ✅ User document created in Firestore
  ✅ Dashboard loads without errors
  ✅ No "permission-denied" errors in logcat
```

### Test 1.2: Generate Pairing Code

**Objective:** Verify pairing initiation
**Dev:** Engineering Owner
**Evidence:** Screenshot of pairing code screen

```
Steps:
  1. In Parent Dashboard → "Add Child" button
  2. Choose "Generate pairing code" (6-digit, 24h expiry)
  3. Note the code: XXXXXX
  4. Verify timestamp shows current time
  5. Check Firestore: `pairingCodes` collection should have new doc

Expected Result:
  ✅ Code generated and displayed
  ✅ Code format: 6 digits
  ✅ TTL visible (24 hours)
  ✅ New doc in Firestore `pairingCodes` collection
```

### Test 1.3: Child App Registration via Code

**Objective:** Complete pairing flow
**Dev:** QA Lead
**Evidence:** Screenshot of paired child in parent dashboard

```
Steps (on Child Device):
  1. Open MiniMaster Child App
  2. Tap "Pair with Parent"
  3. Choose "Enter code" (not QR scan this round)
  4. Type 6-digit code from Step 1.2
  5. Tap "Verify"
  6. App shows "Pairing successful, granting permissions"
  7. Grant required permissions (Device Admin, Accessibility, Location/Camera)

Steps (on Master Device):
  8. Dashboard should auto-refresh
  9. New child appears in device list: "Child Device (paired 14:30 UTC)"
  10. Tap child → Device details show:
      - Device model
      - OS version
      - Last heartbeat (should be <1 min)
      - Rules version (should be empty initially)

Expected Result:
  ✅ Child device registered in Firestore
  ✅ Master app shows child in dashboard
  ✅ Child heartbeat active (~15 min interval)
  ✅ No authentication errors in `childApp` logs
  ✅ Firestore doc created: `children/{childId}`
```

---

## Phase 2: Task Management (45 min)

### Test 2.1: Create a Task

**Objective:** Verify task creation & parent assignment
**Dev:** Engineering Owner
**Evidence:** Screenshot of task created + task in dashboard

```
Steps (on Master Device):
  1. Select child in dashboard
  2. Tap "Create Task" button
  3. Fill form:
     - Title: "Test Task - Homework"
     - Description: "Complete math worksheet (Problem 1-10)"
     - Deadline: Tomorrow 18:00
     - Photo required: ✓ (toggle ON)
     - Assigned to: [child name]
  4. Tap "Assign Task"

Expected Result:
  ✅ Task created in Firestore: `children/{childId}/tasks/{taskId}`
  ✅ Task appeared in Child Dashboard (with photo requirement)
  ✅ Status: "pending"
  ✅ No validation errors
  ✅ Timestamp created_at records submission time
```

### Test 2.2: Child Submits Task with Photo

**Objective:** Verify photo proof workflow
**Dev:** QA Lead
**Evidence:** Screenshot of photo uploaded + parent approval screen

```
Steps (on Child Device):
  1. Open app → see assigned task "Test Task - Homework"
  2. Tap task → view details (photo required indicated)
  3. Tap "Start task" → camera opens
  4. Take screenshot / photo (any image)
  5. Tap "Submit as proof"
  6. Photo uploads to Firebase Storage

Steps (on Master Device):
  7. Dashboard → child → Tasks tab
  8. Filter: "Pending approval"
  9. See task: "Test Task - Homework (pending)"
  10. Tap task → see photo thumbnail
  11. Tap "Approve" or "Request changes"

Expected Result:
  ✅ Photo uploaded to Firebase Storage
  ✅ Photo URL stored in task document
  ✅ Task status changed: "pending" → "pending_approval"
  ✅ Parent sees photo in review screen
  ✅ Parent can approve/reject without errors
```

### Test 2.3: Complete Task Approval Workflow

**Objective:** Verify end-to-end task lifecycle
**Dev:** Engineering Owner
**Evidence:** Screenshot of approved task in history

```
Steps (on Master Device):
  1. From Test 2.2, tap "Approve" on pending task
  2. Optional comment: "Good work!"
  3. Confirm approval

Steps (verify):
  4. Task appeared in "Completed" section
  5. Status: "approved"
  6. Approval timestamp recorded
  7. Firestore: task document shows:
     - status: "approved"
     - approvedAt: timestamp
     - approvedBy: master IMEI

Expected Result:
  ✅ Task moved from pending_approval → approved
  ✅ Photo persisted in Storage
  ✅ Completion timestamp recorded
  ✅ Child app notified (if push enabled)
```

---

## Phase 3: Real-Time Enforcement (60 min)

### Test 3.1: Create App Blocking Rule

**Objective:** Verify rule creation & FCM delivery
**Dev:** Engineering Owner
**Evidence:** Screenshot of rule in master + evidence in child logcat

```
Steps (on Master Device):
  1. Dashboard → child device
  2. Tap "Manage Rules" / "App Blocking"
  3. Tap "Create new rule"
  4. Select app: "TikTok" (or install test app)
  5. Rule type: "Block when active"
  6. Save rule

Expected Result:
  ✅ Rule stored in Firestore: `children/{childId}/rules`
  ✅ FCM message sent to child device
  ✅ Child app receives rule via FCM (check logcat: "RuleSyncService")
  ✅ Rule stored in child SharedPreferences
```

### Test 3.2: Verify App Blocking Enforcement

**Objective:** Verify AccessibilityService enforcement
**Dev:** QA Lead + Engineering Owner
**Evidence:** Logcat output + screenshot of blocked app

```
Steps (on Child Device):
  1. Unlock device
  2. Long press home → show all apps
  3. Tap blocked app (TikTok or test app)
  4. AccessibilityService intercepts:
     - App shows overlay: "This app is blocked by parent"
     - Screen returns to home
  5. Check logcat for enforcement logs:
     - grep "com.tiktok" /sdcard/Android/logcat.txt
     - Should see: "App [com.tiktok] blocked per rule"

Steps (on Master Device):
  6. Dashboard should show real-time status:
     - "Blocked apps: 1"
     - "Last enforcement: 2 minutes ago"

Expected Result:
  ✅ Blocked app cannot be opened
  ✅ Overlay message appears
  ✅ AccessibilityService active (Settings → Accessibility confirms)
  ✅ Device returns to home successfully
  ✅ No crashes in child app
```

### Test 3.3: Screen Lock Enforcement

**Objective:** Verify device lock functionality
**Dev:** Engineering Owner
**Evidence:** Device locked screenshot + unlock from parent app

```
Steps (on Master Device):
  1. Dashboard → child device
  2. Tap "Lock device" button
  3. Confirm: "Lock this device now?"
  4. Tap "Lock"

Steps (on Child Device — observe):
  5. Screen immediately turns black (locked)
  6. Device-admin lock active (cannot unlock manually)
  7. Check logcat: "Device locked by parent rule"

Steps (on Master Device):
  8. Tap "Unlock device" button
  9. Confirm unlock

Steps (verify on Child Device):
  10. Screen returns to home screen
  11. Child can interact normally

Expected Result:
  ✅ Device locks within 1-2 seconds of parent command
  ✅ Child cannot unlock manually
  ✅ Unlock command works without delay
  ✅ Device admin privilege active throughout
  ✅ No permission denied errors
```

---

## Phase 4: Security & Tamper Detection (30 min)

### Test 4.1: Tamper Detection — Device Admin Disable

**Objective:** Verify tamper reporting
**Dev:** Engineering Owner
**Evidence:** Tamper alert in parent app + Firestore log

```
Steps (on Child Device):
  1. Open Settings → Apps & notifications → Device admin apps
  2. Find "MiniMaster" (or similar)
  3. Tap it → "Disable this device admin"
  4. Confirm disable

Expected Result:
  ✅ Child app detects disable within 5 seconds
  ✅ Logcat shows: "Device-admin state changed: (disabled)"
  ✅ Cloud function triggered: `reportTamperEvent(device_admin_disable)`
  ✅ Parent app alerts: ⚠️ "Child device tampering detected!"
  ✅ Alert persists until parent acknowledges
  ✅ Firestore: new doc in `children/{childId}/tamperEvents`

Clean-up:
  6. Re-enable device admin in Settings
  7. Verify app still functions normally
```

### Test 4.2: USB Debug Mode — Verify Debug Interface

**Objective:** Validate USB-Debug commands work (if enabled)
**Dev:** Engineering Owner
**Evidence:** Debug token generation + state dump output

```
Prerequisites:
  ✓ local.properties has DEBUG_SESSION_SECRET_MASTER/CHILD set
  ✓ PowerShell scripts available: generate-debug-token.ps1, run-usb-tests.ps1
  ✓ USB cable + adb available

Steps:
  1. Generate challenge:
     adb shell am broadcast -a com.minimaster.masterapp.DEBUG_GET_CHALLENGE

  2. Parse logcat for nonce:
     adb logcat | grep "MINIMASTER_DEBUG_CHALLENGE"
     # Expected: "challengeNonce: {UUID}"

  3. Generate HMAC token (PowerShell):
     powershell -File scripts/generate-debug-token.ps1 \
       -AppId master \
       -Challenge {UUID-from-step-2}

  4. Send activation:
     adb shell am broadcast \
       -a com.minimaster.masterapp.DEBUG_ACTIVATE \
       --es response {HMAC-token}

  5. Dump state:
     adb shell am broadcast -a com.minimaster.masterapp.DEBUG_DUMP_STATE

  6. Parse output from logcat:
     # Expected JSON: {"sessionActive": true, "sessionExpiresAt": ..., ...}

Expected Result:
  ✅ Challenge issued with valid UUID
  ✅ Token generation computes correct HMAC-SHA256
  ✅ Session activates (sessionActive = true)
  ✅ State dump returns full JSON
  ✅ 30-min expiry tracked correctly
  ✅ Deactivation clears session state

Optional: Run full automated test suite:
  powershell -File scripts/run-usb-tests.ps1 -AppId master -AppId child
  # Expected: Green ✅ ampel for both apps
```

---

## Phase 5: Offline & Sync Verification (30 min)

### Test 5.1: Offline Rule Enforcement

**Objective:** Verify rules work without internet
**Dev:** QA Lead
**Evidence:** App blocked while offline + normal when online

```
Steps (on Child Device):
  1. Activate app-blocking rule (from Phase 3.1)
  2. Disable WiFi + Mobile data (airplane mode)
  3. Try to open blocked app → should be blocked
  4. Device can be locked (if lock rule created)

Expected Result:
  ✅ Rules enforced even without internet
  ✅ Offline enforcement uses cached SharedPreferences rules
  ✅ No "network error" alerts to child
  ✅ Rules sync happens automatically when online again
```

### Test 5.2: Heartbeat & Sync Recovery

**Objective:** Verify periodic sync works
**Dev:** Engineering Owner
**Evidence:** Logcat showing heartbeat + master app seeing "last sync" update

```
Steps (on Child Device):
  1. Open phone for 20-30 minutes (let HeartbeatWorker run ~2 cycles)
  2. Logcat should show periodic:
     - "HeartbeatWorker: Starting heartbeat interval (15min)"
     - "Device heartbeat sent"
     - "RuleSyncService: Checking for rule updates..."

Steps (on Master Device):
  3. Dashboard → child device → Device Details
  4. Verify "Last heartbeat" timestamp = within last 5 minutes
  5. Verify "Rules synced" timestamp = recent

Expected Result:
  ✅ Heartbeat runs every 15 minutes
  ✅ Master app receives updates automatically
  ✅ Dashboard shows current sync status
  ✅ No "stale device" warnings
```

---

## Phase 6: Security Controls & Permissions (30 min)

### Test 6.1: Verify Required Permissions Granted

**Objective:** Ensure all critical permissions active
**Dev:** QA Lead
**Evidence:** Settings screenshots confirming permissions

```
Steps (on Child Device):
  1. Settings → Apps & notifications → MiniMaster Child
  2. Tap "Permissions" → Verify each:

     ☑️ Device Admin: GRANTED (required for lock/unlock)
     ☑️ Accessibility: GRANTED (required for app blocking)
     ☑️ Location (if used): GRANTED or DENIED (parent-controlled)
     ☑️ Camera (if used): GRANTED or DENIED (parent-controlled)

  3. Screenshot Settings → Accessibility:
     - Should show "MiniMaster Child" as enabled service

Expected Result:
  ✅ Device admin shows in admin apps list
  ✅ Accessibility service active & listed
  ✅ Optional permissions gated by rule creation
```

### Test 6.2: Verify No Excessive Permissions

**Objective:** Confirm app doesn't over-request
**Dev:** Engineering Owner
**Evidence:** AndroidManifest.xml review + Play Console perms check

```
Steps:
  1. Check app permissions (Admin Panel → Debug):
     - Device Admin ✓
     - Accessibility ✓
     - Location (only if parent configures)
     - Camera (only if parent configures)

  2. Verify NOT requested:
     - ✗ Contacts
     - ✗ Calendar
     - ✗ Clipboard
     - ✗ Microphone
     - ✗ SMS
     - ✗ Phone

Expected Result:
  ✅ Only necessary permissions declared
  ✅ No "suspicious permissions" flagged by Play Protect
  ✅ Privacy policy matches permission list
```

---

## Phase 7: Performance & Stability (30 min)

### Test 7.1: 1-Hour Soak Test

**Objective:** Verify app stability under sustained use
**Dev:** QA Lead
**Evidence:** Crash logs, battery usage, memory stats

```
Steps (run for 60 minutes):
  1. Keep both apps open / active
  2. Perform repeated actions:
     - Create 5-10 tasks (parent)
     - Submit 3-5 task proofs (child)
     - Toggle app blocking rules on/off (3 times)
     - Lock/unlock child device (5 times)
     - Review child usage stats (3 times)

  3. Monitor:
     - adb shell "dumpsys meminfo com.minimaster.masterapp"
     - adb shell "dumpsys meminfo com.google.pairing"
     - Logcat for crash/exception keywords

Expected Result:
  ✅ No crashes (logcat clean of FATAL)
  ✅ Memory stable (< 200 MB child app, < 300 MB parent app)
  ✅ Battery drain acceptable (< 10% per hour normal use)
  ✅ No ANR (Application Not Responding) dialogs
```

### Test 7.2: Network Resilience

**Objective:** Verify graceful degradation on poor connection
**Dev:** Engineering Owner
**Evidence:** Logcat showing retry logic + eventual recovery

```
Steps (simulate poor network):
  1. Use Android Studio → Emulator controls to throttle network
     OR: Settings → Developer Options → Network speed throttle
  2. Perform actions same as 7.1 (create tasks, lock device, etc.)
  3. Monitor logcat for:
     - Connection timeout messages
     - Retry attempts
     - Graceful fallback (offline cache)

Expected Result:
  ✅ App remains responsive even on slow network
  ✅ Retries happen automatically
  ✅ No crashes due to network timeouts
  ✅ "Offline" indicator shown if disconnected > 30 sec
```

---

## Phase 8: Production Readiness Sign-Off (30 min)

### Test 8.1: Final Checklist & Evidence Collection

**Objective:** Document successful commissioning
**Evidence Required:** Signed checklist + screenshots + logs

```
Collect for each test:
  1. Screenshots (device lock screen, app screenshots)
  2. Logcat dumps (adb logcat > logcat-master.txt, logcat-child.txt)
  3. Firestore screenshots (collections: masters, children, tasks)
  4. Firebase functions logs (Cloud Console → Logs)

Create evidence bundle file:
  `docs/COMMISSIONING_ACCEPTANCE_SIGNED_2026-03-22.md`

File contents:
  - Date & time of commissioning
  - QA Lead name & signature
  - Engineering Owner name & signature
  - List of both devices (model, OS version, IMEI)
  - Summary of tests passed/failed
  - Any workarounds or known issues
  - Approval statement: "App ready for production release"
```

### Test 8.2: Pre-Go-Live Decision

**Objective:** Final green-light decision
**Decision Criteria:**

```
PASS if:
  ✅ All Phase 1-7 tests passed
  ✅ Zero P0 bugs found during commissioning
  ✅ No unresolved security issues
  ✅ Firebase key rotation completed (from FIREBASE_KEY_ROTATION_RUNBOOK.md)
  ✅ Play Console Data Safety form submitted (from PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md)
  ✅ Store listing content finalized (from STORE_LISTING_AND_IARC_READINESS.md)
  ✅ On-call roster assigned (Ops team confirmed)

NO-GO if:
  ❌ Any Phase 4-6 test failed (security / permission issue)
  ❌ App crashes detected during soak test
  ❌ Device admin or accessibility permissions not granted
  ❌ Firestore write failures during task submission
  ❌ FCM delivery failures > 5% of messages

In case of NO-GO:
  1. Document failing test details
  2. Create P0/P1 bug tickets
  3. Escalate to engineering for fix
  4. Re-run commissioning after fixes (skip passed phases)
```

**Decision Record:** Update `docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md`
```markdown
### Physical Commissioning (2026-03-22)

| Status | Value |
|--------|-------|
| Date | 2026-03-22 14:00-18:00 UTC |
| QA Lead | [Name] |
| Engineering Owner | [Name] |
| Decision | ✅ GO / ❌ NO-GO |
| Signed | [Date/Time] |

Issues identified:
  - (none) or (list P0/P1)

Approval:
  QA Lead: [Signature]
  Engineering: [Signature]
  Ops: [Signature]
```

---

## Failure Recovery

### If Pairing Fails (Test 1.3)
```
Debugging:
  1. Check Firebase firestore `pairingCodes` → doc should exist
  2. Check if validation code matches (6 digits)
  3. Check child app Firebase initialization: logcat "Firebase initialized"
  4. Check network on both devices (ping google.com)

Recovery:
  1. Delete pairing code from Firestore Console
  2. Factory reset child device
  3. Restart pairing from Step 1.2
```

### If Device Lock Fails (Test 3.3)
```
Debugging:
  1. Verify device admin permission granted: Settings → Device admin
  2. Check if master IMEI matches parent account (Dashboard → Device Settings)
  3. Check logcat: grep "DeviceLockManager" for errors

Recovery:
  1. Re-enable device admin if disabled
  2. Restart child app
  3. Try lock again
```

### If AccessibilityService Stops (Test 4.2)
```
Debugging:
  1. Settings → Accessibility → MiniMaster should be ON
  2. If OFF: Re-enable and confirm
  3. Check child app: does Settings → Accessibility show status?

Recovery:
  1. Uninstall + reinstall child app
  2. Grant accessibility permission explicitly
  3. Verify Settings → Accessibility lists it as enabled
```

---

## Sign-Off Template

```markdown
# Physical Commissioning Sign-Off (2026-03-22)

## Test Results Summary

| Phase | Tests | Status | Issues |
|-------|-------|--------|--------|
| 1. Basic Setup | 3 | ✅ PASS | None |
| 2. Task Management | 3 | ✅ PASS | None |
| 3. Real-Time Enforcement | 3 | ✅ PASS | None |
| 4. Security & Tamper | 2 | ✅ PASS | None |
| 5. Offline & Sync | 2 | ✅ PASS | None |
| 6. Permissions | 2 | ✅ PASS | None |
| 7. Performance | 2 | ✅ PASS | None |
| 8. Production Readiness | 2 | ✅ PASS | None |

**Total: 19 tests, 19 PASS, 0 FAIL**

## Devices Tested
- Master: Samsung Galaxy S22 (Android 14)
- Child: Samsung Galaxy A53 (Android 13)

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| QA Lead | __________ | __________ | 2026-03-22 |
| Engineering Owner | __________ | __________ | 2026-03-22 |
| Ops Lead | __________ | __________ | 2026-03-22 |

**Recommendation: ✅ GO for production release**

Scheduled rollout: 2026-03-23 09:00 UTC (DE/AT/CH pilot)
```

---

## References

- [FIREBASE_KEY_ROTATION_RUNBOOK.md](FIREBASE_KEY_ROTATION_RUNBOOK.md)
- [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md)
- [DEBUG_INTERFACE_GUIDE.md](DEBUG_INTERFACE_GUIDE.md)
- [RUNBOOK.md](../RUNBOOK.md) (incident playbooks)
