# Release Evidence Register

**Status:** Consolidated evidence register for release candidate approval.

Current synthesis note (2026-05-30): Auth migration Phase 2 client work is complete in-repo (`test/auth-migration-phase2-completion.test.ts`). Local security evidence is automated via `npm run security:evidence:collect` (`build/security-evidence/`). Automated backend commissioning evidence is available via `npm run commissioning:evidence:collect` (`build/commissioning-evidence/`). Play Console submission packet consolidated in `docs/PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md`. iOS beta UI contract tests added (`MiniMasterParentUIContractTests`). B2C pricing aligned across `src/pricing-config.ts`, admin panel, and `API_DOCUMENTATION.md` (`test/pricing-admin-sync.test.ts`). External go-live blockers tracked in [GO_NO_GO_EXTERNAL_CHECKLIST.md](GO_NO_GO_EXTERNAL_CHECKLIST.md): GitHub Code Scanning (Issue #158), physical Android commissioning, Play Console submission clicks, Firebase key rotation, on-call roster, final Go/No-Go decision.

Current engineering pass (2026-06-10): Repository finalization pass — Support-Automation-UI im Admin-Panel mit Callable-Evidenz (`grantSupportAccess`, `revokeSupportAccess`, `grantDebugAccess`, `analyzeWithDebugData`), Fertigungsstand-Gate unterscheidet `repo_ready` vs. `release_ready`, npm-Python-Skripte laufen ueber `scripts/run_python.js` plattformneutral gegen `python3`, `python`, `py -3` oder `.venv`, Fertigungsstandsanalyse in Node CI integriert. Repo-seitige Gates grün; externe Blocker (Code Scanning, Deploy, physisches Commissioning, Play Console, Key-Rotation) dokumentiert in `docs/GO_NO_GO_EXTERNAL_CHECKLIST.md`.

Current engineering pass (2026-06-19): iOS wurde repo-seitig auf Android-Paritaet angehoben: native Parent-App mit Dashboard/Pairing/Aufgaben/Abo, native Child-App mit FamilyControls-Recovery, Safe-Unpair-Cleanup, Offline-Policy, Command-Sync und Foreground-Heartbeat. Das neue Gate `npm run ios:readiness:gate` erzeugt `build/ios-readiness/latest.json` und trennt `repoGateReady=true` von `releaseReady=false`. Externe iOS-Blocker bleiben Family Controls entitlement, Xcode 26+/iOS 26 SDK Build, TestFlight, App Store Connect Privacy/Subscription Setup, physisches iPhone/iPad E2E, plus geplante P0-Implementierungen fuer DeviceActivityMonitor und Task Photo Upload.

Current interface pass (2026-06-19): Die Component-Schnittstelle zwischen Android Child, iOS Child, Backend, Parent-UIs, Admin/Support und Release-Gates ist als [COMPONENT_INTERFACE_CONTRACT_2026-06-19.md](COMPONENT_INTERFACE_CONTRACT_2026-06-19.md) dokumentiert. `registerDeviceEndpoint` akzeptiert nun optionale Contract-Felder (`component`, `interfaceVersion`, `buildNumber`, `releaseChannel`, `supportedProtocols`, `runtime`), `publishDeviceEvent` schreibt Sender-Kontext, und `syncPolicySnapshot` liefert Interface-Metadaten an Parent-/Admin-Oberflaechen.

Current engineering pass (2026-06-09): Release-readiness branch created for the Play Store remediation pass and merged to `main`. Local fixes applied for Android release AAB workflow, Play Billing Library 8 migration with purchase acknowledgement, child Play package ID (`com.minimaster.childapp`), dependency overrides/lockfiles (`npm audit` clean with system CA), Gradle CVE pins, Data Safety location mismatch, and removal of tracked Firebase credential files from the current tree. `:masterApp:bundleRelease` and `:childApp:bundleRelease` pass locally when the child Firebase config is supplied for `com.minimaster.childapp`; the checked local child config still has only the old package and must be regenerated externally. Follow-up CI fixes on `main` validated the GitHub workflow syntax with `actionlint`, made Android CI skip missing JaCoCo tasks instead of failing, switched backend CI to the serial `npm run test:ci` command, hardened the Gradle buildscript/plugin classpath for the remaining GitHub dependency alerts, and fixed the dependency-submission preflight. Local `npm run build`, `npm run lint`, `npm run test:ci -- --silent`, Android debug unit tests, and Android release bundles pass. GitHub Dependabot open-alert API now returns `TOTAL=0`. External blockers remain for GitHub Code Scanning activation, Firebase key revocation/rotation, real Firebase config for the renamed child package, Play Console submissions, physical commissioning, and final Go/No-Go.

## 1. Purpose

Every release candidate must have traceable evidence for all mandatory gates. This register is the single artifact that links to all required proof.

## 2. Release Candidate Information

| Field | Value |
| ----- | ----- |
| Release Candidate ID | RC-2026-03-21 |
| Branch | `main` |
| Candidate Freeze Date | 2026-03-21 |
| Deployment Reference | _(pending final deploy)_ |

## 3. Mandatory Evidence Items

### 3.1 Technical Quality Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Build artifact (npm run build) | Local build successful (tsc -p tsconfig.json) | ✅ | Automated | 2026-04-22 |
| Lint result (npm run lint) | 0 errors, ~16k warnings (existing codebase; no new errors introduced) | ✅ | Automated | 2026-04-24 |
| Test result (npm run test:ci -- --silent) | **102 suites, 2592/2592 passed** locally after CI stabilization | ✅ | Automated | 2026-06-09 |
| Coverage report (`npm test -- --coverage --runInBand`) | Stmts 99.56%, Branch 96.65%, Funcs 98.52%, Lines 99.65% | ✅ | Automated | 2026-03-21 |
| Firestore rules structural test | `test/firestore-rules.test.ts` passed (included in full suite) | ✅ | Automated | 2026-04-22 |
| Static readiness checks | `scripts/static_readiness_checks.py`: 26/26 checks passed (100%) | ✅ | Automated | 2026-04-22 |
| Automated manufacturing-status analysis | `npm run analyze:fertigungsstand`; writes `build/fertigungsstand/latest-summary.json` and `build/fertigungsstand/latest-report.md`; gate mode: `npm run analyze:fertigungsstand:gate` (fails only on in-repo P0); integrated in Node CI | ✅ Repo gate green (`repo_ready=true`); external P0 tracked separately | Automated | 2026-06-10 |
| Admin-Panel documentation consistency | [ADMIN_PANEL_ARCHITECTURE.md](ADMIN_PANEL_ARCHITECTURE.md) now declares automation-first status and resolves stale SRI/CSP/inline-handler contradictions | ✅ | Documented + Automated gate | 2026-04-24 |
| PR152 selective integration guard | `npm run guard:pr152` — all P0/P1/P2 checks pass (security files, ESLint rules, Firestore rules/indexes, monetisation tabs present) | ✅ | Automated | 2026-04-24 |
| Dependency security hardening | Root npm overrides/resolutions refreshed for `protobufjs`, `uuid`, `qs`, `@google-cloud/storage`, Google client stack; Gradle forces/constraints refreshed for Netty, Logback, BouncyCastle, Commons IO, Jose4j, and `protobuf-javalite`; Gradle buildscript/plugin classpath forces patch the remaining GitHub `settings.gradle` advisory mappings; `npm audit` returns 0 vulnerabilities when run with the local system CA; Dependabot open alerts now return `TOTAL=0` after successful Dependency Submission ([automatic run 27233234959](https://github.com/Toto241/MiniMaster/actions/runs/27233234959), [manual run 27233258846](https://github.com/Toto241/MiniMaster/actions/runs/27233258846)) | ✅ Repo-side | Automated + Engineering | 2026-06-09 |
| Local security evidence bundle | `npm run security:evidence:collect` → `build/security-evidence/latest-summary.json` | ✅ Repo-side pass (2026-05-30) | Automated | 2026-05-30 |
| Automated commissioning evidence (backend) | `npm run commissioning:evidence:collect` → `build/commissioning-evidence/latest-summary.json` | 🔄 Partial — backend pass, physical device pending | Automated | 2026-05-30 |
| Play Console submission packet | [PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md](PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md) | ✅ Repo-ready; external Play Console clicks pending | Product/Ops | 2026-05-30 |
| Auth migration Phase 2 (clients) | [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md) + `test/auth-migration-phase2-completion.test.ts` | ✅ | Engineering | 2026-05-30 |
| iOS beta UI contract tests | `iosMasterApp/Tests/MiniMasterParentTests/MiniMasterParentUIContractTests.swift` | ✅ Repo-side | Engineering | 2026-05-30 |
| iOS Android parity readiness | `npm run ios:readiness:gate`; [IOS_ANDROID_PARITY_PLAN_2026-06-19.md](IOS_ANDROID_PARITY_PLAN_2026-06-19.md) | ✅ Repo gate green; release blocked by Apple/device evidence and planned P0 iOS parity work | Engineering | 2026-06-19 |
| Component interface contract | [COMPONENT_INTERFACE_CONTRACT_2026-06-19.md](COMPONENT_INTERFACE_CONTRACT_2026-06-19.md) + `test/device-sync.test.ts` | ✅ Repo-side | Engineering | 2026-06-19 |
| CodeQL security scan (0 high/critical) | CodeQL workflow is green for JavaScript and Java/Kotlin ([run 27229989798](https://github.com/Toto241/MiniMaster/actions/runs/27229989798)), but Code Scanning is still not enabled in repository settings (Issue #158). API activation attempt on 2026-06-09 returned HTTP 403; enable in GitHub Settings before treating this as final Security-tab evidence. | ⛔ | Engineering | 2026-06-09 |
| Android build / Android CI | Release AAB workflow added and validated with `actionlint`; modules moved to `compileSdk 36`/`targetSdk 35`; local `:masterApp:testDebugUnitTest`, `:childApp:testDebugUnitTest`, `:masterApp:bundleRelease`, and `:childApp:bundleRelease` pass with system CA, local Android SDK, and a temporary child Firebase config for `com.minimaster.childapp`; Android CI is green for the Gradle classpath hardening commit ([run 27233004667](https://github.com/Toto241/MiniMaster/actions/runs/27233004667)). Real Firebase config and Play-ready release-bundle run still pending. | ⚠️ | Engineering | 2026-06-09 |
| Deployment result | Final production deploy evidence is pending because production runtime secrets/config and deploy sign-off are external to the repository | ⛔ | Engineering | offen |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
| --------------- | -------- | --------------- | -------- | ------ |
| android-apps (pairing + sync) | 🔄 | Backend automated evidence in `build/commissioning-evidence/`; physical USB/emulator commissioning still required via `scripts/run-dual-device-commissioning.ps1` | Automated + QA/Operations pending | 2026-05-30 |
| ios-apps (pairing + FamilyControls + sync) | 🔄 | Repo gate in `build/ios-readiness/`; macOS/Xcode/TestFlight and physical iPhone/iPad FamilyControls evidence required | Automated + QA/Operations pending | 2026-06-19 |
| `ai-config` (AI setup + generation) | ⬜ | Productive provider/fallback evidence is still required | Engineering + Product/Ops | offen |
| `support-workflow` (ticket lifecycle) | ✅ | `backend-jest` incl. e2e-ticket-lifecycle evidence | Automated | 2026-03-29 |
| `compliance-flow` (DSAR + audit) | ✅ | `test/enforcement-automation.test.ts` | Automated | 2026-03-19 |

### 3.3 Security and Identity Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Legacy auth telemetry snapshot | [LEGACY_AUTH_INVENTORY.md](LEGACY_AUTH_INVENTORY.md) | ✅ | Documented | 2026-03-19 |
| Auth mode / feature flags confirmed | Legacy Auth Freeze active; full cutover still requires zero telemetry and explicit `DISABLE_LEGACY_SECRETKEY_AUTH=true` production decision | 🔄 | Documented + Automated analysis | 2026-04-24 |
| Secrets/config review | Tracked Firebase credential files removed from current tree and `.gitignore` hardened; external key rotation/revocation and Git history cleanup decision remain required | ⬜ | Security Owner | offen |
| Security baseline checklist | [SECURITY_BASELINE_CHECKLIST.md](SECURITY_BASELINE_CHECKLIST.md) | ✅ | Documented | 2026-04-22 |

### 3.4 Compliance Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| DSAR export test evidence | `test/branch-coverage-boost.test.ts` (`exportUserData` tests) | ✅ | Automated | 2026-03-19 |
| Audit trail evidence | AuditLogger in all functions, `test/enforcement-automation.test.ts` | ✅ | Automated | 2026-03-19 |
| Legal consent versioning test | [LEGAL_VERSIONING_RECONSENT_SPEC.md](LEGAL_VERSIONING_RECONSENT_SPEC.md) plus targeted Web-Control regression evidence | ✅ | Automated + Documented | 2026-04-17 |
| Country readiness packet (DE) | [COUNTRY_READINESS_PACKETS.md](COUNTRY_READINESS_PACKETS.md) | ✅ | Documented | 2026-03-19 |
| P1 legal draft inventory | [LEGAL_DRAFT_INVENTORY_P1.md](LEGAL_DRAFT_INVENTORY_P1.md) — UK, USA, FR, ES, IT templates present; all marked unreviewed | ✅ | Documented | 2026-04-24 |

### 3.5 Operational Readiness Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Runbook current version | RUNBOOK.md | ✅ | Documented | 2026-03-19 |
| On-call / escalation roster | [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md) template exists; real names, contacts, reachability and sign-off still required | ⬜ | Operations Lead | offen |
| Rollback rehearsal or path validated | deploy.sh includes rollback instructions | ✅ | Documented | 2026-03-19 |
| Operator validation summary export | [COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md](COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md) | ✅ | Documented | 2026-03-19 |

## 4. Final Go/No-Go Record

| Role | Name | Decision | Date | Signature |
| ------ | ------ | ---------- | ------ | ----------- |
| Engineering Owner | | ⬜ Go / ⬜ No-Go | | |
| Product/Ops Owner | | ⬜ Go / ⬜ No-Go | | |
| Security/Compliance Owner | | ⬜ Go / ⬜ No-Go | | |

### Decision

- **Final Result:** ⬜ Go / ⬜ No-Go / ⬜ Conditional Go
- **Approved Rollout Scope:** _(countries, user segments)_
- **Residual Risk Notes:** _(document any accepted risks)_
- **Follow-Up Items:** _(post-release backlog)_

## 5. Before Go-Live: Operative Restpunkte

| Aktion | Zielnachweis | Status | Owner | Zieltermin |
| ------ | ------ | ------ | ------ | ------ |
| GitHub Code Scanning aktivieren | Security tab akzeptiert CodeQL SARIF und `gh api repos/Toto241/MiniMaster/code-scanning/alerts` liefert 200 statt 403 | ⬜ | Repo Owner | offen |
| CodeQL-Ergebnis verlinken | Frischer erfolgreicher CodeQL-Run vorhanden; Code-Scanning-API muss noch 200 statt 403 liefern | 🔄 | Engineering Owner + Repo Owner | nach Repo-Settings-Fix |
| Android CI Build-Nachweis verlinken | Android CI gruen; Android Release Bundles Play-ready Run mit echten Secrets fehlt noch | 🔄 | Engineering Owner | nach Firebase/Signing-Secrets |
| Fertigungsstandsanalyse lokal/CI ausfuehren | `build/fertigungsstand/latest-summary.json` und `latest-report.md` archiviert | ✅ | Engineering Owner | 2026-06-10 |
| Finalen Deploy-Nachweis erfassen | Deployment-Referenz in diesem Register | ⬜ | Engineering Owner | nach CI-Fix |
| Firebase-Key-Rotation + Restriktionen abschliessen | Screenshot/Export aus Firebase Console + Runbook-Eintrag; alte getrackte Admin-SDK/App-Config-Werte revoked | ⬜ | Security Owner | offen |
| Play Console Data-Safety final einreichen | Play Console Review-Screenshot | ⬜ | Product/Ops | offen |
| IARC Rating finalisieren | IARC-Freigabe im Play Console Dashboard | ⬜ | Product/Ops | offen |
| Store Listing DE vollständig | Finaler Store-Listing-Entwurf + Asset-Paket | ⬜ | Product/Ops | offen |
| Permissions Declaration einreichen | Finale Einreichbestaetigung aus Play Console | ⬜ | Compliance Owner | offen |
| App-Access-Anleitung in Play Console hinterlegen | Link/Screenshot zur Reviewer-Anleitung | ⬜ | Product/Ops | offen |
| Android 10-16 Matrix Smoke (Dry-Run) | `npm run run:android-release-matrix:smoke` + `validate:android-release-matrix` | ✅ Dry-Run | Engineering | 2026-06-10 |
| Physische/Emulator-Commissioning-Checks durchführen | Ausgefüllte Commissioning-Checkliste mit Evidence | ⬜ | QA/Operations | offen |
| On-call/Eskalations-Roster verbindlich benennen | Roster mit Namen, Kontakt, Vertretung und Reachability-Test | ⬜ | Operations Lead | offen |

## 6. Current Priority Execution Plan

| # | Task | Owner | Abhaengigkeit | Nachweis fuer Done | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | GitHub Code Scanning in Repository Settings aktivieren | Repo Owner | GitHub Admin Settings | Code scanning API liefert 200 und Security tab zeigt CodeQL | ⬜ |
| 2 | CodeQL, Android CI und Android Release Bundles neu ausfuehren | Engineering | 1 + Push | CodeQL und Android CI completed/success; Android Release Bundles play-ready noch offen | 🔄 |
| 3 | `npm run analyze:fertigungsstand:gate` ausfuehren und archivieren | Engineering | Checkout/CI | latest-summary.json + latest-report.md | ✅ |
| 4 | Release-Evidence mit aktuellen Run-Links aktualisieren | Engineering | 2, 3 | dieses Register aktualisiert | 🔄 |
| 5 | Finalen Deploy-Nachweis erfassen | Engineering | 2 | Deployment-Referenz | ⬜ |
| 6 | Firebase-Key-Rotation nach Runbook durchfuehren | Security Owner | Console-Zugriff | Key-ID alt/neu + Revocation-Zeitpunkt dokumentiert; neue child Firebase app fuer `com.minimaster.childapp` | ⬜ |
| 7 | Play Console Paket finalisieren | Product/Ops + Compliance | Play Console Zugriff | Data Safety, IARC, Permissions, App Access | ⬜ |
| 8 | Commissioning abschliessen | QA/Operations | reale Testumgebung | Ausgefuellte Checkliste + Evidence | ⬜ |
| 9 | On-call/Eskalations-Roster finalisieren | Operations Lead | reale Kontakte | Reachability-Evidence | ⬜ |
| 10 | Go/No-Go Re-Decision dokumentieren | Release Manager | 1-9 | RELEASE_DECISION aktualisiert | ⬜ |

## 7. Fast-Track Criteria fuer Conditional Go

- Alle P0-Tasks sind auf Done mit Nachweis.
- CodeQL und Android CI haben jeweils mindestens einen erfolgreichen aktuellen Run.
- `npm run analyze:fertigungsstand:gate` wurde ausgefuehrt; alle P0-Findings sind geschlossen oder korrekt als externe Blocker dokumentiert.
- Security Owner bestaetigt Key-Rotation inkl. Revocation-Nachweis.
- Product/Ops bestaetigt Play-Console-Einreichungen.
- QA/Operations bestaetigt Android-Commissioning auf Emulator/Geraet.
