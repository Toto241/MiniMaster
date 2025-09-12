# Mini-Master: Parental Control Application Suite

Mini-Master is an experimental parental control solution (NOT production hardened) for Android with a Firebase backend. It consists of two Android apps (`masterApp` for parents, `childApp` for children) plus a lightweight web control panel. Core enforcement components like a full Accessibility / usage enforcement service are intentionally not yet implemented.

The current prototype supports pairing, basic rule persistence (lock flag, app blacklist structure, usage rules blob), task lifecycle (create → child complete with photoUrl → parent approve) and selective real-time sync to the child device. Actual device/app blocking is NOT implemented.

---

## Table of Contents

- [Feature Status](#feature-status-honest-view)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Project Setup](#project-setup)
        - [Prerequisites](#1-prerequisites)
        - [Firebase Setup](#2-firebase-setup)
        - [Backend Installation](#3-backend-installation)
        - [Android Apps Setup](#4-android-apps-setup)
        - [Web Control Panel Setup](#5-web-control-panel-setup)
- [Backend API](#backend-api-high-level)
- [Testing](#testing)
- [Known Limitations](#known-limitations--gaps)
- [Quick Start](#quick-start-backend-only)
- [Further Documentation](#further-documentation)
- [License](#license)

---

## Feature Status (Honest View)

| Capability | Status | Notes |
|------------|--------|-------|
| Pairing via single-use token | Implemented | `generatePairingLink` + `validatePairingToken` (5 min) |
| Pairing via 6-digit code | Implemented | `createPairingCode` + `validatePairingCode` (24 h) |
| Master registration & secret issuance | Implemented | IMEI + UUID secret |
| Lock flag sync | Implemented | Changes trigger FCM diff push |
| App blacklist storage | Implemented (data only) | No enforcement on device yet |
| Usage rules storage | Implemented (data only) | No enforcement logic yet |
| Task workflow (create/complete/approve) | Implemented | Photo URL stored; no content validation |
| Subscription verification | Prototype | Google Play API call; no renewal scheduler |
| Accessibility / real app blocking | NOT implemented | Placeholder only; future design pending |
| Web control panel | Basic | Static JS; partial parity with masterApp |
| Internationalization | Partial | Text resources exist; verify consistency before relying |

> If you need production-grade enforcement, additional components (Accessibility service, foreground app watcher, local policy engine) must be designed before shipping.

## Project Structure

The repository is a monorepo containing the following main components:

- **/functions**: TypeScript Firebase Functions backend (business logic, pairing, tasks, subscription verification).
- **/masterApp**: Android parent app (Kotlin / Compose).
- **/childApp**: Android child app (Kotlin / Compose) – enforcement service missing.
- **/web-control**: Minimal static web UI for parent actions.
- **/firestore.rules**: Firestore security rules (flat schema, families disabled).
- **/storage.rules**: Firebase Storage rules.

## Technology Stack

- **Backend**: TypeScript, Node.js, Firebase (Cloud Functions, Firestore, FCM, Storage)
- **Android Apps**: Kotlin, Jetpack Compose, Hilt, Coroutines, WorkManager, DataStore, Play Billing.
- **Web Frontend**: Vanilla JS, HTML5, CSS3.
- **Testing**: JUnit / Mockito (Android), Jest (backend).

---

## Project Setup

Follow these steps to get the project running locally for development.

### 1. Prerequisites

- **Node.js:** v20 or higher
- **Firebase Account**
- **Firebase CLI:** `npm install -g firebase-tools`
- **Android Studio** (Gradle + SDK), **JDK 17**

### 2. Firebase Setup

1. Create project in [Firebase Console](https://console.firebase.google.com/)
2. Enable services:
    - Firestore (start test mode → later deploy rules)
    - Functions
    - Storage
    - Authentication (keep active; custom auth handled server-side)
3. Register Android apps:
    - Packages: `com.minimaster.masterapp`, `com.google.pairing`
    - Download each `google-services.json`

### 3. Backend Installation

1. **Install Dependencies:** From the project root, run:

    ```bash
    npm install
    ```

2. **Firebase Project:**
    - Log into the Firebase CLI: `firebase login`
    - Associate the project with your local repository: `firebase use --add` and select the project you created.

3. **Deploy Backend:** Deploy Functions and rules:

    ```bash
    firebase deploy
    ```

### 4. Android Apps Setup

1. **Add Firebase Configuration:**
    - Place each `google-services.json` in `masterApp/` and `childApp/`.
    - See [FIREBASE_EINRICHTUNG.md](./FIREBASE_EINRICHTUNG.md) (German) for screenshots.

2. **Build & Run:**
    - Open project root in Android Studio.
    - Let Gradle sync (wrapper included).
    - Choose `masterApp` or `childApp` configuration → Run on emulator/device.

### 5. Web Control Panel Setup

The web control panel provides PC-based access to all parent app functionality.

1. **Configure Firebase:**
    - In `web-control/` copy `firebase-config.template.js` → `firebase-config.js`
    - Fill `firebaseConfig` with Firebase web credentials.

2. **Serve the Web Interface:** Simple static server, e.g.:

    ```bash
    python3 -m http.server 8000
    # Access at http://localhost:8000
    ```

---

## Backend API (High-Level)

Primary callable Cloud Functions (see `index.ts`):

- Registration & Auth: `registerMasterDevice`, `generatePairingLink`, `validatePairingToken`, `createPairingCode`, `validatePairingCode`
- Device Control: `setDeviceLocked`, `updateAppBlacklist`, `setUsageRules`, `registerFcmToken`, `recordHeartbeat`
- Tasks: `createTask`, `completeTask`, `approveTask`
- Subscription: `verifyPurchase`, `getSubscriptionStatus`
- Trigger: `onChildDeviceUpdateV2` (diff-based FCM for `isLocked`, `appBlacklist`, `usageRules`)

All business logic enforced server-side; Firestore is treated as authoritative state store.

### Current Data Model (Flat)
Collections in active use: `masters`, `children`, nested `children/{childId}/tasks`, `pairingCodes`, `pairingTokens`.
Documents or rules mentioning `families` represent a future migration target—currently disabled in `firestore.rules`.

---

## Testing

- **Backend Unit Tests**: Run `npm test` from the root directory.
- **Android Manifest Validation**: Run `./validate_manifests.sh` to check for syntax errors.
- **Manual App Testing**: A detailed manual test plan is available in [Testanleitung.md](Testanleitung.md).

## Known Limitations / Gaps

- No real-time app blocking or screen-time enforcement (no Accessibility / usage enforcement service yet)
- Android build/test in constrained CI may skip due to network restrictions (Google Maven access)
- Subscription flow lacks periodic renewal reconciliation & revocation handling
- No image content validation / abuse scanning for task photo proofs
- Flat schema may migrate to hierarchical `families/{familyId}` later (see comments in `firestore.rules`)
- Security posture depends on Cloud Function secret validation (IMEI + secretKey), not user auth tokens

## Quick Start (Backend Only)

```bash
npm install
npm run lint
npm test
```
 
Optional: `npx tsc --noEmit` (type check) | Deploy (authenticated): `firebase deploy --only functions,firestore,storage`

## Further Documentation

For deeper details:

- **ARCHITECTURE.md** – High-level structure & future migration context
- **SECURITY.md** – Threat model draft (update needed alongside auth redesign)
- **COMPREHENSIVE_ISSUES_ANALYSIS.md** – Historical issue resolution claims (treat with caution; re-validate before relying)
- **Testanleitung.md** – Manual pairing & task flow scenarios (German)
- **RUNBOOK.md / PRODUCTION_DEPLOYMENT.md** – Ops & rollout guidance

## License

This project is currently unlicensed. Please see the **[LICENSE](LICENSE)** file and add an appropriate open-source license before using this code in a production environment.
