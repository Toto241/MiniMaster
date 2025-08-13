# Mini-Master: Parental Control Application Suite

Mini-Master is a comprehensive parental control solution built for Android. It consists of two main applications: a `masterApp` for parents and a `childApp` for children, orchestrated by a Firebase backend.

This system allows parents to define usage rules, set tasks with photo-proof requirements, and remotely lock a child's device in real-time.

For details on the project's structure, security policies, and contribution guidelines, please see:
- **[ARCHITECTURE.md](ARCHITECTURE.md)**
- **[SECURITY.md](SECURITY.md)**
- **[CONTRIBUTING.md](CONTRIBUTING.md)**

## Features

- **Parent & Child Apps:** A dedicated app for the parent to set rules and an app for the child to enforce them.
- **Real-Time Locking:** Parents can instantly lock or unlock a child's device.
- **Task Management:** Create tasks with deadlines, review photo proofs, and approve completion.
- **Secure Backend:** Logic is handled by secure Cloud Functions with hardened security rules.
- **Real-Time Sync:** FCM instantly pushes rule changes and commands to the child device.
- **Subscription Model:** Managed by Google Play Billing and verified by the backend.
- **Internationalization:** Supports English, German, French, and Chinese.

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

### 3. Android Apps Installation & Setup

1.  **Generate Gradle Wrapper (Required First Time):**
    The Gradle wrapper is necessary for reproducible builds. Run this command from the project root:
    ```bash
    gradle wrapper --gradle-version 8.7 --distribution-type all
    ```
2.  **Add Firebase Configuration:**
    - From your Firebase project console, download the `google-services.json` file.
    - Place a copy of this file in **both** the `masterApp/` and `childApp/` directories. This step is mandatory for the apps to connect to your Firebase backend.
3.  **Build & Run:**
    - Open the entire project root directory in Android Studio.
    - Let Android Studio sync the project.
    - Select the desired app (`masterApp` or `childApp`) from the build configuration dropdown and run it on an emulator or a physical device.

---

## Testing
### Backend Unit Tests
The backend functions have a comprehensive unit test suite. To run them:
```bash
# From the project root
npm test
```

### Manual App Testing
A detailed manual test plan is available in **[Testanleitung.md](Testanleitung.md)**. It covers all end-to-end user flows.

### CI/CD
A basic Continuous Integration workflow is defined in `.github/workflows/ci.yml`. It runs tests for the backend and attempts to build the Android apps on every push and pull request.

## License

This project is currently unlicensed. Please see the **[LICENSE](LICENSE)** file and add an appropriate open-source license before using this code in a production environment.