# Mini-Master: Parental Control Application Suite

Mini-Master is a comprehensive parental control solution for Android with a Firebase backend. It consists of two Android apps (`masterApp` for parents, `childApp` for children) plus a lightweight web control panel. The system allows parents to manage their children's device usage, assign tasks, and enforce rules.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Setup & Installation](#setup--installation)
    - [Prerequisites](#prerequisites)
    - [Firebase Setup](#firebase-setup)
    - [Backend Setup](#backend-setup)
    - [Android Apps Setup](#android-apps-setup)
    - [Web Control Panel Setup](#web-control-panel-setup)
- [Usage](#usage)
- [Documentation](#documentation)
- [Testing](#testing)
- [License](#license)

---

## Overview

The Mini-Master suite is designed to give parents control over their children's digital wellbeing. The `masterApp` acts as the command center, allowing parents to pair with child devices, set rules (like app blocking and usage limits), and assign tasks. The `childApp` runs on the child's device, enforcing these rules via an Accessibility Service and allowing the child to complete assigned tasks to earn screen time.

## Features

*   **Secure Pairing:** Pair devices securely using a 6-digit code or a time-limited link.
*   **Remote Locking:** Instantly lock or unlock the child's device from the parent app or web panel.
*   **App Blocking:** Blacklist specific applications to prevent their usage.
*   **Usage Limits:** Set daily usage limits for the device.
*   **Task-Based Unlocking:** Assign tasks to children (e.g., "Clean your room"). The child device remains locked until the child submits photo proof of task completion, which the parent can then approve or reject.
*   **Push Notifications:** Parents receive real-time notifications when a child submits a task for review.
*   **Real-time Synchronization:** Rules and status updates are synced in real-time using Firebase Firestore and Cloud Messaging (FCM).
*   **Web Control Panel:** A web-based interface for parents to manage devices from a browser.
*   **Operator Dashboard:** A secure admin panel for the service operator to manage users, monitor subscriptions, and view system statistics.

## Project Structure

The repository is organized as follows:

*   **`/` (Root):** Contains the TypeScript Firebase Functions backend (`index.ts`, `firebase.ts`) and project configuration.
*   **`/masterApp`:** The Android application for parents (Kotlin, Jetpack Compose, Hilt).
*   **`/childApp`:** The Android application for children (Kotlin, Jetpack Compose, Hilt). Includes the `MiniMasterAccessibilityService` for enforcement.
*   **`/web-control`:** A static web application for parental control.
*   **`/test`:** Backend unit tests.
*   **`/docs`:** Additional documentation and architecture guides.

## Technology Stack

*   **Backend:** TypeScript, Node.js, Firebase (Cloud Functions, Firestore, Authentication, Storage, Messaging).
*   **Android Apps:** Kotlin, Jetpack Compose, Coroutines, Flow, Dagger Hilt, WorkManager, Retrofit/OkHttp (via Firebase SDKs).
*   **Web Frontend:** HTML5, CSS3, Vanilla JavaScript.

---

## Setup & Installation

### Prerequisites

*   **Node.js:** v18 or higher.
*   **Firebase Account:** A Google account to create a Firebase project.
*   **Firebase CLI:** Install globally via `npm install -g firebase-tools`.
*   **Android Studio:** Latest version with Android SDK and JDK 17.

### Firebase Setup

1.  Go to the [Firebase Console](https://console.firebase.google.com/) and create a new project.
2.  Enable the following services:
    *   **Firestore Database:** Start in Test Mode (secure rules later).
    *   **Cloud Functions:** Required for backend logic.
    *   **Authentication:** Enable "Anonymous" or "Email/Password" if needed (custom auth logic is currently used).
    *   **Storage:** For storing task proof photos.
3.  Add two Android apps to your project:
    *   Parent App Package: `com.minimaster.masterapp`
    *   Child App Package: `com.google.pairing` (Note: `com.google.pairing` is the current package ID for legacy reasons, ensure it matches your `build.gradle`).
4.  Download the `google-services.json` file for each app.

### Backend Setup

1.  Navigate to the root directory of the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Login to Firebase:
    ```bash
    firebase login
    ```
4.  Select your project:
    ```bash
    firebase use --add
    ```
5.  Deploy the functions and rules:
    ```bash
    firebase deploy
    ```

### Android Apps Setup

1.  Place the `google-services.json` files:
    *   Copy the parent app JSON to `masterApp/google-services.json`.
    *   Copy the child app JSON to `childApp/google-services.json`.
    *   Keep both files **local only**. They are ignored by git and must never be committed.
    *   Repository-safe placeholders are available as:
        *   `masterApp/google-services.template.json`
        *   `childApp/google-services.template.json`
2.  Open the project root in Android Studio.
3.  Sync Gradle files.
4.  Build and run the `masterApp` on one device/emulator and `childApp` on another.

### Web Control Panel Setup

1.  Navigate to `web-control/`.
2.  Copy `firebase-config.template.js` to `app.js` (or edit `app.js` directly if no template exists).
3.  Replace the placeholder `firebaseConfig` object in `app.js` with your project's configuration (found in Firebase Console > Project Settings).
4.  Serve the directory using a simple HTTP server:
    ```bash
    python3 -m http.server 8000
    ```
5.  Open `http://localhost:8000` in your browser.

---

## Usage

1.  **Registration:** Open the Master App. Grant the necessary permissions to register the device.
2.  **Pairing:**
    *   **Option A (Code):** On the Master App, generate a pairing link/code. Open the Child App via the deep link or enter the code.
    *   **Option B (QR):** (Future implementation)
3.  **Setup Child Device:**
    *   On the Child App, follow the onboarding flow.
    *   **Crucial:** Grant "Accessibility Service" permission when prompted. This is required for app blocking to work.
4.  **Management:**
    *   Use the Master App or Web Panel to lock the device, block apps, or assign tasks.
    *   Monitor the child's status (Online/Offline).

## Documentation

Comprehensive documentation is available in the `docs/` directory:

*   **[Deployment Guide](docs/DEPLOYMENT_GUIDE.md):** Step-by-step instructions for deploying the project to Firebase.
*   **[Project Hardening Plan](docs/PROJECT_HARDENING_PLAN.md):** Overview of identified gaps and the plan to address them.
*   **[Security Test Scenarios](docs/TEST_SCENARIOS_SECURITY.md):** Test cases to validate the security rules and authorization logic.
*   **[Security Best Practices](docs/SECURITY_BEST_PRACTICES.md):** Recommended security enhancements for production deployment.
*   **[Task Unlock Architecture](docs/TASK_UNLOCK_ARCHITECTURE.md):** Detailed architecture of the task-based unlocking feature.
*   **[Admin Panel Architecture](docs/ADMIN_PANEL_ARCHITECTURE.md):** Architecture and security design of the operator dashboard.
*   **[Admin Panel Test Scenarios](docs/TEST_SCENARIOS_ADMIN_PANEL.md):** Test scenarios for the admin panel.

Each source file in this repository is also thoroughly documented. You can explore the code to understand specific implementations:
*   **Backend:** See `index.ts` for API endpoints and business logic.
*   **Android:** See individual Kotlin files for UI and service logic documentation.

## Testing

*   **Backend:** Run `npm test` to execute unit tests.
*   **Android:** Use Android Studio to run instrumentation tests (if available).

## License

[License Information Here]
