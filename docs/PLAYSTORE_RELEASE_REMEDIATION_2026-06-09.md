# Play Store Release Remediation - 2026-06-09

This note records the remediation pass for the nine release-readiness areas and separates repo-side fixes from external release gates.

## Repo-Side Changes Applied

| # | Area | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Android release build path | Fixed repo-side | Added `.github/workflows/android-release.yml`, moved Android modules to `compileSdk 36`, kept `targetSdk 35`, added optional upload-key signing via `MINIMASTER_RELEASE_*` properties/secrets, and fixed GitHub workflow validation (`actionlint` clean). |
| 2 | Dependency/security alerts | Fixed repo-side | Refreshed Gradle security pins and npm/Yarn lockfiles; `npm audit` is clean when run with the local system CA. App-level `protobuf-javalite` force was removed because it caused duplicate classes with Firebase protolite in release bundles; Netty/Logback/BouncyCastle/Commons/Jose pins are set. GitHub Dependency Submission now succeeds, but Dependabot still shows remaining Gradle alerts from `settings.gradle`. |
| 3 | Child Play package ID | Fixed repo-side | Child app `applicationId` changed from `com.google.pairing` to `com.minimaster.childapp`; Kotlin namespace remains `com.google.pairing` until a low-risk package refactor is scheduled. |
| 4 | Billing acknowledgement | Fixed repo-side | Upgraded to Play Billing Library 8, added pending-purchase params, automatic service reconnection, active subscription query, and acknowledgement after backend verification. |
| 5 | Sensitive permissions documentation | Updated repo-side | Play permissions checklist and reviewer guide now reflect Accessibility, Usage Access, Overlay, Device Admin, FGS special use, and Camera without claiming Location. |
| 6 | Data Safety / Privacy mismatch | Updated repo-side | Data Safety template no longer declares Location for the current Android release and marks CodeQL/Deletion URL as release gates. |
| 7 | Tracked credentials | Fixed current tree | Removed tracked Firebase Admin SDK/app config JSON files and hardened `.gitignore`; history and real keys still require external rotation. |
| 8 | Git/GitHub blocker | Diagnosed/fixed where repo-side | Local Git is clean and `main` is pushed. The empty Android Release Bundles failure was a workflow validation error (`runner.temp` in job-level `env`) and is fixed. GitHub Code Scanning is still disabled and API activation returns HTTP 403. Dependabot still reports remaining Gradle alerts from `settings.gradle` after dependency submission. |
| 9 | Release evidence | Updated repo-side | Release evidence register and security baseline document the 2026-06-09 state and remaining external gates. |

## External Gates Still Required

| Gate | Owner | Required before production |
| --- | --- | --- |
| GitHub Code Scanning | Repo owner | Enable Code Scanning in Settings, rerun CodeQL, link green JavaScript + Java/Kotlin results. |
| Firebase key rotation | Security owner | Revoke/rotate previously tracked Admin SDK key and app configs; document old/new key IDs and revocation time. |
| Firebase child app config | Firebase owner | Create/download real `google-services.json` for `com.minimaster.childapp` and store it only as local file or CI secret. |
| Play App Signing | Release owner | Upload-key keystore secrets configured as `MINIMASTER_RELEASE_*`; run Android Release Bundles with `play_ready=true`. |
| Play Console content | Product/Ops + Compliance | Submit Data Safety, IARC, App Access, Sensitive Permissions declarations, screenshots/assets, support contact, privacy URL, and account deletion URL. |
| Physical commissioning | QA/Ops | Run dual-device Android 10-16 matrix, permission grant/revoke flows, blocking/lock/unlock, offline/reboot, billing license tests, and 16 KB compatibility evidence. |
| Final Go/No-Go | Release manager | Update release decision after CI, CodeQL, Play Console, Firebase rotation, on-call roster, and commissioning evidence are complete. |
