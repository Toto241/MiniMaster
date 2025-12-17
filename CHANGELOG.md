# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-12-17

### Security
- Fixed high-severity vulnerability in `jws` package by updating `jsonwebtoken` dependency
- All npm audit vulnerabilities resolved (0 vulnerabilities)

### Changed
- Updated npm dependencies to latest compatible versions:
  - `firebase-admin`: 13.4.0 → 13.6.0
  - `openai`: 6.10.0 → 6.14.0
  - `ts-jest`: 29.4.1 → 29.4.6
  - `@typescript-eslint/eslint-plugin`: 8.48.0 → 8.50.0
  - `@typescript-eslint/parser`: 8.48.0 → 8.50.0
  - `@types/node`: 22.17.1 → 22.19.3

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
