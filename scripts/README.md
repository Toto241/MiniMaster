# MiniMaster Helper Scripts

This directory contains helper scripts to automate common setup and maintenance tasks for the MiniMaster project.

## Available Scripts

### 1. setup-admin.js

Creates the first admin user for the Admin Panel.

**Prerequisites:**

- You must have a `serviceAccountKey.json` file in the project root. Download this from Firebase Console > Project Settings > Service Accounts.

**Usage:**

```bash
node scripts/setup-admin.js <email> <password>
```

**Example:**

```bash
node scripts/setup-admin.js admin@minimaster.com SecurePassword123
```

**What it does:**

1. Creates a new user in Firebase Auth with the provided email and password.
2. Sets the `role: 'admin'` custom claim on the user.
3. Displays the login credentials.

### 2. update-firebase-config.sh

Updates the Firebase configuration in the web applications (Admin Panel and Web-Control).

**Usage:**

```bash
./scripts/update-firebase-config.sh
```

**What it does:**

1. Prompts you for your Firebase project configuration (API Key, Auth Domain, etc.).
2. Updates the `firebaseConfig` object in `admin-panel/app.js` and `web-control/app.js`.

**Where to find your Firebase config:**

- Go to Firebase Console > Project Settings > General
- Scroll down to "Your apps"
- Click on the web app icon
- Copy the configuration values

### 3. revalidate-release-gates.ps1

Creates a fresh CI evidence snapshot for release gates (CodeQL + Android CI).

**Prerequisites:**

- GitHub CLI (`gh`) installed and authenticated for the repository.

**Usage:**

```powershell
pwsh ./scripts/revalidate-release-gates.ps1
```

Optional parameters:

```powershell
pwsh ./scripts/revalidate-release-gates.ps1 -Repo Toto241/MiniMaster -OutputFile docs/CI_REVALIDATION_LATEST.md -HistoryLimit 10
```

To request reruns for the latest failed runs before generating the report:

```powershell
pwsh ./scripts/revalidate-release-gates.ps1 -RerunLatestFailed
```

**What it does:**

1. Reads recent runs for workflows `CodeQL Security Analysis` and `Android CI`.
2. Optionally requests reruns for latest failed runs (`-RerunLatestFailed`).
3. Captures latest run, latest success, and failure annotations.
4. Detects GitHub billing/spending-limit blockers in annotations.
5. Writes a Markdown report to `docs/CI_REVALIDATION_LATEST.md` (or custom output path), including a recommendation section.

**Note:** If a rerun was just triggered and is still queued/in-progress, the report marks annotation/billing evaluation as `pending` until the run completes.

### 4. run-security-tests.js

Runs security validation checks from `docs/TEST_SCENARIOS_SECURITY.md`.

**Prerequisites:**

- A Firebase Admin service account key file (default: `serviceAccountKey.json` in repo root).

**Interactive usage:**

```bash
node scripts/run-security-tests.js
```

**CI / non-interactive usage:**

```bash
node scripts/run-security-tests.js --mode ci --admin-email admin@example.com --unauthorized-access-failed true --functions-deployed true
```

Environment variable alternatives for CI:

- `SECURITY_TEST_MODE` (`ci` or `interactive`)
- `SECURITY_TEST_ADMIN_EMAIL`
- `SECURITY_TEST_UNAUTHORIZED_ACCESS_FAILED`
- `SECURITY_TEST_FUNCTIONS_DEPLOYED`
- `SECURITY_TEST_SERVICE_ACCOUNT`

If `.security-test.env` or `scripts/security-test.env` exists, the runner loads values from there automatically.
In CI mode, a missing service account no longer hard-fails the runner; Firebase-backed checks are reported as `SKIP` while the remaining non-interactive checks still run.

NPM script aliases:

- `npm run test:security` (interactive)
- `npm run test:security:ci` (non-interactive, requires CI inputs; Firebase checks are skipped if no service account is configured)

