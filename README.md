# Mini-Master: Parental Control Application Suite

Mini-Master is a comprehensive parental control solution built for Android. It consists of two main applications: a `masterApp` for parents and a `childApp` for children, orchestrated by a Firebase backend.

This system allows parents to define usage rules, set tasks with photo-proof requirements, and remotely lock a child's device in real-time.

## Features

- **Parent & Child Apps:** A dedicated app for the parent to set rules and an app for the child to enforce them.
- **Real-Time Locking:** Parents can instantly lock or unlock a child's device by setting an `isLocked` flag in Firestore.
- **Task Management:** Parents can create tasks with deadlines. Children can complete them and provide photo proof, which parents can then approve to unlock features.
- **Secure Backend:** All logic is handled by secure Cloud Functions. Direct database access from clients is disabled by default.
- **Real-Time Sync:** Cloud Functions use FCM to instantly push rule changes and commands to the child device.
- **Subscription Model:** The parent app includes a subscription model managed by Google Play Billing and verified by the backend.
- **Internationalization:** The apps support English, German, French, and Chinese.

## Technology Stack

- **Backend:** Firebase Cloud Functions (TypeScript), Firestore, Firebase Storage
- **Parent App (`masterApp`):** Native Android (Kotlin, Jetpack Compose, Hilt, Google Play Billing)
- **Child App (`childApp`):** Native Android (Kotlin, Jetpack Compose, Hilt)
- **Testing:** Mocha, Chai, Sinon for backend unit tests.

---

## Setup & Installation

Follow these steps to get the project running locally for development and testing.

### 1. Backend Setup (Cloud Functions)

The backend must be deployed for the apps to function correctly.

1.  **Prerequisites:**
    *   Node.js and npm installed.
    *   Firebase CLI installed (`npm install -g firebase-tools`).
    *   Logged into Firebase (`firebase login`).

2.  **Installation:**
    Navigate to the project root and install the dependencies:
    ```bash
    npm install
    ```

3.  **Deployment:**
    Deploy the functions to your Firebase project:
    ```bash
    firebase deploy --only functions
    ```

### 2. Android Apps Setup

Both `masterApp` and `childApp` need to be configured to connect to your Firebase project.

1.  **Prerequisites:**
    *   Android Studio installed.
    *   A Google account with a configured Firebase project.

2.  **Configuration (`google-services.json`):**
    *   From your Firebase project console, download the `google-services.json` configuration file for the Android app (ensure the package name matches, e.g., `com.minimaster.masterapp`).
    *   Place this file in the `masterApp/` directory.
    *   Repeat the process for the `childApp`, placing its `google-services.json` in the `childApp/` directory.
    *   **Note:** The `childApp`'s `build.gradle` now includes the necessary `com.google.gms.google-services` plugin.

3.  **Gradle Wrapper (User Action Required):**
    This project does not ship with the Gradle wrapper (`gradlew`). You will need to generate it if you wish to use Gradle from the command line.
    *   Ensure you have a local Gradle installation.
    *   From the project root, run: `(cd masterApp && gradle wrapper)` and `(cd childApp && gradle wrapper)`.

4.  **Building & Running:**
    *   Open the entire project root directory in Android Studio.
    *   Let Android Studio sync the project.
    *   Select the desired app (`masterApp` or `childApp`) from the build configuration dropdown and run it on an emulator or a physical device.

---

## Testing

The project includes a suite of tests for the backend and a detailed manual testing guide for the apps.

### Backend Unit Tests

The backend functions have a comprehensive unit test suite. To run them:
```bash
# From the project root
npm test
```

### Manual App Testing

Due to the missing Gradle wrapper in the repository, automated Android tests must be run from within Android Studio. For a full end-to-end verification, follow the detailed steps in **[Testanleitung.md](Testanleitung.md)**. This guide covers:
-   Initial device pairing.
-   Device locking and unlocking.
-   Creating, completing, and approving tasks.

---

## Troubleshooting

- **Firestore Permission Errors:** Ensure your `firestore.rules` are deployed (`firebase deploy --only firestore`). Direct client access is disabled by design; all interactions must go through the Cloud Functions.
- **Android App Build Fails:** Make sure you have placed the correct `google-services.json` file in both the `masterApp` and `childApp` directories.
- **Tests Failing:** If `npm test` fails, ensure all dependencies are installed by running `npm install`.

---

## License

This project is currently unlicensed. Please add a `LICENSE` file before using this code in a production environment.
