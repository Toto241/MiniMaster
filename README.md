# Mini-Master: Parental Control Application Suite

<!-- markdownlint-disable MD004 MD022 MD029 MD030 MD032 MD041 -->

> [!NOTE]
> Current status: actively maintained prototype with production-oriented backend hardening.
> Core flows are usable; some enforcement capabilities are intentionally still in rollout.

[![CI/CD Status](https://github.com/Toto241/MiniMaster/actions/workflows/ci.yml/badge.svg)](https://github.com/Toto241/MiniMaster/actions/workflows/ci.yml)

Mini-Master is a comprehensive parental control solution for Android with a Firebase backend. It consists of two Android apps (`masterApp` for parents, `childApp` for children) plus a lightweight web control panel. The system allows parents to manage their children's device usage, assign tasks, and enforce rules.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Setup & Installation](#setup--installation)
- [Usage](#usage)
- [Documentation](#documentation)
- [Testing](#testing)
- [License](#license)

---

## Overview

The Mini-Master suite is designed to give parents control over their children's digital wellbeing. The `masterApp` acts as the command center, allowing parents to pair with child devices, set rules (like app blocking and usage limits), and assign tasks. The `childApp` runs on the child's device, enforcing these rules via an Accessibility Service and allowing the child to complete assigned tasks to earn screen time.

## Features

- **Secure Pairing:** Pair devices securely using a 6-digit code or a time-limited link.
- **Remote Locking:** Instantly lock or unlock the child's device from the parent app or web panel.
- **App Blocking:** Blacklist specific applications to prevent their usage.
- **Usage Limits:** Set daily usage limits for the device.
- **Task-Based Unlocking:** Assign tasks to children (e.g., "Clean your room"). The child device remains locked until the child submits photo proof of task completion, which the parent can then approve or reject.
- **Push Notifications:** Parents receive real-time notifications when a child submits a task for review.
- **Real-time Synchronization:** Rules and status updates are synced in real-time using Firebase Firestore and Cloud Messaging (FCM).
- **First-Start Language Selection:** Both Android apps require language selection on first launch and persist the selected locale.
- **Web Control Panel:** A web-based interface for parents to manage devices from a browser.
- **Operator Dashboard:** A secure admin panel for the service operator to manage users, monitor subscriptions, and view system statistics.
- **Desktop Launcher:** A native Electron launcher to open both PC panels in one desktop app.
- **PWA Support:** Web panels can be installed on mobile devices (including iOS/Android browsers) as home-screen apps.

## Project Structure

The repository is organized as follows:

- **`/` (Root):** Contains the TypeScript Firebase Functions backend (`index.ts`, `firebase.ts`) and project configuration.
- **`/masterApp`:** The Android application for parents (Kotlin, Jetpack Compose, Hilt).
- **`/childApp`:** The Android application for children (Kotlin, Jetpack Compose, Hilt). Includes the `MiniMasterAccessibilityService` for enforcement.
- **`/web-control`:** A static web application for parental control.
- **`/test`:** Backend unit and integration tests.
- **`/docs`:** Additional documentation and architecture guides.

## Technology Stack

- **Backend:** TypeScript, Node.js, Firebase (Cloud Functions, Firestore, Authentication, Storage, Messaging).
- **Android Apps:** Kotlin, Jetpack Compose, Coroutines, Flow, Dagger Hilt, WorkManager.
- **Web Frontend:** HTML5, CSS3, Vanilla JavaScript.

---

## Setup & Installation

### Prerequisites

- **Node.js:** v22 (matching `package.json` engines; older versions are not a supported release target).
- **Firebase Account:** A Google account to create a Firebase project.
- **Firebase CLI:** Install globally via `npm install -g firebase-tools`.
- **Android Studio:** Latest version with Android SDK and JDK 17.

### Firebase Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  Enable **Firestore Database**, **Cloud Functions**, **Authentication**, and **Storage**.
3.  Add two Android apps to your project:
    - Parent App Package: `com.minimaster.masterapp`
    - Child App Package: `com.google.pairing`
4.  Download the `google-services.json` file for each app.

### Backend Setup

1.  Navigate to the root directory and install dependencies: `npm install`
2.  Build backend TypeScript: `npm run build`
3.  Login to Firebase: `firebase login`
4.  Select your project: `firebase use --add`
5.  Deploy the functions and rules: `firebase deploy`

### AI Provider Setup (Support Automation)

Set environment variables for ticket automation:

- Preferred: `GEMINI_API_KEY`
- Optional model override: `GEMINI_MODEL` (default: `gemini-2.0-flash`)
- Fallback provider: `OPENAI_API_KEY`

### Android Apps Setup

1.  Place the downloaded `google-services.json` files in `masterApp/` and `childApp/`. These files are git-ignored and must not be committed. Use the `.template.json` files as a reference.
2.  Open the project root in Android Studio, sync Gradle, and run the apps on separate devices/emulators.

### Web Control Panel Setup

1.  Navigate to `web-control/`.
2.  Replace the placeholder `firebaseConfig` object in `app.js` with your project's configuration from the Firebase Console.
3.  Serve the directory using a simple HTTP server (e.g., `python -m http.server 8000`).

### Desktop Launcher Setup (PC)

1.  Install dependencies in repository root: `npm install`
2.  Start desktop launcher: `npm run desktop-start`
3.  Use launcher to open:
    - Parent panel (`web-control`)
    - Operator dashboard (`admin-panel`)

---

## Usage

1.  **Registration & Pairing:** Register the parent device, then generate a pairing code to link the child device.
2.  **Setup Child Device:** Follow the onboarding flow on the child device and grant the crucial **Accessibility Service** permission for app blocking to work.
3.  **Select App Language:** On first launch of each Android app, select the preferred app language before continuing.
4.  **Management:** Use the Master App or Web Panel to lock the device, block apps, or assign tasks.

### Supported Android App Languages

Current integrated locales:

- `en`, `de`, `fr`, `zh-CN`, `es`, `pt-BR`, `hi`, `ar`, `id`, `ja`, `ru`, `tr`, `it`, `ko`, `vi`, `pl`, `nl`, `th`, `uk`, `fa`, `bn`, `ur`, `sw`, `he`, `ro`, `cs`, `sv`, `no`, `da`, `fi`, `el`, `hu`

## Documentation

Comprehensive architecture and setup documentation is available in the `docs/` directory. Key documents include:

- **[API Documentation](API_DOCUMENTATION.md):** Detailed reference for all Cloud Functions.
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md):** Step-by-step instructions for deploying the project.
- **[Security Best Practices](docs/SECURITY_BEST_PRACTICES.md):** Recommended security enhancements.
- **[Quality Review YYYY-MM-DD](docs/QUALITY_REVIEW_YYYY-MM-DD.md):** Consolidated status for code analysis, tests, GUI checks, and configuration validation.
- **[Language Global Roadmap](docs/LANGUAGE_GLOBAL_ROADMAP.md):** Global language prioritization, rollout waves, and locale strategy.
- **[First-Start Language Implementation](docs/LANGUAGE_FIRST_START_IMPLEMENTATION.md):** Technical details for mandatory language selection on first launch.
- **[Language Validation Report 2026-03-18](docs/LANGUAGE_VALIDATION_REPORT_2026-03-18.md):** Deep integration analysis and current validation outcomes.
- **[Legal Country Compliance Matrix](docs/LEGAL_COUNTRY_COMPLIANCE_MATRIX.md):** Country-by-country legal topics and mandatory go-live gates.
- **[Google Baseline plus Country Review 2026-03-18](docs/GOOGLE_BASELINE_AND_COUNTRY_REVIEW_2026-03-18.md):** Operational research baseline using Google rules as minimum plus legal review package per target market.
- **[Legal Versioning and Re-Consent Spec](docs/LEGAL_VERSIONING_RECONSENT_SPEC.md):** Technical specification for policy versioning, country/locale rollout, and forced re-consent on major changes.
- **[Country Review Folder](docs/country-reviews/README.md):** Dedicated per-market legal review artifacts and sign-off templates.
- **[AGB Template DE](docs/AGB_TEMPLATE_DE.md):** Terms template with essential consumer and liability rights clauses.
- **[Legal Rollout Checklist](docs/LEGAL_ROLLOUT_CHECKLIST.md):** Operational legal integration and validation checklist per market.
- **[Next Implementation Workpackages 2026-03-18](docs/NEXT_IMPLEMENTATION_WORKPACKAGES_2026-03-18.md):** Detailed follow-up execution plan for the next implementation waves after the initial readiness pass.
- **[Architecture Decision Records](docs/adr/):** Key architectural decisions and their rationale.

Each source file is also thoroughly documented.

## Testing

The project has a comprehensive test suite to ensure code quality and stability.

- **Backend:** Run `npm test` to execute over 100 unit and integration tests for all Cloud Functions and business logic. The command `npm run lint` checks for code style issues.
- **Android Lint (blocking for errors):** `./scripts/run-android-checks.sh lint`
- **Android Unit Tests:** `./scripts/run-android-checks.sh :masterApp:testDebugUnitTest :childApp:testDebugUnitTest`
- **Android Instrumentation Build:** `./scripts/run-android-checks.sh :masterApp:assembleDebugAndroidTest :childApp:assembleDebugAndroidTest`
- **Selected Connected Tests (requires running emulator/device, master):** `./scripts/run-android-checks.sh :masterApp:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.minimaster.masterapp.MasterAppE2ETest`
- **Selected Connected Tests (requires running emulator/device, child):** `./scripts/run-android-checks.sh :childApp:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.google.pairing.PairingScreenUITest`
- **Language Regression Checks:** Verify first-start language picker is shown once, locale is persisted after restart, and localized strings load for selected language.

### Validation Gate

For repository validation after changes, run this sequence:

1. `./scripts/run-android-checks.sh lint`
2. `./scripts/run-android-checks.sh :masterApp:testDebugUnitTest :childApp:testDebugUnitTest`
3. `./scripts/run-android-checks.sh :masterApp:assembleDebugAndroidTest :childApp:assembleDebugAndroidTest`
4. Optional full device validation (master): `./scripts/run-android-checks.sh :masterApp:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.minimaster.masterapp.MasterAppE2ETest`
5. Optional full device validation (child): `./scripts/run-android-checks.sh :childApp:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.google.pairing.PairingScreenUITest`

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
