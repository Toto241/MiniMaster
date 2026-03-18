# First-Start Language Selection Implementation

## Scope

This document describes the implementation of mandatory language selection on first app start for:

- `masterApp`
- `childApp`

## Functional Behavior

1. On first app start, users must select a preferred app language.
2. Language choice is persisted locally.
3. Chosen locale is applied immediately.
4. On subsequent starts, language selection screen is skipped.

## Technical Design

### Persistence

- SharedPreferences keys:
  - `language_selected` (boolean)
  - `language_tag` (string)
- Preference file: `app_language`

### Locale Application

- Locale is applied with AppCompat API:
  - `AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))`

### Startup Hooks

- Master app startup locale apply:
  - `masterApp/src/main/java/com/minimaster/masterapp/MasterApplication.kt`
- Child app startup locale apply:
  - `childApp/src/main/java/com/google/pairing/PairingApplication.kt`

### First-Start Gate Logic

- Master app:
  - `masterApp/src/main/java/com/minimaster/masterapp/MainActivity.kt`
  - Shows language screen before registration/dashboard navigation.
- Child app:
  - `childApp/src/main/java/com/google/pairing/MainActivity.kt`
  - Shows language screen before pairing/permission/lock flow.

## Files Added

- `masterApp/src/main/java/com/minimaster/masterapp/LanguagePreferences.kt`
- `childApp/src/main/java/com/google/pairing/LanguagePreferences.kt`

## Resource Updates

- Added language setup UI strings:
  - `language_setup_title`
  - `language_setup_description`
  - `language_continue`
- Added to:
  - default locale (`values`)
  - existing translated locales (`values-de`, `values-fr`, `values-zh-rCN`)
  - newly integrated locale folders for global rollout

## Deep Integration Analysis Summary

### Verified

1. Locale folders exist in both apps for all targeted languages.
2. Language setup keys exist in all locale files.
3. String-key parity check against default resources passes for all locale files in both apps.
4. Startup locale hooks are present in Application classes.
5. First-start language gate is present in both MainActivity navigation flows.

### Environment Limitation

A full Gradle build/test run is currently blocked on this workstation by Java runtime mismatch (`jvm.cfg`/JDK setup issue). Static and structural checks were completed successfully.

## Next Hardening Steps

1. Install/point to supported JDK 17 or 21 for Android Gradle plugin.
2. Run full validation gate:
   - lint
   - unit tests
   - connected tests
3. Add true human translations for newly added locales in rollout order.
4. Add settings entry for post-onboarding language change.
