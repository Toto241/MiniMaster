# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **iOS Anti-Tamper (Family-Controls-Entzug)**: Neuer `TamperMonitor` (iOS Kind) erkennt den Entzug der Family-Controls-/Bildschirmzeit-Autorisierung — den einzigen realistischen Tamper-Vektor auf iOS (kein Uninstall-/Device-Admin-Callback wie Android). Bei `approved → not-approved` meldet `CommandSyncService.reportTamperIfDetected` ein `tamper_detected`-Event (`reason: family_controls_revoked`) an die Eltern (Analogon zu Androids `accessibility_service_disabled`), verdrahtet in App-Start und Foreground-Heartbeat. Zustandspersistenz verhindert Fehlalarme bei Neuinstallation und Doppelmeldungen; nur nach erfolgreichem Publish wird quittiert. Contract-Test `test/ios-anti-tamper-contract.test.ts`.
- **Einrichtungs-Assistenten (Wizards)**: Mehrere geführte Wizards für die Einrichtung von MiniMaster — von null beginnend oder je Konfiguration.
  - **Backend** `src/wizard-progress.ts`: generischer Fortschritts-Tracker (`getWizardProgress` / `setWizardProgress` / `listWizardProgress`) pro Nutzer in `wizardProgress/{uid}` (validiert, größenbegrenzt, nur nicht-geheime Daten), neue Audit-Aktion `wizard.progress_update`, Firestore-Deny-Regel (nur Cloud Functions).
  - **Wizard-Hub** (`admin-panel/wizards.html`): zentrale Übersicht aller Assistenten mit Live-Fortschritt und Projekt-Readiness; verlinkt aus dem Betreiber-Dashboard.
  - **Komplett-Einrichtung von Null** (`admin-panel/setup-complete-wizard.html`): orchestriert Firebase → Secrets → Rollen/Admin-PIN → Commissioning-Gates → Validierung.
  - **Eltern-Onboarding** (`parent-panel/onboarding-wizard.html`): Kindgerät koppeln, erste Regeln/Aufgaben, Abo prüfen.
  - **Kind-Pairing & Berechtigungen** (`child-panel/pairing-wizard.html`): Koppeln per Code/Link + Erklärung der nötigen Berechtigungen.
  - **Konfig-Wizards** (`admin-panel/config-wizards.html`): Externe Integrationen, Abo/Preise (informativ), Backup & Reset.
  - Alle Wizards CSP-konform (keine Inline-Handler/Skripte) und mit Fortschritts-Persistenz; 9 neue Backend-Tests.
- **Vollständige Projektlöschung** (`purgeAllProjectData`): Neue Admin-Cloud-Function, die ALLE Projektdaten unwiderruflich entfernt — sämtliche Firestore-Collections inkl. verschachtelter Subcollections (`usageHistory`, `tamperEvents`, `commands`, `events`, `conversationHistory` …), alle Cloud-Storage-Objekte und optional alle Firebase-Auth-Nutzer. Ergänzt `deleteUserAccount` (Einzelkonto) und `resetAllAuthUsers` (nur Auth). Abgesichert durch dieselbe Reset-Gating (Feature-Flag, Projekt-Allowlist, Admin/Recovery-Token, T4 + Admin-PIN, Bestätigungstext `DELETE_ALL_PROJECT_DATA`).
- Betreiber-Dashboard: Button „🗑️ Alle Projektdaten löschen" im Einrichtungs-/Recovery-Bereich mit Doppelbestätigung.
- 8 neue Tests (`test/purge-project-data.test.ts`) für Gating, Firestore-/Storage-/Auth-Löschung und Fehlerpfade.

## [2.2.0] - 2026-03-19

### Fixed
- **Betreiber-Dashboard INTERNAL-Fehler behoben**: `bootstrapFirstAdmin` verwendete `admin.auth()` direkt statt des lazy Getters `auth()` aus `firebase.ts`. Bei Cold Start war die Firebase-App nicht initialisiert -> unbehandelte Exception -> "INTERNAL"-Fehler. Alle `admin.auth()`-Aufrufe in `src/auth.ts` und `src/admin.ts` auf `auth()` migriert.
- Test-Mocks in 6 Test-Dateien aktualisiert um `../firebase`-Mock mit `auth`-Export zu unterstützen.

