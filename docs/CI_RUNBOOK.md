# CI Runbook

Status: definitive reference for CI gate expectations and pass criteria.

## 1. Pipeline Overview

| Workflow | Trigger | Gates | Required |
|----------|---------|-------|----------|
| CI (`ci.yml`) | Push/PR on TS, Kotlin, Gradle, package files | Build, Lint, Test (Backend + Android) | Yes |
| Node CI (`node-ci.yml`) | Push/PR on TS, package files | Lint, Test, Coverage Upload | Yes |
| Firestore Rules CI (`firestore-rules-ci.yml`) | Push/PR on rules, test files | Structural + Emulator Rules Tests | Yes |
| CodeQL (`codeql-analysis.yml`) | Push/PR to main + weekly | Security Scanning (JS, Java/Kotlin) | Yes |
| Deploy (`deploy.yml`) | Push to main | Firebase Deploy | Manual approval |
| Android CI (`android-ci.yml`) | Push/PR on Kotlin, Gradle files | Build, Unit Tests, Lint, Detekt, Ktlint | Yes |
| Dependency Submission (`dependency-submission.yml`) | Push | Gradle Dependency Graph | Informational |

## 2. Expected Pass Criteria

### Backend (Functions)

| Gate | Command | Pass Criteria |
|------|---------|--------------|
| Build | `npm run build` | Exit code 0, no TypeScript errors |
| Lint | `npm run lint` | Exit code 0, no ESLint errors |
| Test | `npm test` | All test suites pass (17 suites, 240+ tests) |
| Coverage | Checked via lcov | Statements > 75%, Functions > 80% |

### Android

| Gate | Command | Pass Criteria |
|------|---------|--------------|
| Build | `./gradlew assembleDebug` | Exit code 0 |
| Unit Tests | `./gradlew testDebugUnitTest` | All tests pass |
| Lint | Android Lint | No critical/error-level issues |
| Detekt | `./gradlew detektAll` | No violations |
| Ktlint | `./gradlew ktlintCheck` | No style violations |

### Firestore Rules

| Gate | Command | Pass Criteria |
|------|---------|--------------|
| Structural | `npm run test:rules:structural` | All rule structure tests pass |
| Emulator | `npm run test:rules:emulator` | All emulator-backed rule tests pass |

## 3. Known CI Behaviors

### Network-Dependent Android Steps

Android CI requires access to `dl.google.com` for Google Maven. If the network test fails:

- Android build/test steps are skipped gracefully.
- A warning annotation is added to the run.
- Backend tests remain the primary quality gate.

This is an accepted limitation for restricted CI environments.

### Emulator Tests

Firestore emulator tests require the Firebase emulator suite. These run via `firebase-tools emulators:exec` and may have higher latency. Occasional timeout failures should be retried once before investigating.

## 4. Artifact Retention

| Artifact | Workflow | Retention |
|----------|----------|-----------|
| Backend coverage report | CI | 30 days |
| Android build reports | CI | Default (90 days) |
| Node coverage | Node CI | Default (90 days) |

## 5. Flaky Test Policy

1. Any test that fails intermittently must be investigated within 2 business days.
2. If a flaky test cannot be fixed immediately, it must be marked with a skip annotation and a tracking issue created.
3. No more than 2 skipped tests are permitted at any time.
4. Flaky tests must never be silently ignored.

## 6. Release Gate Evidence

For each release candidate, archive the following CI outputs:

1. CI workflow run URL with green status for the target commit.
2. Coverage report artifact download link.
3. CodeQL security scan result (zero high/critical alerts).
4. Android build report artifact (if Android changes are included).

These links must be recorded in the release evidence register.

## 7. Local Reproduction

To reproduce CI gates locally:

```bash
# Backend
npm install
npm run build
npm run lint
npm test

# Full readiness validation
npm run validate:readiness

# Firestore rules (structural only, no emulator needed)
npm run test:rules:structural

# Android (requires JDK 17)
./gradlew assembleDebug
./gradlew testDebugUnitTest
./gradlew detektAll
./gradlew ktlintCheck
```
