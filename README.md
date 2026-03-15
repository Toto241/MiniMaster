# Mini-Master: Parental Control Application Suite

<!-- markdownlint-disable MD004 MD022 MD029 MD030 MD032 MD041 -->

> [!NOTE]
> This repository is in its final, stable state. All development activities have been completed, and the project is production-ready.

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

- **Node.js:** v18 or higher.
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
2.  Login to Firebase: `firebase login`
3.  Select your project: `firebase use --add`
4.  Deploy the functions and rules: `firebase deploy`

### Android Apps Setup

1.  Place the downloaded `google-services.json` files in `masterApp/` and `childApp/`. These files are git-ignored and must not be committed. Use the `.template.json` files as a reference.
2.  Open the project root in Android Studio, sync Gradle, and run the apps on separate devices/emulators.

### Web Control Panel Setup

1.  Navigate to `web-control/`.
2.  Replace the placeholder `firebaseConfig` object in `app.js` with your project's configuration from the Firebase Console.
3.  Serve the directory using a simple HTTP server (e.g., `python3 -m http.server 8000`).

### Desktop Launcher Setup (PC)

1.  Install dependencies in repository root: `npm install`
2.  Start desktop launcher: `npx electron desktop/main.js`
3.  Use launcher to open:
    - Parent panel (`web-control`)
    - Operator dashboard (`admin-panel`)

---

## Usage

1.  **Registration & Pairing:** Register the parent device, then generate a pairing code to link the child device.
2.  **Setup Child Device:** Follow the onboarding flow on the child device and grant the crucial **Accessibility Service** permission for app blocking to work.
3.  **Management:** Use the Master App or Web Panel to lock the device, block apps, or assign tasks.

## Documentation

Comprehensive architecture and setup documentation is available in the `docs/` directory. Key documents include:

- **[API Documentation](API_DOCUMENTATION.md):** Detailed reference for all Cloud Functions.
- **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md):** Step-by-step instructions for deploying the project.
- **[Security Best Practices](docs/SECURITY_BEST_PRACTICES.md):** Recommended security enhancements.
- **[Architecture Decision Records](docs/adr/):** Key architectural decisions and their rationale.

Each source file is also thoroughly documented.

## Testing

The project has a comprehensive test suite to ensure code quality and stability.

- **Backend:** Run `npm test` to execute over 100 unit and integration tests for all Cloud Functions and business logic. The command `npm run lint` checks for code style issues.
- **Android:** The project is configured for unit tests (`/src/test`) and end-to-end instrumentation tests (`/src/androidTest`) which can be run via Android Studio.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