### Added
- **Session-Timeout (30 Min Inaktivität)**: Automatischer Logout bei Inaktivität in Betreiber-Dashboard und Eltern-Panel. Warnung 5 Minuten vor Ablauf. Tracking von mousedown, keydown, scroll, touchstart Events.
- **Legacy-Auth Inventar** (`docs/LEGACY_AUTH_INVENTORY.md`): Vollständige Auflistung aller secretKey/IMEI-Endpunkte mit Freeze-Richtlinie. Keine neuen Legacy-Auth-Endpunkte erlaubt.
- **Foto-Proof Server-Validierung**: `completeTask` validiert jetzt `photoUrl` als Firebase Storage URL (SSRF-Schutz) und erzwingt max. 2048 Zeichen URL-Länge.
- **Erweiterte Firestore-Emulator-Tests**: 6 neue Tests für `families/*` Deny-Guard, unauthentifizierten Zugriff, ungültige Task-Felder, Cross-Tenant-Zugriff und Child-eigene Task-Reads.
- Freeze-Kommentare an `generateCustomToken` und `registerMasterDevice` (Legacy-Auth-Warnung mit Verweis auf Migrationsplan).

### Changed
- **BlockingOverlayService gehärtet**: `FLAG_NOT_TOUCH_MODAL` entfernt — Overlay fängt jetzt alle Touch-Events ab, keine Durchleitung an blockierte Apps mehr.

### Security
- photoUrl-Validierung verhindert SSRF/Injection über manipulierte URLs in Task-Beweisfotos.
- Session-Timeout reduziert Risiko durch unbeaufsichtigte Sessions.
- CSP-Headers bereits in `firebase.json` für beide Hosting-Targets konfiguriert (bestätigt).

## [2.1.0] - 2026-03-15

### Added
- **7-Day Free Trial**: New users automatically receive a 7-day trial period upon registration with full access to all features.
- `hasActiveAccess()` helper function for centralized subscription/trial access checks.
- `checkExpiredSubscriptions` now also detects and marks expired trials (`trial_expired` status).
- `getSubscriptionStatus` returns enriched trial information including `trialDaysRemaining`, `isTrialActive`, and `hasAccess`.
- 3 new integration tests covering trial lifecycle (active trial, expired trial, trial_expired status).
- `toMillis()` method added to `MockTimestamp` in integration test mocks.

### Changed
- **Monetization Model**: Replaced the free-tier (1 child free) with a trial-based model. After the 7-day trial, a subscription is required even for a single child device.
- `registerMasterDevice` now sets `subscription.status = "trial"` with `trialStartedAt` and `trialEndsAt` timestamps.
- `validatePairingCode` and `generatePairingLink` now use `hasActiveAccess()` instead of the old `isPremium` check, blocking pairing when neither trial nor subscription is active.
- Updated existing tests to expect the new `hasAccess` field in `getSubscriptionStatus` responses.

### Removed
- Removed the free-tier logic that allowed 1 child device without a subscription.

## [2.0.0] - 2026-03-15

### Added
- Added a final status note and CI/CD badge to `README.md`.

### Changed
- **Finalized Repository State**: This release marks the final, stable state of the project.
- Consolidated and simplified project documentation, removing over 25 redundant or outdated status reports and markdown files.
- Updated `README.md` to reflect the final project structure and remove broken links.
- Updated `.gitignore` to exclude common OS-specific files, temporary files, and IDE configurations.

### Fixed
- Fixed a failing integration test (`support-and-subscription.integration.test.ts`) by correcting the payload for the `createTask` function.
- Removed an unused variable in the test suite to eliminate a linting warning.

### Removed
- Closed 6 open Pull Requests that were either outdated or had their changes merged into `main`.
- Deleted over 25 stale remote branches to clean up the repository.
- Removed temporary files (`test.txt`, `*.tmp`, etc.) and unnecessary workspace configurations (`.vscode/`, `Tools.code-workspace`) from the repository.

## [1.1.1] - 2026-02-13

### Added
- Added multi-layer backend test suites for higher quality confidence:
  - Module tests: `test/module/firebase.module.test.ts`
  - Integration tests: `test/integration/task-lifecycle.integration.test.ts`
  - System tests: `test/system/access-control.system.test.ts`
  - High-impact coverage suite: `test/coverage-high-impact.test.ts`
- Added PR handoff documentation for this quality uplift in `pull_requests/PR_coverage_and_test_maturity_2026-02-13.md`.

