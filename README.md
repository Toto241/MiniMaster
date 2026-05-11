# Mini-Master: Parental Control Application Suite

<!-- markdownlint-disable MD004 MD022 MD029 MD030 MD032 MD041 -->

> [!NOTE]
> Current status: actively maintained prototype with production-oriented backend hardening.
> Core flows are usable; some enforcement capabilities are intentionally still in rollout.
> Release readiness is tracked through explicit QA, CI, legal, Firebase/App Check and Android device-evidence gates.

[![CI/CD Status](https://github.com/Toto241/MiniMaster/actions/workflows/ci.yml/badge.svg)](https://github.com/Toto241/MiniMaster/actions/workflows/ci.yml)

Mini-Master is a comprehensive parental control solution for Android with a Firebase backend. It consists of two Android apps (`masterApp` for parents, `childApp` for children), web/PWA panels, a lightweight operator/admin panel and a Python-powered local operator API. The system allows parents to manage their children's device usage, assign tasks, and enforce rules.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Setup & Installation](#setup--installation)
- [Usage](#usage)
- [Documentation](#documentation)
- [Testing](#testing)
- [Release Readiness](#release-readiness)
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
- **Operator Dashboard:** A secure admin panel for the service operator to manage users, monitor subscriptions, review QA evidence and track release blockers.
- **Python Operator API:** Local operator service for QA catalog, commissioning, emulator visibility and approved command execution.
- **Desktop Launcher:** A native Electron launcher to open both PC panels in one desktop app.
- **PWA Support:** Web panels can be installed on mobile devices (including iOS/Android browsers) as home-screen apps.

## Project Structure

The repository is organized as follows:

- **`/` (Root):** TypeScript Firebase Functions backend (`index.ts`, `firebase.ts`), Firebase/Gradle configuration and project-level scripts.
- **`/src`:** Cloud Functions implementation modules for auth, pairing, device control, tasks, subscriptions, support, legal, admin, decisioning, B2B, affiliate, resilience, validation, rate limiting and error handling.
- **`/masterApp`:** Android application for parents (Kotlin, Jetpack Compose, Hilt).
- **`/childApp`:** Android application for children (Kotlin, Jetpack Compose, Hilt). Includes enforcement via `MiniMasterAccessibilityService`.
- **`/web-control`:** Static web application for parental control.
- **`/admin-panel`:** Operator/admin dashboard including the lightweight `simple.html` operator console.
- **`/python_admin`:** Local Python web application and operator API for admin-panel delivery, QA, commissioning and command orchestration.
- **`/desktop`:** Electron launcher for local PC panels.
- **`/scripts`:** Test, security, Android, QA, CI and release-gate automation.
- **`/qa`:** Machine-readable QA catalogs and release-matrix definitions.
- **`/test`:** Backend unit, integration and Firebase rules tests.
- **`/docs`:** Architecture, legal, release, QA and implementation documentation.

## Technology Stack

- **Backend:** TypeScript, Node.js 22, Firebase (Cloud Functions, Firestore, Authentication, Storage, Messaging).
- **Android Apps:** Kotlin, Jetpack Compose, Coroutines, Flow, Dagger Hilt, WorkManager.
- **Web Frontend:** HTML5, CSS3, Vanilla JavaScript.
- **Operator Tooling:** Python local API, PowerShell/ADB/Gradle command orchestration, Electron desktop launcher.

---

## Setup & Installation

### Prerequisites

- **Node.js:** v22 (matching `package.json` engines; older versions are not a supported release target).
- **Firebase Account:** A Google account to create a Firebase project.
- **Firebase CLI:** Install globally via `npm install -g firebase-tools`.
- **Android Studio:** Latest version with Android SDK and JDK 17.
- **Python:** Python 3 for local operator tooling and QA orchestration.
- **PowerShell:** Required for Windows release-gate and commissioning helper scripts.

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

### Development-Only Reset Flags

For local development and controlled operator recovery, the reset Cloud Functions can be enabled via environment variables.

- `ENABLE_OPERATOR_ACCOUNT_RESET=true`: Enables reset endpoints for the current runtime.
- `MINIMASTER_ENABLE_OPERATOR_ACCOUNT_RESET=true`: Project-scoped alternative for the same reset gate.
- `ADMIN_RECOVERY_TOKEN=<secret>`: Allows `resetAllAuthUsers` to be called without an authenticated admin session.
- `MINIMASTER_ADMIN_RECOVERY_TOKEN=<secret>`: Project-scoped alternative for the recovery token.

Notes:

- These flags are intended for development or controlled recovery only.
- Emulator mode (`FUNCTIONS_EMULATOR=true`) also enables the reset gate.
- Legacy Firebase Runtime Config (`functions.config()` / `minimaster.*`) is no longer used for these reset flows.

### Android Apps Setup

1.  Place the downloaded `google-services.json` files in `masterApp/` and `childApp/`. These files are git-ignored and must not be committed. Use the `.template.json` files as a reference.
2.  Open the project root in Android Studio, sync Gradle, and run the apps on separate devices/emulators.

### Web Control Panel Setup

1.  Navigate to `web-control/`.
2.  Replace the placeholder `firebaseConfig` object in `app.js` with your project's configuration from the Firebase Console.
3.  Serve the directory using a simple HTTP server (e.g., `python -m http.server 8000`).

### Operator Panel Setup

Static mode:

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080/admin-panel/simple.html
```

Python operator mode:

```bash
python3 python_admin/app.py
```

Then open:

```text
http://127.0.0.1:8765/admin-panel/simple.html
```

### Desktop Launcher Setup (PC)

1.  Install dependencies in repository root: `npm install`
2.  Install desktop-specific dependencies: `cd desktop && npm install`
3.  Start desktop launcher: `npm run desktop-start` (from repository root)
4.  Use launcher to open:
    - Parent panel (`web-control`)
    - Operator dashboard (`admin-panel`)

---

## Usage

1.  **Registration & Pairing:** Register the parent device, then generate a pairing code to link the child device.
2.  **Setup Child Device:** Follow the onboarding flow on the child device and grant the crucial **Accessibility Service** permission for app blocking to work.
3.  **Select App Language:** On first launch of each Android app, select the preferred app language before continuing.
4.  **Management:** Use the Master App or Web Panel to lock the device, block apps, or assign tasks.
5.  **Operator Oversight:** Use the operator panel to review QA evidence, release blockers, support access, legal status and commissioning state.

### Supported Android App Languages

Current integrated locales:

- `en`, `de`, `fr`, `zh-CN`, `es`, `pt-BR`, `hi`, `ar`, `id`, `ja`, `ru`, `tr`, `it`, `ko`, `vi`, `pl`, `nl`, `th`, `uk`, `fa`, `bn`, `ur`, `sw`, `he`, `ro`, `cs`, `sv`, `no`, `da`, `fi`, `el`, `hu`

## Documentation

Comprehensive architecture and setup documentation is available in the `docs/` directory. Key documents include:

- **[API Documentation](API_DOCUMENTATION.md):** Detailed reference for all Cloud Functions.
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md):** Step-by-step instructions for deploying the project.
- **[Security Best Practices](docs/SECURITY_BEST_PRACTICES.md):** Recommended security enhancements.
- **[Legacy Auth Inventory](docs/LEGACY_AUTH_INVENTORY.md):** Vollständiges Inventar aller secretKey/IMEI-Endpunkte mit Freeze-Richtlinie.
- **[Auth Migration Plan](docs/AUTH_MIGRATION_PLAN.md):** Phasenplan zur Migration von secretKey/IMEI auf Firebase Auth.
- **[Quality Review 2026-03-17](docs/QUALITY_REVIEW_2026-03-17.md):** Consolidated status for code analysis, tests, GUI checks, and configuration validation.
- **[Repository Folder Implementation Plan](docs/REPOSITORY_FOLDER_IMPLEMENTATION_PLAN_2026-05-11.md):** Current folder-by-folder implementation plan and release-readiness backlog.
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

- **Backend:** Run `npm test` to execute unit and integration tests for Cloud Functions and business logic. The command `npm run lint` checks for code style issues.
- **Central Python test automation:** Run `python scripts/test_automation.py --group backend`, `python scripts/test_automation.py --group android`, or `python scripts/test_automation.py --group all` for a single inventory- and prerequisite-aware entry point. Results are written to `build/test-automation/latest-summary.json`.
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
6. CI gate evidence snapshot (CodeQL + Android CI metadata): `pwsh ./scripts/revalidate-release-gates.ps1`

### Python Test Runner

The repository includes a Python-based orchestrator that inventories and runs the main automated suites across backend, Android, and connected-device scopes.

- `python scripts/test_automation.py --list` lists all known suites.
- `python scripts/test_automation.py --inventory` prints the current test inventory.
- `python scripts/test_automation.py --group backend` runs build, lint, Jest, rules, and security checks.
- `python scripts/test_automation.py --group android` runs Android lint, JVM unit tests, and instrumentation build checks.
- `python scripts/test_automation.py --group device` runs the selected connected tests when `adb` and a device/emulator are available.

Optional: provide security CI inputs via `.security-test.env` or `scripts/security-test.env` (template: `scripts/security-test.env.template`) so `backend-security` can run without ad-hoc shell exports.

Suites with missing external prerequisites are marked as skipped by default with a concrete reason. Use `--strict-skips` if skipped suites should fail the run.

## Release Readiness

Release readiness is intentionally evidence-based. A release is not considered ready only because scripts exist; each blocking area needs current evidence.

Blocking categories:

- GitHub Actions and CodeQL/Code Scanning availability
- backend build, lint, Jest, Firebase rules and security tests
- Android lint, unit tests and instrumentation builds
- Android 10-16 two-device smoke/standard coverage
- Firebase/App Check/secrets readiness
- legacy-auth cutover status
- legal, consent and store-readiness sign-off
- release evidence manifest/export package

Current known limitation:

- Android matrix dry-run evidence is a planning/structure check and must not be treated as a real device pass until emulator/device execution is wired and captured.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
