# Child Enforcement Test Matrix

Status: definitive test matrix for validating child device enforcement reliability.

## 1. Scope

This matrix covers all enforcement, anti-tamper, offline, and sync scenarios that must pass on reference devices before release.

## 2. Reference Device Matrix

| Device | OS Version | OEM Skin | Priority |
|--------|-----------|----------|----------|
| Google Pixel (any) | Android 13+ (API 33+) | Stock AOSP | P0 |
| Samsung Galaxy A-series | Android 12+ (API 31+) | One UI | P0 |
| Xiaomi Redmi | Android 12+ | MIUI | P1 |
| Huawei (non-GMS or GMS) | Android 10+ | EMUI/HarmonyOS | P1 |
| OPPO/Realme | Android 12+ | ColorOS | P2 |

Minimum requirement: All P0 devices must pass all critical scenarios.

## 3. Test Scenarios

### A. App Blocking (AccessibilityService)

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| A-01 | Block single app | Add app to blacklist via parent, open app on child | Overlay shown, app inaccessible | P0 |
| A-02 | Unblock single app | Remove app from blacklist, open app on child | App accessible normally | P0 |
| A-03 | Block multiple apps | Add 5+ apps to blacklist, verify each is blocked | All listed apps blocked | P0 |
| A-04 | System app resilience | Block a system launcher, verify device usable | Device remains usable, blocker shown for target app only | P0 |
| A-05 | App install after block | Install new app matching blacklist pattern | New app also blocked on next check | P1 |

### B. Device Lock

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| B-01 | Full device lock | Set isLocked=true via parent | Overlay blocks all non-essential apps | P0 |
| B-02 | Device unlock | Set isLocked=false via parent | Device fully accessible | P0 |
| B-03 | Lock persists reboot | Lock device, reboot child device | Lock active immediately after boot | P0 |
| B-04 | Lock during call | Lock during active phone call | Call continues, new app launches blocked | P1 |

### C. Usage Rules (Time Limits)

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| C-01 | Daily limit enforcement | Set 30min daily limit, use device for 30min | Device locks after limit reached | P0 |
| C-02 | Daily limit reset | Wait until midnight (or advance clock) | Limit counter resets | P0 |
| C-03 | Time window blocking | Set allowed window 08:00-20:00, use at 21:00 | Device blocked outside window | P1 |
| C-04 | Per-app time limit | Set 15min limit for specific app | App blocked after 15min, others unaffected | P1 |

### D. Task-Based Unlock

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| D-01 | Task unlock flow | Approve task with unlock duration | Device unlocks for specified duration | P0 |
| D-02 | Unlock expiry | Wait for unlock duration to expire | Device re-locks automatically | P0 |
| D-03 | Task with photo proof | Child submits task photo, parent reviews | Photo visible, approval flow works | P0 |

### E. Anti-Tamper Detection

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| E-01 | Disable device admin | Attempt to disable device admin via Settings | `device_admin_disable_requested` event reported to backend | P0 |
| E-02 | Accessibility service disable | Navigate to Accessibility Settings | Settings access logged via `settingsAccessCount` | P0 |
| E-03 | Force stop child app | Force stop via App Info | HeartbeatWorker restarts after boot/next trigger | P1 |
| E-04 | Clear app data | Clear data via Settings | Rules lost until next FCM sync — acceptable degradation | P1 |
| E-05 | Uninstall attempt | Try to uninstall with active device admin | Uninstall prevented by device admin | P0 |

### F. Offline Behavior

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| F-01 | Offline enforcement | Enable airplane mode, verify blocking still works | Rules enforced from SharedPreferences cache | P0 |
| F-02 | Offline rule persistence | Set rules, go offline, reboot, verify rules active | Cached rules survive reboot | P0 |
| F-03 | Sync recovery | Go offline, parent changes rules, child comes online | Rules sync via FCM when connectivity restores | P0 |
| F-04 | Heartbeat gap handling | Go offline for >1 hour, come back online | Heartbeat resumes, lastSeen updates | P1 |

### G. FCM Sync

| ID | Scenario | Steps | Expected Result | Priority |
|----|----------|-------|-----------------|----------|
| G-01 | Rule change sync | Parent changes rules, verify child receives | Child enforces new rules within 30 seconds | P0 |
| G-02 | No-change diff | Backend trigger fires with no actual changes | No FCM message sent (diff optimization) | P1 |
| G-03 | FCM token refresh | Force token refresh, verify sync continues | New token registered, sync uninterrupted | P1 |

## 4. OEM-Specific Checks

| ID | Scenario | OEM | Steps | Expected Result | Priority |
|----|----------|-----|-------|-----------------|----------|
| OEM-01 | Battery optimization | Samsung | Check if HeartbeatWorker survives Doze mode | Worker executes within expected window | P1 |
| OEM-02 | Auto-start permission | Xiaomi/MIUI | Ensure app has auto-start permission | App restarts after reboot | P1 |
| OEM-03 | Background restriction | Huawei/EMUI | Verify AccessibilityService not killed | Service stays active | P1 |
| OEM-04 | Settings path detection | Samsung One UI | Navigate to Samsung Settings | Settings paths correctly detected | P1 |

## 5. Evidence Requirements

For each test scenario:

1. Device model and OS version.
2. Timestamp of test execution.
3. Pass/Fail result with screenshot or screen recording.
4. Tester name/ID.
5. If Fail: defect ID and assigned owner.

## 6. Hardening Defect Backlog

| Defect ID | Scenario | Device | Description | Owner | Target Date | Status |
|-----------|----------|--------|-------------|-------|-------------|--------|
| _(to be filled during testing)_ | | | | | | |

## 7. Acceptance Criteria

1. All P0 scenarios pass on all P0 reference devices.
2. No trivial bypass path exists in the agreed threat model.
3. All P1 scenarios pass on at least one reference device of each OEM tier.
4. Hardening defect backlog has no unaddressed critical items.