### Changed
- Modernized backend callable tests to align with the current `context.auth` contract.
- Stabilized lint and TS project scoping with `tsconfig.eslint.json` and updated ESLint ignore patterns.
- Updated Jest/TypeScript isolated modules configuration to remove deprecated ts-jest config usage.

### Fixed
- Fixed Windows-incompatible test script invocation in `package.json` by switching to direct Jest JS entrypoint.
- Fixed strict null-safety issue in `revokeSubscription` (`index.ts`) for `context.auth` handling.
- Resolved historical failing test assumptions based on legacy payload authentication fields.

### Security
- Removed committed Firebase app config files (`masterApp/google-services.json`, `childApp/google-services.json`) from the repository.
- Added git protection rules to prevent future commits of `google-services.json` and `GoogleService-Info.plist`.
- Added safe template placeholders (`google-services.template.json`) for local setup guidance.

### Quality
- Achieved green backend verification gates:
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run test:ci --silent`
  - `npm run test:ci -- --coverage --silent`
- Coverage significantly increased and thresholds satisfied without lowering limits.

## [1.1.0] - 2025-12-17

### Security
- Fixed high-severity vulnerability in `jws` package by updating `jsonwebtoken` dependency
- All npm audit vulnerabilities resolved (0 vulnerabilities)
- Comprehensive Gradle/Android security updates to address 30+ CVEs:
  - Log4j updated to 2.24.3 (CVE-2021-44228 "Log4Shell")
  - Jackson-databind updated to 2.18.2 (CVE-2022-42003, CVE-2023-35116)
  - Apache Commons Text updated to 1.13.0 (CVE-2022-42889 "Text4Shell")
  - Netty updated to 4.1.116.Final (CVE-2024-47535)
  - Protocol Buffers updated to 4.29.2 (CVE-2024-7254)
  - Guava updated to 33.4.0-jre (CVE-2023-2976)
  - Apache Commons Compress updated to 1.27.1 (CVE-2024-25710, CVE-2024-26308)
  - Spring Framework updated to 6.2.1 (CVE-2024-22262, CVE-2024-22259)
  - Nimbus JOSE+JWT updated to 9.47 (CVE-2023-52428)
  - BouncyCastle updated to 1.79
  - Okio updated to 3.9.1 (Signed to Unsigned Conversion Error)
  - JDOM2 updated to 2.0.6.1 (CVE-2021-33813 XXE Injection)
  - Logback updated to 1.5.15 (CVE-2023-6378, CVE-2024-12798)

### Changed
- Updated npm dependencies to latest compatible versions:
  - `firebase-admin`: 13.4.0 → 13.6.0
  - `openai`: 6.10.0 → 6.14.0
  - `ts-jest`: 29.4.1 → 29.4.6
  - `@typescript-eslint/eslint-plugin`: 8.48.0 → 8.50.0
  - `@typescript-eslint/parser`: 8.48.0 → 8.50.0
  - `@types/node`: 22.17.1 → 22.19.3
- Updated Android/Gradle dependencies:
  - Kotlin: 1.8.20 → 2.0.21
  - Android Gradle Plugin: 8.12.2 → 8.7.3
  - Hilt: 2.48 → 2.51.1
  - Firebase SDKs to December 2025 versions
  - AndroidX libraries to latest stable versions
  - Target SDK: 34 → 35
  - Min SDK: 21 → 24
  - Java compatibility: 1.8 → 17

### Fixed
- Corrected `setAdminClaim` test case to match actual function behavior (permission check occurs before argument validation)
- All backend tests now pass (68/68)

## [1.0.0] - 2025-09-03

### Added
- Initial implementation of `masterApp` and `childApp` Android applications
- Core backend Cloud Functions for device pairing
- Firebase Cloud Functions backend with TypeScript
- Firestore security rules for data access control
- Storage rules for task proof photos
- Eltern-Panel for browser-based management
- Betreiber-Dashboard for operations and support
- AI-powered support agent with Gemini 2.5 Flash integration
- GDPR-compliant support interface
- Complete production deployment automation
- Comprehensive documentation suite

### Features
- Secure device pairing with 6-digit codes
- Remote device locking/unlocking
- App blocking functionality
- Task-based unlocking system with photo proof
- Push notifications via FCM
- Real-time synchronization via Firestore
- Multi-language support (English, German, French, Chinese)
- Subscription management with Google Play Billing

### Security
- Server-authoritative business logic
- Role-based access control
- Firebase App Check integration
- Secure token generation for web control panel

---

*This changelog documents the evolution of the Mini-Master project.*
