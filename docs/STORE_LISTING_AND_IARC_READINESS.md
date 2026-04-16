# Google Play Store Listing & IARC Rating Guide

**Status:** Draft ready; external inputs and localization review pending before submission
**Timeline:** Submit IARC form this week; listing content over next 2 weeks
**Apps:**
- Parent App: `com.minimaster.masterapp`
- Child App: `com.google.pairing`

**Companion docs:** [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md), [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md), [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

---

## Part A: Store Listing Content Templates

### A.1 Parent App (com.minimaster.masterapp) — Store Listing

#### App Title (50 chars max)
```
MiniMaster - Parental Control Suite
```

#### Short Description (80 chars max)
```
Secure parental monitoring with HMAC Challenge-Response & real-time enforcement
```

#### Full Description (4000 chars max)

```
🛡️ MiniMaster — Professional Parental Control Suite

Manage your child's device usage with industry-grade security and real-time enforcement.

═══════════════════════════════════════════════════════════════════

✨ KEY FEATURES

📱 Real-Time Device Control
• Lock/unlock child device remotely from parent app
• Enforce app blocking via AccessibilityService integration
• Set hourly usage limits (e.g., 2 hours max per day)
• Geo-fencing with GPS-based app locking

📋 Task Management
• Create & assign daily tasks (homework, chores, etc.)
• Require photo proof for task completion
• Review & approve task submissions instantly
• Task analytics & completion history

🔒 Military-Grade Security
• HMAC-SHA256 Challenge-Response authentication
• End-to-end encrypted rule synchronization via FCM
• Firestore-backed persistent storage
• No plaintext credentials stored on device

⚙️ Smart Enforcement
• Automatic app blocking when rules triggered
• Tamper detection (reports device-admin disable)
• Screen timeout on lock
• Usage metrics & insights for parents

═══════════════════════════════════════════════════════════════════

🔐 SECURITY & PRIVACY

✅ Your data is protected:
• All communication encrypted with TLS 1.2+
• Firebase Firestore encryption at rest
• No data sharing with third parties
• GDPR/CCPA compliant with full data export & deletion

✅ Your child's privacy:
• Rules are parent-enforced only
• Device lock works even offline
• Tamper reports help prevent workarounds
• Transparent permission requests (Device Admin, Accessibility)

═══════════════════════════════════════════════════════════════════

📲 HOW IT WORKS

1️⃣ Register parent account (email + secure password)
2️⃣ Generate pairing code → scan on child device
3️⃣ Child app auto-configures & reports device info
4️⃣ Parent creates rules → delivered in real-time via FCM
5️⃣ Child device enforces rules instantly
6️⃣ Parent reviews app usage & task submissions

═══════════════════════════════════════════════════════════════════

📊 SUPPORTED PLATFORMS

✓ Android 10+ (Target API 35)
✓ Tablets supported (optimized tablet UI in Master App)
✓ Offline rule enforcement (syncs when online)

═══════════════════════════════════════════════════════════════════

⚠️ IMPORTANT REQUIREMENTS

This app requires:
• Pairing with a compatible child device (separate "MiniMaster Child" app)
• Parental/guardian account ownership of child device
• Active internet connection for rule synchronization
• Google Play subscription for premium features (optional, free tier available)

═══════════════════════════════════════════════════════════════════

🆘 SUPPORT & FEEDBACK

Questions? Issues?
• Check in-app FAQ
• Email: EXTERNAL_INPUT_REQUIRED (replace with the real production support contact before submission)
• Privacy: See privacy policy in app settings and link the hosted policy from [PRIVACY_POLICY.md](PRIVACY_POLICY.md)

═══════════════════════════════════════════════════════════════════

Version: 2.2.0 · © 2026 MiniMaster Development
```

#### Promo Text / Highlights

```
🔒 Military-grade parental control with HMAC-SHA256 encryption
📱 Real-time app blocking, screen locking & usage limits
📋 Task management with photo proof requirements
🛡️ Tamper detection + offline enforcement capability
```

**Note:** Include link to the hosted policy derived from [PRIVACY_POLICY.md](PRIVACY_POLICY.md) in "More details".

---

### A.2 Child App (com.google.pairing) — Store Listing

#### App Title (50 chars max)
```
MiniMaster Child - Device Management Companion
```

#### Short Description (80 chars max)
```
Secure pairing companion for MiniMaster parental control system
```

#### Full Description (4000 chars max)

```
🔐 MiniMaster Child — Secure Device Management Companion

This app works in tandem with the MiniMaster Parent app to enforce parental controls.

⚠️ IMPORTANT: This app is designed for child devices managed by parents/guardians only.

═══════════════════════════════════════════════════════════════════

🔧 WHAT THIS APP DOES

This app:
✓ Receives real-time enforcement rules from parent device
✓ Blocks/unlocks apps based on parent-set rules
✓ Tracks device usage & app activity
✓ Reports device status & rule compliance
✓ Detects tampering attempts (device-admin disable, etc.)
✓ Stores usage rules locally (works offline)

This app does NOT:
✗ Track location without parent configuration
✗ Access child's personal files (contacts, photos, etc.)
✗ Spy on messages or calls
✗ Install trackers or malware
✗ Share data with third parties

═══════════════════════════════════════════════════════════════════

🔒 SECURITY & TRANSPARENCY

✅ All rules enforced locally on device (no cloud-side enforcement)
✅ Rules sync encrypted via FCM (Firebase Cloud Messaging)
✅ Device-admin permissions required for app blocking
✅ Accessibility Service used for app-list monitoring only
✅ Full compliance with Android security best practices

⚠️ PERMISSIONS REQUIRED

When you install this app, you'll be asked to grant:
• Device Administrator Access → required for device lock/unlock
• Accessibility Service → required to enforce app blocking rules
• Location (optional) → only if parent enables geo-fencing rule
• Camera (optional) → only if parent requires photo task proof

═══════════════════════════════════════════════════════════════════

📲 HOW TO USE

1️⃣ Parent creates pairing code in MiniMaster Parent app
2️⃣ Scan pairing QR code → child device auto-configures
3️⃣ Grant requested permissions when prompted
4️⃣ Receive & enforce parent-set rules in real-time
5️⃣ Report device status & app activity to parent

═══════════════════════════════════════════════════════════════════

📊 SYSTEM REQUIREMENTS

✓ Android 10+ (Target API 35)
✓ Active internet connection (initially for pairing; enforcement works offline)
✓ Device must be enrolled with parent account first

═══════════════════════════════════════════════════════════════════

❓ FREQUENTLY ASKED QUESTIONS

Q: Will this app slow down my phone?
A: Minimal impact — runs as background service with lightweight rule enforcement

Q: What happens if I disable Device Administrator?
A: Tamper event reported to parent; device unlock/lock rules stop working until re-enabled

Q: Can I uninstall this app?
A: Yes, but parent will lose enforcement capability. Parent can re-enable rules remotely if needed.

═══════════════════════════════════════════════════════════════════

Version: 2.2.0 · © 2026 MiniMaster Development
```

#### Promo Text
```
🔐 Companion app for MiniMaster parental control system
📱 Real-time rule enforcement with offline capability
🔒 Transparent permissions (Device Admin, Accessibility)
🛡️ Tamper detection & status reporting
```

---

## Part B: Assets & Screenshots

### B.1 Icon Requirements

**Dimensions:** 512×512 px (or higher, up to 4096×4096)
**Format:** PNG with transparency recommended

**Design Guidelines:**
- Parent App: Shield icon with ✓ checkmark (security/peace-of-mind)
- Child App: Device with lock icon (enforcement/control)
- Color: Gradient blue→green (trust + security)

**Template:**
- Download Play Console icon template (Adobe Illustrator format)
- Keep design simple (works at 48×48 px on small screens)
- Avoid cluttered details

---

### B.2 Screenshots (Landscape 1280×720 px recommended)

**Parent App — Suggested Screenshots (5-8 total)**

1. **Dashboard Overview**
   - Show task list, child devices, quick-action buttons
   - Text overlay: "Manage All Tasks at a Glance"

2. **Task Creation**
   - Show "New Task" form with fields filled
   - Text: "Create & Assign Tasks Instantly"

3. **Device Lock/Unlock**
   - Show device status card with lock/unlock button
   - Text: "Lock Devices Remotely in Seconds"

4. **App Blocking Rules**
   - Show app blacklist configuration
   - Text: "Enforce App Blocking Rules Real-Time"

5. **Security & Privacy**
   - Show GDPR/data safety badges
   - Text: "Military-Grade Encryption & Privacy"

6. **Subscription Manager**
   - Show pricing tiers and features
   - Text: "Flexible Plans for Every Family"

**Child App — Suggested Screenshots (3-5 total)**

1. **Pairing Setup**
   - Show QR code scanner
   - Text: "Pair with Parent Device in 30 Seconds"

2. **Active Rules Display**
   - Show currently-enforced rules (locked apps, usage limit)
   - Text: "Rules Applied & Active Right Now"

3. **Device Status**
   - Show heartbeat status, rule version, last sync
   - Text: "Always Connected & Enforced"

---

### B.3 Feature Graphics

**Dimensions:** 1024×500 px
**Format:** PNG or webp

**Content Options:**
1. Device lock icon + "Real-Time Control"
2. Shield + "Military-Grade Security"
3. Cloud + "Encrypted Synchronization"
4. Graphs + "Usage Analytics"

---

## Part C: IARC Rating Questionnaire

### C.1 What is IARC?

IARC = International Age Rating Coalition
- Automatically rates app for **PEGI** (Europe), **ESRB** (US/Canada), **USK** (Germany), **ClassInd** (Brazil)
- Takes ~5 minutes to fill questionnaire
- Google Play Console will auto-generate ratings

### C.2 Pre-Submission Checklist

- [ ] **Google Play Developer Account** created and verified
- [ ] **Parent App:** Submitted to Play Console (can be draft)
- [ ] **Child App:** Submitted to Play Console (can be draft)
- [ ] **Privacy Policy:** Finalized and linked in both app listings
- [ ] **Screenshots & assets:** Uploaded (optional for IARC, required for launch)

### C.3 IARC Questionnaire — Expected Answers for MiniMaster

**Section: Content Categories**

```
Q: Violence
A: No (app is parental control, no violence content)

Q: Sexual content
A: No

Q: Alcohol, tobacco, or narcotics
A: No

Q: Gambling
A: No

Q: In-app purchases?
A: Yes (subscription for premium features, optional)
   → Select: "Digital goods / in-game currency"
   → Clarification: "Premium subscription features"

Q: Users interact with each other?
A: No (parent-to-child, not peer-to-peer)

Q: Real-time internet connection?
A: Yes (required for rule synchronization)

Q: Location data?
A: Yes (optional, only if parent enables geo-fencing)

Q: Camera, video, or audio access?
A: Yes (camera optional for task photo proof)

Q: Personal information collection?
A: Yes (account creation, device info, app usage tracking)
```

**IARC Result (expected):**
- **PEGI:** 3 (parental control app, no harmful content)
- **ESRB:** E (general audiences)
- **USK:** 0+ (no age restriction)
- **ClassInd:** L (all audiences, Brazil)

### C.4 IARC Questionnaire Link

**Location:** When you first add parent app to Play Console:
1. Go to **Content** → **Content rating**
2. Click **Get rating** button
3. Fill IARC questionnaire (~5 min)
4. Submit → Ratings auto-generated

**Repeat for child app separately.**

---

## Part D: Store Listing Finalization

### D.1 Metadata Summary

| Field | Parent App | Child App |
|-------|-----------|----------|
| **Title** | MiniMaster - Parental Control Suite | MiniMaster Child - Device Management Companion |
| **Package ID** | com.minimaster.masterapp | com.google.pairing |
| **Category** | Parental Control (if available) or Productivity | Tools |
| **Content Rating** | PEGI 3 / ESRB E / USK 0+ | PEGI 3 / ESRB E / USK 0+ |
| **Private/Public** | Public | Public |
| **Availability** | All countries (initially DE/AT/CH pilot) | All countries (initially DE/AT/CH pilot) |
| **Languages** | German (submission target), English master copy | German (submission target), English master copy |

### D.2 Pre-Launch Checklist

**For EACH app (parent + child):**

- [ ] **App Details** section
  - [ ] Title filled
  - [ ] Short description filled
  - [ ] Full description filled
  - [ ] Screenshots uploaded (at least 2-3)
  - [ ] Icon uploaded (512×512 px)
  - [ ] Feature image uploaded (optional)

- [ ] **Content Rating** section
  - [ ] IARC rating obtained
  - [ ] Privacy policy linked

- [ ] **Pricing & Distribution**
  - [ ] Region/country selection (start DE/AT/CH)
  - [ ] Content rating age groups confirmed
  - [ ] Restricted audience: No

- [ ] **Release Management**
  - [ ] APK signed with production key
  - [ ] Build uploaded to `internal testing` track first
  - [ ] Closed test via internal testers (QA team)
  - [ ] Release to production (after QA approval)

- [ ] **Verification**
  - [ ] App manifest permissions reviewed (Device Admin, Accessibility)
  - [ ] No malware/security issues flagged by Play Protect
  - [ ] APK size reasonable (< 50 MB target)

### D.3 Phased Rollout Strategy

**Phase 1: Internal Testing (Week 1)**
- Upload signed APK to **Internal Testing** track
- Invite 5-10 internal testers (QA + product team)
- Monitor crash reports, ratings
- Address critical issues only

**Phase 2: Closed Beta (Week 2)**
- Move to **Closed Testing** track
- Invite 50-100 external beta testers (friends, early access program)
- Gather feedback, refine translations if needed
- Confidence check: >= 4.0 star rating

**Phase 3: Production Release (Week 3)**
- Promote to **Production** track
- Full rollout to all regions
- Post launch: monitor Play Console dashboard (crashes, ratings, reviews)

---

## Part E: Localization (German Primary)

### E.1 Key Terms (German)

| English | Deutsch |
|---------|---------|
| Parental Control | Elternkontrolle / Kindersicherung |
| Device Lock | Gerätesperre |
| App Blocking | App-Blocker / Blockieren |
| Task Management | Aufgabenverwaltung |
| Rule Synchronization | Regelabgleich |
| HMAC-SHA256 | (keep as-is in tech context) |
| Real-time | Echtzeit |
| Security | Sicherheit |

### E.2 Translation Status

- ✅ English master copy provided above
- ☐ German submission copy still needs final translation/review before store submission
- ✅ Privacy Policy (German version required before submission)
- ✅ App UI localized (Android Compose supports i18n)
- ☐ Support documentation (German if customer support planned)

---

## Part F: Go-Live Checklist

**1 week before planned release:**

- [ ] All screenshots finalized & uploaded
- [ ] Icons, feature images, promo text finalized
- [ ] IARC ratings obtained for both apps
- [ ] Privacy policy live on production domain
- [ ] APK signed & uploaded to internal testing track
- [ ] Internal QA team: testing completed, no P0 bugs
- [ ] Store listing preview reviewed (check for typos, formatting)
- [ ] Regional availability double-checked (pilot: DE/AT/CH)
- [ ] Translation: German + English complete
- [ ] Permissions & declared features match app behavior
- [ ] Firebase app check enabled (production app)

**Day of release:**

- [ ] Final confirmation: APK builds still passing
- [ ] Promote from internal → production track
- [ ] Monitor first 2 hours: no spike in crashes
- [ ] Tweet/announce release
- [ ] Set up support email monitoring

---

## References

- Google Play Console: https://play.google.com/console
- IARC Questionnaire: https://support.google.com/googleplay/android-developer/answer/188189
- Play Store Listing Best Practices: https://support.google.com/googleplay/android-developer/answer/9887622
- Data Safety Form: https://support.google.com/googleplay/android-developer/answer/9859152
- Companion docs in repo: [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md), [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md), [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md)

---

**Next step after external inputs are filled: copy the finalized listing package into Play Console listing pages and align it with [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md).**
