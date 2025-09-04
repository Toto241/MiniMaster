# Mini-Master: Parental Control Application Suite

Mini-Master is a comprehensive parental control solution built for Android. It consists of two main applications: a `masterApp` for parents and a `childApp` for children, orchestrated by a Firebase backend.

This system allows parents to define usage rules, set tasks with photo-proof requirements, and remotely lock a child's device in real-time.

For details on the project's structure, security policies, and contribution guidelines, please see:
- **[ARCHITECTURE.md](ARCHITECTURE.md)**
- **[SECURITY.md](SECURITY.md)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)**

## Features

- **Parent & Child Apps:** A dedicated app for the parent to set rules and an app for the child to enforce them.
- **Web Control Panel:** A PC-based web interface providing equivalent functionality to the parent mobile app with responsive design optimized for mobile devices.
- **Real-Time Locking:** Parents can instantly lock or unlock a child's device from mobile or web.
- **Task Management:** Create tasks with deadlines, review photo proofs, and approve completion.
- **Secure Backend:** Logic is handled by secure Cloud Functions with hardened security rules.
- **Real-Time Sync:** FCM instantly pushes rule changes and commands to the child device.
- **Subscription Model:** Managed by Google Play Billing and verified by the backend.
- **Internationalization:** Both the `childApp` and `masterApp` support English, German, French, and Chinese (Simplified) with complete localization.
- **Mobile-Optimized:** All applications include mobile display considerations with responsive layouts, touch-friendly controls, and multi-screen support.

## Current Status & Known Issues

> **Warning:** This project is a proof-of-concept and is missing critical functionality required for a production-ready parental control application.

- **Missing Core `childApp` Functionality:** The `childApp` **does not** currently implement an `Accessibility Service`. This service is essential for monitoring app usage and blocking applications, which are core features of a parental control app. The existing code includes a screen to *request* these permissions, but the service itself is not built.  
- **Incomplete Android Build Environment:** The execution environment is currently missing the Android SDK, which prevents building and testing the Android applications from the command line.

---

## Project Setup

Follow these steps to get the project running locally for development.

### 1. Prerequisites
- **Node.js:** v20 or higher.
- **Firebase Account:** A Firebase project is required.
- **Firebase CLI:** `npm install -g firebase-tools`
- **Android Studio:** For running the Android apps.
- **Gradle:** A local installation of Gradle is needed to generate the wrapper.

### 2. Backend Installation & Setup

1.  **Install Dependencies:** From the project root, run:
    ```bash
    npm install
    ```
2.  **Firebase Project:**
    - Log into the Firebase CLI: `firebase login`
    - Associate the project: `firebase use --add` and select your project.
3.  **Deploy Backend:**
    Deploy the Functions and security rules to your project:
    ```bash
    firebase deploy
    ```

### 3. Web Control Panel Setup

The web control panel provides PC-based access to all parent app functionality through a browser interface.

1.  **Navigate to Web Control Directory:**
    ```bash
    cd web-control
    ```

2.  **Configure Firebase:**
    - Open `app.js` and replace the `firebaseConfig` object with your actual Firebase project configuration
    - Or copy `firebase-config.template.js` to `firebase-config.js` and fill in your details

3.  **Serve the Web Interface:**
    You can use any static web server or host it on Firebase Hosting:
    
    **Option A: Simple HTTP Server (for testing)**
    ```bash
    python3 -m http.server 8000
    # Access at http://localhost:8000
    ```
    
    **Option B: Firebase Hosting**
    ```bash
    firebase init hosting
    # Copy web-control files to public directory
    firebase deploy --only hosting
    ```

4.  **Access the Interface:**
    - Open your browser and navigate to the served URL
    - Login with the same Master IMEI and Secret Key used in the mobile app
    - Enjoy full parental control functionality from your PC!

### 4. Android Apps Installation & Setup

1.  **Generate Gradle Wrapper (Required First Time):**
    The Gradle wrapper is necessary for reproducible builds. Run this command from the project root:
    ```bash
    gradle wrapper --gradle-version 8.14.3 --distribution-type all
    ```
2.  **Add Firebase Configuration:**
    - From your Firebase project console, download the `google-services.json` file.
    - Place a copy of this file in **both** the `masterApp/` and `childApp/` directories. This step is mandatory for the apps to connect to your Firebase backend.
3.  **Build & Run:**
    - Open the entire project root directory in Android Studio.
    - Let Android Studio sync the project.
    - Select the desired app (`masterApp` or `childApp`) from the build configuration dropdown and run it on an emulator or a physical device.

4.  **Command-Line Builds:**
    To build the debug APKs from the command line, use the following commands from the project root:
    ```bash
    # Build the childApp
    ./gradlew :childApp:assembleDebug

    # Build the masterApp
    ./gradlew :masterApp:assembleDebug
    ```

---

## Testing
### Backend Unit Tests
The backend functions have a comprehensive unit test suite. To run them:
```bash
# From the project root
npm test
```

### Android Manifest Validation
Before building or testing Android apps, validate the manifest files:
```bash
# From the project root
./validate_manifests.sh
```
This helps catch XML syntax errors that could cause build failures.

### Manual App Testing
A detailed manual test plan is available in **[Testanleitung.md](Testanleitung.md)**. It covers all end-to-end user flows.

### CI/CD
A basic Continuous Integration workflow is defined in `.github/workflows/ci.yml`. It runs tests for the backend and attempts to build the Android apps on every push and pull request.

**Note:** In restricted network environments where `dl.google.com` is blocked, Android CI tests are automatically skipped with clear warnings. See **[ANDROID_CI_NETWORK_LIMITATION.md](ANDROID_CI_NETWORK_LIMITATION.md)** for details and alternative validation approaches.

## License

This project is currently unlicensed. Please see the **[LICENSE](LICENSE)** file and add an appropriate open-source license before using this code in a production environment.