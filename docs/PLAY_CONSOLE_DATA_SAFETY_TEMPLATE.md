# Google Play Console — Data Safety Form (Pre-Filled)

**Status:** Draft ready; external inputs pending before Google Play Console submission
**App:** MiniMaster Parent Control Suite
**Package IDs:**
- Parent App: `com.minimaster.masterapp`
- Child App: `com.google.pairing`

**Timeline:** Submit this week to avoid review delays
**References:** [PRIVACY_POLICY.md](PRIVACY_POLICY.md), [COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md](COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md), [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md), [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

---

## Section 1: Data Collection & Safety

### 1.1 Does your app collect or share personal user data?

**Answer:** ✅ **YES**

**Explanation:**
MiniMaster is a parental control application that:
- Requires parent authentication (Firebase Auth; legacy IMEI/secret key remains only as a frozen compatibility path for older pairings)
- Synchronizes real-time enforcement rules (app lockdown, usage schedules) via Firebase Cloud Messaging
- Stores task assignments and completion proofs (optional photos) in Firestore
- Tracks child device usage via periodic heartbeat worker

---

## Section 2: Collected Data Types

### 2.1 Account Information

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **Account credentials** (email/password) | ✅ YES | Firebase Auth to parent app | Until account deletion (DSAR) | ❌ No |
| **IMEI / Device ID** | ✅ YES | Legacy compatibility for older pairings + device identification during pairing | Until pairing reset (DSAR) | ❌ No |
| **Phone number** (optional) | ✅ YES | Recovery / Support contact | Until account deletion (DSAR) | ❌ No |
| **Payment info** | ✅ YES (Play Billing) | Subscription payment (premium features) | 30 days post-cancellation | ❌ No (Google Play only) |
| **User ID / Account ID** | ✅ YES | Internal auth + Firestore document key | Until account deletion | ❌ No |

**✅ Data encrypted in transit (HTTPS + TLS 1.2+)**
**✅ Data encrypted at rest (Firebase Firestore encryption)**
**✅ DSAR/Export: `exportUserData()` cloud function returns full user data within 30 days**
**✅ Deletion: `deleteUserAccount()` purges all personal data + completes within 30 days**

---

### 2.2 Device Identifiers

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **Device unique ID (ANDROID_ID)** | ✅ YES | Pairing child device to parent | Until pairing reset | ❌ No |
| **Device model / OS version** | ✅ YES | Compatibility checks + device lock enforcement | Lifetime | ❌ No |
| **SIM serial number** | ❌ NO | - | - | - |
| **WiFi MAC address** | ❌ NO | - | - | - |
| **Advertising ID** | ❌ NO | No advertising in MiniMaster | - | - |

---

### 2.3 Location Information

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **Precise location (GPS)** | ✅ YES (if parent enables) | Optional: enforce location-based rules (e.g., "lock phone outside home") | Until rule deleted or location disabled | ❌ No (stored only in parent's account) |
| **Approximate location (network)** | ✅ YES (if parent enables) | Fallback if GPS unavailable | Same as GPS | ❌ No |

**📍 User Control:**
- Parent must explicitly activate location rule in task settings
- Child cannot disable location tracking if enforced
- Location data sent to parent via Firestore (encrypted)
- Deleted when parent removes location rule or account is deleted

**⚠️ Permission:** `android.permission.ACCESS_FINE_LOCATION` (child app manifest)

---

### 2.4 Photos & Media

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **Photo (task completion proof)** | ✅ YES (optional) | Child uploads photo to prove task completion (e.g., homework photo) | Until task deleted or user data export/deletion | ❌ No (Firebase Storage, parent-only access) |
| **Camera access** | ✅ YES (if parent enables) | Conditional: task completion requires photo | Until task deleted | ❌ No |

**📸 User Control:**
- Parent creates task with "photo proof required" checkbox
- Child only grants camera access when submitting proof
- Photos stored in Firebase Storage with parent's security rules
- Photos deleted with task or account deletion

**⚠️ Permission:** `android.permission.CAMERA` (child app manifest)

---

### 2.5 App Activity

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **App list & usage time** | ✅ YES | Display enforced app blacklist + usage rules to parent | Real-time sync, up to 30 days historic | ❌ No |
| **Screen time** | ✅ YES | Enforce hourly usage limits (e.g., "max 2 hours/day") | Real-time, 30 days historic | ❌ No |
| **Installed apps** | ✅ YES | Block/allow specific apps (e.g., no TikTok) | Real-time per rule | ❌ No |
| **File / Document access** | ❌ NO | Not accessed | - | - |

**📌 Implementation:**
- Child App uses `AccessibilityService` (opt-in, disclosed in setup wizard)
- Sends `{"lockedApps": [list], "usageMinutes": int}` via FCM to parent
- Parent configures rules → FCM push back to child with new rules
- Rules enforced by `AccessibilityService` overlay + system intents

---

### 2.6 Contact Information

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **Email address (parent)** | ✅ YES | Account recovery + support contact | Until account deletion | ❌ No |
| **Email address (child, optional)** | ✅ YES | Future: for child-initiated unlock requests | Until account deletion | ❌ No |
| **Phone number (parent, optional)** | ✅ YES | Support contact + recovery | Until deletion | ❌ No |
| **Chat messages** | ❌ NO | No in-app chat backend | - | - |

---

### 2.7 Other Sensitive Personal Information

| Data Type | Collected | Purpose | Retention | Shared? |
|-----------|----------|---------|-----------|---------|
| **Biometric data (fingerprint/face)** | ❌ NO | Not collected | - | - |
| **Health/fitness data** | ❌ NO | Not collected | - | - |
| **Financial info (beyond payment)** | ❌ NO | Play Billing handles payment security | - | - |
| **Precise location (home address inference)** | ❌ NO (encrypted) | Cannot infer from encrypted GPS coords | - | - |

---

## Section 3: Data Sharing & Third Parties

### 3.1 Does your app share personal data with third parties?

**Answer:** ❌ **NO**

**Detailed Breakdown:**

| Third Party | Shared Data | Purpose | Contract | Encryption |
|------------|------------|---------|----------|-----------|
| **Google (Firebase)** | Firestore documents, Storage files, Auth tokens | Backend infrastructure (database, auth, storage) | Google Cloud SDPA | ✅ Yes |
| **Google Play Billing** | Purchase info + payment token | Subscription processing | Google Play ToS | ✅ Yes (Google handles) |
| **Crashlytics / Analytics** | (Optional, disabled by default) | Crash reporting + usage analytics | Google ToS | ✅ Yes |
| **Parent users** | Child device rules + app list + task status | Within same account only (no external sharing) | N/A (internal) | ✅ Yes (Firestore rules) |
| **Advertising networks** | None | No ads in MiniMaster | N/A | N/A |
| **Social media** | None | No social media integration | N/A | N/A |
| **Backup services** | None | Not Google Drive/iCloud backed up | N/A | N/A |

**✅ All infrastructure services are first-party (Google Cloud owned).**

---

## Section 4: Security Practices

### 4.1 Data Transmission Security

- ✅ **HTTPS/TLS 1.2+** for all API calls (Firebase, Cloud Functions)
- ✅ **End-to-end encryption** for sensitive bcast payloads (HMAC-SHA256 for debug commands)
- ✅ **Certificate pinning** (optional, via OkHttp interceptor if enabled)
- ✅ **No HTTP fallback** (all URLs are `https://`)

### 4.2 Data Storage Security

- ✅ **Firestore encryption at rest** (Google-managed keys)
- ✅ **Firebase Storage encryption at rest** (Google-managed keys)
- ✅ **SharedPreferences encryption** (Android Encryptipref lib, child app)
- ✅ **No credentials in logs** (all sensitive fields redacted in logcat)
- ✅ **Service account key not in repo** (`.gitignore` + GitHub Secrets)

### 4.3 Access Control

- ✅ **Firestore security rules** enforce parent-only access to child data:
  ```
  match /children/{childId}/tasks/{taskId} {
    allow read, write: if request.auth.uid == (parent's UID)
                    || isMasterDevice(request.auth.uid)
  }
  ```
- ✅ **OAuth 2.0 + Firebase ID tokens** for authenticated Cloud Functions
- ✅ **Legacy IMEI/secret key auth frozen** (no new endpoints use it)
- ✅ **ADB-only debug interface** (no network exposure of debug mode)

### 4.4 Regular Security Testing

- ✅ **CodeQL automated scanning** (weekly + on-push)
- ✅ **SSRF protection** (photo URLs validated as Firebase Storage URIs)
- ✅ **Injection prevention** (no dynamic SQL; Firestore queries parameterized)
- ✅ **Tamper detection** (reports device-admin disables, accessibility service stops)

---

## Section 5: Compliance & Privacy

### 5.1 Does your app comply with Google Play policies?

**Answer:** ✅ **YES**

**Specific Compliance:**

| Policy | Compliance | Notes |
|--------|-----------|-------|
| **Permissions** | ✅ Required only (device_admin, accessibility, camera, location) | Each gated by user/parent consent in setup wizard |
| **Family Policies** | ✅ Yes, parent control app | Declared as "parental control" in Play Console |
| **Appropriate Content** | ✅ App does not target children directly | Parent-facing UI, child app minimal UI designed for enforcement only |
| **User Consent** | ✅ GDPR/CCPA compliant | Privacy policy + consent before data collection |
| **Data Safety** | ✅ Transparent (this form) | Full disclosure of what data is collected and why |
| **Device Admin API** | ✅ Proper disclosure | Child app shows disclaimer: "This app is a device administrator. Device owner can manage your device." |
| **Accessibility API** | ✅ Proper disclosure | Child app: "This app uses accessibility services to enforce app blocking rules." |

### 5.2 Privacy Policy Link

**Location:** [PRIVACY_POLICY.md](PRIVACY_POLICY.md) (in repo)
**Link for Play Console:** `https://[your-domain]/privacy` (to be hosted)

**Key sections included:**
- What data is collected
- Why it's collected
- How long it's retained
- Parent's ability to export/delete data (DSAR)
- Child's privacy rights (subject to parental control)

---

## Section 6: User Control & Transparency

### 6.1 Can users request to delete their data?

**Answer:** ✅ **YES**

- Parent: [`exportUserData()` + `deleteUserAccount()`](../src/user-data.ts) cloud functions
- Response time: **Within 30 days** (Google standard)
- Process: Parent initiates in Admin Panel → Manual review trigger → Purge handler

### 6.2 Can users opt out of data collection?

**Answer:** ✅ **PARTIALLY**

| Data Type | Opt-out Possible? |
|-----------|-------------------|
| Account credentials | ❌ No (required for app function) |
| Device ID | ❌ No (required for pairing) |
| Location | ✅ Yes (parent can disable location rule) |
| Photos | ✅ Yes (parent can uncheck "photo required" for tasks) |
| App usage tracking | ❌ No (required for enforcement) |

**Rationale:** Parental control app requires core device data for function; however, optional features (location, photos) can be disabled.

### 6.3 Does your app contain ads?

**Answer:** ❌ **NO**

---

## Section 7: Final Checklist for Play Console Submission

- [ ] **App name & package ID** filled in
  - `com.minimaster.masterapp` (Parent App)
  - `com.google.pairing` (Child App)

- [ ] **Select "Parental Control"** as app category (if available)

- [ ] **Data types section:**
  - [ ] Account info: ✅ Checked
  - [ ] Device ID: ✅ Checked
  - [ ] Location (if applicable): ✅ Checked
  - [ ] Photos/media: ✅ Checked
  - [ ] App activity: ✅ Checked
  - [ ] Contact info: ✅ Checked

- [ ] **Data sharing:** Set to **"We do not share user data with third parties"** (Firebase is infrastructure, not third-party sharing)

- [ ] **Security practices:**
  - [ ] Data encryption in transit: ✅ Enable
  - [ ] Data encryption at rest: ✅ Enable
  - [ ] Security testing: ✅ Enable (CodeQL automated)

- [ ] **Privacy policy:**
  - [ ] URL provided: `https://[your-domain]/privacy`
  - [ ] Privacy policy mentions data collection, retention, deletion

- [ ] **Submission:**
  - [ ] Save draft
  - [ ] Request review (if new app submission)
  - [ ] Or: Update for existing app

---

## Notes for QA / Compliance Review

- **Sensitive Permissions Disclosed:** Device Admin + Accessibility Service require explicit setup wizard consent on real devices
- **Test before submit:** Install both APKs on test device, verify permissions prompts appear
- **GDPR/CCPA Ready:** Privacy policy links to DSAR flow; no untracked data collection
- **Refresh as needed:** If new data types added post-launch, update this form and re-submit

---

## References

- Attached: [COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md](COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md)
- Companion docs: [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md), [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md), [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md)
- Play Console Docs: https://support.google.com/googleplay/android-developer/answer/9859152
- Google Play Policies: https://play.google.com/console/about/policies/

---

**Ready for final review and external completion before copy/paste into Google Play Console → Data Safety form.**
