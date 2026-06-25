# AGENTS.md

## Cursor Cloud specific instructions

This repo is a multi-platform parental-control suite. On the Linux cloud VM, only a
subset of the products can actually run; the rest need hardware/OS that is unavailable here.

### What runs on this Linux VM
- **TypeScript Firebase Functions backend** (root): build, lint, and the Jest suite all run
  locally. Standard commands live in `package.json` (`npm run build`, `npm run lint`,
  `npm test`) and `README.md`; no need to duplicate them here.
- **Python operator console/API** (`python_admin/`): a stdlib-only local server (no `pip`
  install needed). See "Operator server" below for the one non-obvious gotcha.

### What does NOT run here (needs external setup)
- **Android apps** (`masterApp/`, `childApp/`): need the Android SDK; only JDK 21 is present
  (project targets JDK 17). Not set up on this VM.
- **iOS apps** (`ios*/`): require macOS + Xcode. Impossible on Linux.
- **Full admin dashboard** (`admin-panel/index.html`): the left-nav and all data tabs are
  hidden until a Firebase Auth operator login succeeds (`showDashboard` only runs from
  `onAuthStateChanged`). This needs a real Firebase project + operator account, so the full
  dashboard GUI is not usable without external Firebase credentials. The lightweight console
  `admin-panel/simple.html` loads with no auth.

### Operator server (important gotcha)
- Supported start paths from the repo root:
  - `./start.sh` (Linux/cloud)
  - `start.bat` (Windows)
  - direct start via `python python_admin/app.py` or `python -m python_admin.app`
- On the Linux cloud VM, only `python3` is on PATH (no `python`), so use the equivalent
  `python3 ...` commands there (for example `python3 python_admin/app.py` or
  `python3 -m python_admin.app`).
- It serves on `http://127.0.0.1:8765`. Health check: `GET /api/runtime-info`.
- Its `/api/*` endpoints work without Firebase. The console's core action — orchestrating QA
  suites — is reachable via `POST /api/suites/run` with `{"suiteId": "..."}`, then poll
  `GET /api/suites/status/<runId>`. Suite ids come from `GET /api/suites` (e.g.
  `backend-build`, `backend-lint`). These shell out to the real `npm run ...` commands.

### Firebase emulator caveat
- The Firestore emulator starts fine, but the **Functions emulator fails to load functions**
  because `package.json` declares `engines.node: ">=22"` while `firebase-tools` expects an
  exact major (`20`/`22`/`24`). Don't expect callable functions to be invokable via
  `firebase emulators:start` without changing that field.
