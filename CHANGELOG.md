# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Web control panel for browser-based management
- Admin panel for operator dashboard
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
