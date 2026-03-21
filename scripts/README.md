# MiniMaster Helper Scripts

This directory contains helper scripts to automate common setup and maintenance tasks for the MiniMaster project.

## Available Scripts

### 1. setup-admin.js

Creates the first admin user for the Admin Panel.

**Prerequisites:**
*   You must have a `serviceAccountKey.json` file in the project root. Download this from Firebase Console > Project Settings > Service Accounts.

**Usage:**
```bash
node scripts/setup-admin.js <email> <password>
```

**Example:**
```bash
node scripts/setup-admin.js admin@minimaster.com SecurePassword123
```

**What it does:**
1.  Creates a new user in Firebase Auth with the provided email and password.
2.  Sets the `role: 'admin'` custom claim on the user.
3.  Displays the login credentials.

### 2. update-firebase-config.sh

Updates the Firebase configuration in the web applications (Admin Panel and Web-Control).

**Usage:**
```bash
./scripts/update-firebase-config.sh
```

**What it does:**
1.  Prompts you for your Firebase project configuration (API Key, Auth Domain, etc.).
2.  Updates the `firebaseConfig` object in `admin-panel/app.js` and `web-control/app.js`.

**Where to find your Firebase config:**
*   Go to Firebase Console > Project Settings > General
*   Scroll down to "Your apps"
*   Click on the web app icon
*   Copy the configuration values

### 3. revalidate-release-gates.ps1

Creates a fresh CI evidence snapshot for release gates (CodeQL + Android CI).

**Prerequisites:**
*   GitHub CLI (`gh`) installed and authenticated for the repository.

**Usage:**
```powershell
pwsh ./scripts/revalidate-release-gates.ps1
```

Optional parameters:

```powershell
pwsh ./scripts/revalidate-release-gates.ps1 -Repo Toto241/MiniMaster -OutputFile docs/CI_REVALIDATION_LATEST.md -HistoryLimit 10
```

**What it does:**
1.  Reads recent runs for workflows `CodeQL Security Analysis` and `Android CI`.
2.  Captures latest run, latest success, and failure annotations.
3.  Detects GitHub billing/spending-limit blockers in annotations.
4.  Writes a Markdown report to `docs/CI_REVALIDATION_LATEST.md` (or custom output path).

## Getting Your Service Account Key

To use the `setup-admin.js` script, you need a service account key:

1.  Go to [Firebase Console](https://console.firebase.google.com/)
2.  Select your project
3.  Go to **Project Settings** (gear icon) > **Service Accounts**
4.  Click **Generate New Private Key**
5.  Save the downloaded JSON file as `serviceAccountKey.json` in the project root

**⚠️ Important:** Never commit `serviceAccountKey.json` to version control. It's already in `.gitignore`.

## Post-Setup Steps

After running these scripts:

1.  Deploy your project:
    ```bash
    ./deploy.sh
    ```

2.  Test the Admin Panel:
    *   Open the Admin Panel URL (from Firebase Hosting)
    *   Log in with the admin credentials you created
    *   Verify that you can see the dashboard

3.  Run security tests:
    *   Follow the test scenarios in `docs/TEST_SCENARIOS_SECURITY.md`