### 5. sync_child_task_translations.py

Synchronizes task-lock related child-app strings across all locale files.

**Check mode (fails if keys are missing):**

```bash
python scripts/sync_child_task_translations.py
```

**Apply mode (adds missing keys):**

```bash
python scripts/sync_child_task_translations.py --apply
```

This script is used by `scripts/test_automation.py` as suite `android-task-translation-check`.

### 6. test_automation.py

Zentraler Python-Runner fuer Build-, Test- und Gate-Suites.

**Inventar und Suite-Liste:**

```bash
python scripts/test_automation.py --inventory
python scripts/test_automation.py --list
```

**Backend + Android (Standard):**

```bash
python scripts/test_automation.py --continue-on-fail
```

**Alle Gruppen (inkl. Device + Release):**

```bash
python scripts/test_automation.py --group all --continue-on-fail
```

**Wichtige Hinweise:**

1. Device-Suites benoetigen ein verbundenes ADB-Geraet/Emulator.
2. `android-usb-master` und `android-usb-child` benoetigen Debug-Secrets in `local.properties`:
    - `debug.session.secret.master`
    - `debug.session.secret.child`
3. Die JSON-Zusammenfassung wird unter `build/test-automation/latest-summary.json` als Historie gespeichert.
4. Mit `--no-append-history` kann das fruehere Ueberschreiben-Verhalten erzwungen werden.

### Security CI input file (optional)

For `scripts/test_automation.py` you can provide security-test inputs in one of these files:

- `.security-test.env` (repo root)
- `scripts/security-test.env`

Template:

```bash
cp scripts/security-test.env.template scripts/security-test.env
```

These values are merged with real environment variables; env vars take precedence.

### 7. emulator_orchestrator.py

Neutrale Host-Orchestrierung für Emulator-/Simulator-Aktionen mit erster Android-Implementierung.

**Aktueller Scope:**

- Plattformneutrale Orchestrator-API für Target-Liste, Boot, Install, Deep-Link, Logs, Screenshot und Video
- Android-Adapter auf Basis von `emulator_manager.py` und `adb_client.py`
- iOS ist bewusst noch nicht implementiert; dafür ist später ein Remote-Mac-Agent vorgesehen

**Gedachter Einsatz:**

- Wiederverwendbare QA-/Commissioning-Szenarien gegen AVDs
- Einheitliche Evidence-Erzeugung (Logcat, Screenshots, Videos)
- Zentraler Einstiegspunkt für spätere Android-/iOS-Adapter

Die fokussierten Python-Tests liegen in `scripts/tests/test_emulator_orchestrator.py`.

## Getting Your Service Account Key

To use the `setup-admin.js` script, you need a service account key:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (gear icon) > **Service Accounts**
4. Click **Generate New Private Key**
5. Save the downloaded JSON file as `serviceAccountKey.json` in the project root

**⚠️ Important:** Never commit `serviceAccountKey.json` to version control. It's already in `.gitignore`.

## Post-Setup Steps

After running these scripts:

1. Deploy your project:

    ```bash
    ./deploy.sh
    ```

2. Test the Admin Panel:

    - Open the Admin Panel URL (from Firebase Hosting)
    - Log in with the admin credentials you created
    - Verify that you can see the dashboard

3. Run security tests:

    - Follow the test scenarios in `docs/TEST_SCENARIOS_SECURITY.md`

## Release Evidence Sync

Nach einem Revalidation-Lauf kann der aktuelle Stand automatisch in die Release-Dokumente geschrieben werden:

```bash
pwsh -File scripts/finalize-release-evidence.ps1
```

Das Skript liest:

- `build/test-automation/latest-summary.json`
- `docs/CI_REVALIDATION_LATEST.md`

und synchronisiert zentrale Statuszeilen in:

- `docs/RELEASE_EVIDENCE_REGISTER.md`
- `docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md`
