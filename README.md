# Mini-Master: Parental Control Application Suite

Mini-Master is a comprehensive parental control solution built for Android, orchestrated by a Firebase backend. It consists of two main applications: a `masterApp` for parents and a `childApp` for children, along with a web-based control panel.

This system allows parents to define usage rules, set tasks with photo-proof requirements, and remotely lock a child's device in real-time.

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Project Setup](#project-setup)
  - [Prerequisites](#1-prerequisites)
  - [Firebase Setup](#2-firebase-setup)
  - [Backend Installation](#3-backend-installation)
  - [Android Apps Setup](#4-android-apps-setup)
  - [Web Control Panel Setup](#5-web-control-panel-setup)
- [Backend API](#backend-api)
- [Testing](#testing)
- [Known Issues](#known-issues)
- [Further Documentation](#further-documentation)
- [License](#license)

---

## Features

- **Parent & Child Apps:** A dedicated app for the parent (`masterApp`) to set rules and an app for the child (`childApp`) to enforce them.
- **Web Control Panel:** A PC-based web interface providing equivalent functionality to the parent mobile app.
- **Real-Time Locking:** Parents can instantly lock or unlock a child's device from mobile or web.
- **Task Management:** Create tasks with deadlines, review photo proofs from the child, and approve completion.
- **Secure Backend:** Logic is handled by secure Cloud Functions with hardened Firestore security rules.
- **Real-Time Sync:** FCM instantly pushes rule changes and commands to the child device.
- **Subscription Model:** Managed by Google Play Billing and verified by the backend.
- **Internationalization:** Both Android apps support English, German, French, and Chinese (Simplified).

## Project Structure

The repository is a monorepo containing the following main components:

-   **/functions**: The TypeScript Firebase Functions backend. Contains all the business logic, authentication, and database triggers.
-   **/masterApp**: The Android application for parents, written in Kotlin with Jetpack Compose.
-   **/childApp**: The Android application for children, written in Kotlin with Jetpack Compose. This app uses an Accessibility Service to enforce rules.
-   **/web-control**: A simple HTML/JS/CSS frontend that acts as a web-based control panel for parents.
-   **/firestore.rules**: Security rules for the Firestore database.
-   **/storage.rules**: Security rules for Firebase Cloud Storage.

## Technology Stack

-   **Backend**: TypeScript, Node.js, Firebase (Cloud Functions, Firestore, FCM, Cloud Storage)
-   **Android Apps**: Kotlin, Jetpack Compose, Hilt (for Dependency Injection), Coroutines, WorkManager, Jetpack DataStore, Google Play Billing Library.
-   **Web Frontend**: Vanilla JavaScript, HTML5, CSS3.
-   **Testing**: JUnit, Mockito (for Android), Jest (for backend).

---

## Project Setup

Follow these steps to get the project running locally for development.

### 1. Prerequisites
- **Node.js:** v20 or higher.
- **Firebase Account:** A Firebase project is required.
- **Firebase CLI:** `npm install -g firebase-tools`
- **Android Studio:** For building and running the Android apps.
- **Java Development Kit (JDK):** Required by Gradle.

### 2. Firebase Setup

1.  Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2.  **Enable Services**: In your new project, enable the following services:
    -   **Firestore Database**: Create a new database. Start in **test mode** for initial setup (you will deploy the `firestore.rules` later).
    -   **Functions**: Enable the Cloud Functions service.
    -   **Storage**: Enable Cloud Storage.
    -   **Authentication**: No specific provider needs to be enabled as this project uses a custom token/secret system, but the service should be active.
3.  **Register Apps**:
    -   Register two Android apps in your Firebase project settings, one for the `masterApp` and one for the `childApp`. The package names are `com.minimaster.masterapp` and `com.google.pairing` respectively.
    -   Download the `google-services.json` file for **each app**.

### 3. Backend Installation

1.  **Install Dependencies:** From the project root, run:
    ```bash
    npm install
    ```
2.  **Firebase Project:**
    - Log into the Firebase CLI: `firebase login`
    - Associate the project with your local repository: `firebase use --add` and select the project you created.
3.  **Deploy Backend:**
    Deploy the Functions and security rules to your project:
    ```bash
    firebase deploy
    ```

### 4. Android Apps Setup

1.  **Add Firebase Configuration:**
    -   Place the `google-services.json` file you downloaded for the `masterApp` into the `masterApp/` directory.
    -   Place the `google-services.json` file you downloaded for the `childApp` into the `childApp/` directory.
    -   **Note:** For German-speaking users, detailed instructions are available in [FIREBASE_EINRICHTUNG.md](./FIREBASE_EINRICHTUNG.md).
2.  **Build & Run:**
    -   Open the entire project root directory in Android Studio.
    -   Let Android Studio sync the project with Gradle. This will automatically download the Gradle wrapper if needed.
    -   Select the desired app (`masterApp` or `childApp`) from the build configuration dropdown and run it on an emulator or a physical device.

### 5. Web Control Panel Setup

The web control panel provides PC-based access to all parent app functionality.

1.  **Configure Firebase:**
    -   Navigate to the `web-control/` directory.
    -   Copy `firebase-config.template.js` to `firebase-config.js`.
    -   Open `firebase-config.js` and fill in the `firebaseConfig` object with your project's web app configuration from the Firebase console.
2.  **Serve the Web Interface:**
    You can use any static web server. A simple one is Python's built-in server. From the `web-control/` directory, run:
    ```bash
    python3 -m http.server 8000
    # Access at http://localhost:8000
    ```

---

## Backend API

The backend consists of several callable Cloud Functions. See `index.ts` for the full implementation.

-   `registerMasterDevice`: Registers a new parent device and returns a secret key.
-   `generatePairingLink`: Creates a short-lived token for a child device to use for pairing.
-   `validatePairingToken`: Validates the pairing token and links the child to the parent.
-   `setDeviceLocked`: Sets the lock state for a child device.
-   `createTask`, `completeTask`, `approveTask`: Manage the lifecycle of tasks.
-   `verifyPurchase`, `getSubscriptionStatus`: Handle Google Play Billing events.
-   And more for rule-setting, heartbeats, and FCM token registration.

---

## Testing

-   **Backend Unit Tests**: Run `npm test` from the root directory.
-   **Android Manifest Validation**: Run `./validate_manifests.sh` to check for syntax errors.
-   **Manual App Testing**: A detailed manual test plan is available in [Testanleitung.md](Testanleitung.md).

## Known Issues

> **Warning:** This project is a proof-of-concept and is missing critical functionality required for a production-ready parental control application.

-   **Incomplete Android Build Environment:** The execution environment is currently missing the Android SDK, which prevents building and testing the Android applications from the command line.

## Further Documentation

For more details on specific aspects of the project, please see:
- **[ARCHITECTURE.md](ARCHITECTURE.md)**
- **[SECURITY.md](SECURITY.md)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)**

## License

This project is currently unlicensed. Please see the **[LICENSE](LICENSE)** file and add an appropriate open-source license before using this code in a production environment.