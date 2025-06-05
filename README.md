# MiniMaster

This repository contains the experimental implementation of the child application of the **Mini‑Master** project and accompanying Firebase Cloud Functions.

## Overview
The Android app allows a child device to pair with a parent device using a short code. After a successful pairing the child device shows a lock screen with its assigned child ID.

## Features
- **Pairing Flow** – `PairingScreen` collects a code which is validated by the Cloud Function `validatePairingCode`. On success the child ID is stored locally and the app navigates to the `LockScreen`.
- **Local Storage** – `ChildIdRepository` uses DataStore to persist the ID. A global `ChildIdProvider` exposes it as a `StateFlow`.
- **Backend Integration** – Cloud Functions in `index.ts` implement `createPairingCode` and `validatePairingCode` using Firestore.
- **Dependency Injection** – The app is built with Hilt. ViewModels and repositories are provided through Hilt modules.
- **Internationalisation** – All strings exist in English, German, French and Simplified Chinese.
- **Testing** – Unit tests and instrumented Compose tests cover the pairing flow. Manual scenarios are listed in `UX_TEST_SCENARIOS.md`. Automated coverage is summarised in `AUTOMATED_UX_TESTS_SUMMARY.md`.
- **Translation QA** – `TRANSLATION_QA_CHECKLIST.md` helps reviewing new translations.

## Technology Stack
- Kotlin, Jetpack Compose and AndroidX
- Firebase Functions and Firestore
- Hilt for dependency injection
- DataStore for local persistence
- JUnit and AndroidX test libraries

## Firestore Security
Client access to the `pairingCodes` collection is denied by default. Only the Cloud Functions operating with the Admin SDK may create or delete codes. See `firestore.rules` for details.

## Building
Open the `childApp` module with Android Studio. When a Gradle wrapper is available, tests can be run with `./gradlew test` and `./gradlew connectedAndroidTest`.
