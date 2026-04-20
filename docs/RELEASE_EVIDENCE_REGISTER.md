# Release Evidence Register

**Status:** Consolidated evidence register for release candidate approval.

Current synthesis note (2026-04-20): Repo-side remediation remains complete, including the Android-QA approval and preflight hardening in the admin workflow. The remaining Android commissioning blocker is no longer a repo defect but missing local emulator runtime readiness: this Windows host has the Android SDK, emulator binary, debug secrets and debug APKs, but currently no AVD profile and no local `avdmanager`/`sdkmanager` tooling to create one. As a result, single-emulator Android commissioning/E2E could not be executed from this workspace yet, and iOS continues to require an external macOS/Xcode run. The release therefore remains blocked by missing commissioning evidence, final deploy evidence and the remaining external go-live operations. See [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md), [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md), [iOS_BUILD_REFERENCE.md](iOS_BUILD_REFERENCE.md) and [AUTOMATED_COMMISSIONING_TEST_RUNNER.md](AUTOMATED_COMMISSIONING_TEST_RUNNER.md).

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
| Build artifact (npm run build) | Local build successful (tsc -p tsconfig.json) | ✅ | Automated | 2026-04-05 |
| Lint result (npm run lint) | 0 errors, 0 warnings | ✅ | Automated | 2026-04-05 |
| Test result (npm run test:ci) | 52 suites, 1867/1867 passed | ✅ | Automated | 2026-04-05 |
| Coverage report (`npm test -- --coverage --runInBand`) | Stmts 99.56%, Branch 96.65%, Funcs 98.52%, Lines 99.65% | ✅ | Automated | 2026-03-21 |
| Firestore rules structural test | `test/firestore-rules.test.ts` passed (included in full suite) | ✅ | Automated | 2026-03-21 |
| Deploy workflow config validation | `.github/workflows/deploy.yml`: korrekte Projekt-ID `minimaster-28fbd` + Secrets→`.env` Mapping dokumentiert | ✅ | Documented | 2026-03-21 |
| Static readiness checks | scripts/static_readiness_checks.py: 20/20 checks passed (100%) (python scripts/test_automation.py --suite static-readiness) | ✅ | Automated | 2026-04-05 |
| CodeQL security scan (0 high/critical) | Aktuelle Revalidation vom 2026-04-17 zeigt fuer Rerun [24559307544](https://github.com/Toto241/MiniMaster/actions/runs/24559307544) `queued / pending`; Annotationen liegen noch nicht vor, Billing- und Code-Scanning-Klassifikation sind laut [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) noch `pending` | ⛔ | Engineering | 2026-04-17 |
| Android build (if applicable) | Aktuelle Revalidation vom 2026-04-17 zeigt fuer Rerun [24241408803](https://github.com/Toto241/MiniMaster/actions/runs/24241408803) `queued / pending`; Annotationen liegen noch nicht vor, Billing- und Code-Scanning-Klassifikation sind laut [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) noch `pending` | ⛔ | Engineering | 2026-04-17 |
| Deployment result | Lokale Deploy-Bereitschaft am 2026-04-16 geprüft: Firebase CLI, Projektbindung und Login sind vorhanden, aber belastbarer Final-Deploy aus diesem Workspace nicht ausgeführt, weil produktive Runtime-Secrets/-Config lokal nicht vorliegen (`.env` / `.runtimeconfig.json` fehlen) | ⛔ | Engineering | 2026-04-16 |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
| --------------- | -------- | --------------- | -------- | ------ |
| android-apps (pairing + sync) | ⬜ | build/test-automation/latest-summary.json shows the Android device suites still skipped because no connected Android device or emulator is visible via adb; local validation on 2026-04-20 additionally confirmed that this Windows host has no AVD profile and no local avdmanager/sdkmanager to create the required single emulator yet | Automated + QA/Operations pending | 2026-04-20 |
| `ai-config` (AI setup + generation) | ⬜ | Betriebsnachweis fuer produktiven Provider/Fallback noch offen | Engineering + Product/Ops | offen |
| `support-workflow` (ticket lifecycle) | ✅ | build/test-automation/latest-summary.json (`backend-jest` inkl. e2e-ticket-lifecycle) | Automated | 2026-03-29 |
| `compliance-flow` (DSAR + audit) | ✅ | test/enforcement-automation.test.ts | Automated | 2026-03-19 |

### 3.3 Security and Identity Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Legacy auth telemetry snapshot | [LEGACY_AUTH_INVENTORY.md](LEGACY_AUTH_INVENTORY.md) | ✅ | Documented | 2026-03-19 |
| Auth mode / feature flags confirmed | copilot-instructions.md: Legacy Auth Freeze active | ✅ | Documented | 2026-03-19 |
| Secrets/config review | Repo-seitige Bereinigung abgeschlossen; verbleibend ist die externe Firebase-Key-Rotation inkl. Restriktionsnachweis aus der Console | ⬜ | Security Owner | 2026-04-06 |
| Security baseline checklist | [SECURITY_BASELINE_CHECKLIST.md](SECURITY_BASELINE_CHECKLIST.md) | ✅ | Documented | 2026-03-19 |

### 3.4 Compliance Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| DSAR export test evidence | test/branch-coverage-boost.test.ts (exportUserData tests) | ✅ | Automated | 2026-03-19 |
| Audit trail evidence | AuditLogger in all functions, test/enforcement-automation.test.ts | ✅ | Automated | 2026-03-19 |
| Legal consent versioning test | [LEGAL_VERSIONING_RECONSENT_SPEC.md](LEGAL_VERSIONING_RECONSENT_SPEC.md) plus targeted Web-Control regression evidence in `test/web-control-ui.test.ts` (login/session-restore blocked until consent, re-consent required path, consent persistence via `recordLegalConsent`) | ✅ | Automated + Documented | 2026-04-17 |
| Country readiness packet (DE) | [COUNTRY_READINESS_PACKETS.md](COUNTRY_READINESS_PACKETS.md) | ✅ | Documented | 2026-03-19 |

### 3.5 Operational Readiness Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Runbook current version | RUNBOOK.md | ✅ | Documented | 2026-03-19 |
| On-call / escalation roster | [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md) ist operationalisiert; reale Namen, Kontakte, Reachability und Sign-off noch offen | ⬜ | Operations Lead | 2026-04-06 |
| Rollback rehearsal or path validated | deploy.sh includes rollback instructions | ✅ | Documented | 2026-03-19 |
| Operator validation summary export | [COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md](COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md) | ✅ | Documented | 2026-03-19 |

## 4. Sign-Off Record

### Final Go/No-Go Decision

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

## 5. Operationshinweis

Dieses Register wird bei jedem Steering-Checkpoint aktualisiert und ist Teil des endgültigen Release-Artefakts. Alle Links müssen vor der Go/No-Go-Entscheidung verifiziert und aktuell sein.

Fuer die externe Umsetzungsstrecke (Billing/Console/Sign-off) siehe: [RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md](RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md).
Aktuelle Priorisierung siehe: [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md).

## 6. Before Go-Live: Operative Restpunkte

| Aktion | Zielnachweis | Status | Owner | Zieltermin |
| ------ | ------ | ------ | ------ | ------ |
| Firebase-Key-Rotation + Restriktionen abschließen | Screenshot/Export aus Firebase Console + Runbook-Eintrag | ⬜ | Security Owner | offen |
| Play Console Data-Safety final einreichen | Play Console Review-Screenshot | ⬜ | Product/Ops | offen |
| IARC Rating finalisieren | IARC-Freigabe im Play Console Dashboard | ⬜ | Product/Ops | offen |
| Store Listing DE vollständig (Text + Screenshots) | Finaler Store-Listing-Entwurf + Asset-Paket | ⬜ | Product/Ops | offen |
| Permissions Declaration einreichen (Accessibility/Usage/Overlay) | Arbeitsstand dokumentiert in [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md); finale Einreichbestaetigung aus Play Console noch offen | ⬜ | Compliance Owner | offen |
| App-Access-Anleitung in Play Console hinterlegen | Link/Screenshot zur Reviewer-Anleitung (operationalisierter Draft in [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md); Play Console Verlinkung noch offen) | ⬜ | Product/Ops | offen |
| GitHub Actions Billing/Spending-Limit bereinigen | Aktuelle Revalidation zeigt fuer CodeQL und Android CI laufende Reruns (`queued / pending`); finale Billing-/Code-Scanning-Klassifikation steht noch aus, siehe [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) | ⬜ | Repo Owner | offen |
| CodeQL-Ergebnis verlinken | Frischer Rerun [24559307544](https://github.com/Toto241/MiniMaster/actions/runs/24559307544) laeuft noch; belastbarer gruener Nachweis fehlt bis zum Abschluss weiter, siehe [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) | ⬜ | Engineering Owner | offen |
| Android CI Build-Nachweis verlinken | Frischer Rerun [24241408803](https://github.com/Toto241/MiniMaster/actions/runs/24241408803) laeuft noch; belastbarer gruener Nachweis fehlt bis zum Abschluss weiter, siehe [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) | ⬜ | Engineering Owner | offen |
| Physische Commissioning-Checks durchführen | Ausgefüllte COMMISSIONING_ACCEPTANCE_CHECKLIST; aktuell weiter offen, weil auf dem Windows-Host zwar Emulator-Binary, Debug-Secrets und Debug-APKs vorhanden sind, aber noch kein AVD und keine lokalen AVD-Manager-Tools für den geforderten Single-Emulator-Lauf | ⬜ | QA/Operations | offen |
| On-call/Eskalations-Roster verbindlich benennen | Roster mit Namen, Kontakt, Vertretung (operationalisierte Vorlage in [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md); Inhalte offen) | ⬜ | Operations Lead | offen |

## 7. Current Priority Execution Plan (Owner-Driven)

Stand: 2026-04-06.

Status legend:

- `✅` completed
- `🔄` in progress
- `⛔` blocked (external dependency)
- `⬜` not started

| # | Task | Owner | ETA | Abhaengigkeit | Nachweis fuer "Done" | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | CodeQL und Android CI nach Repo-Fix neu ausfuehren | Engineering Owner | kurzfristig | GitHub Actions | Aktualisierte [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) mit aktuellen Runs | 🔄 |
| 2 | Aktuelle CI-Evidenz im Register nachziehen | Engineering Owner | nach 1 | 1 | Frische Run-Links in Abschnitt 3.1 | ⬜ |
| 3 | Finalen Deploy-Nachweis erfassen | Engineering Owner | nach 1 | 1 | Deployment-Referenz in Abschnitt 3.1 | ⬜ |
| 4 | Firebase-Key-Rotation nach Runbook durchfuehren | Security Owner | offen | - | Key-ID alt/neu + Revocation-Zeitpunkt dokumentiert | ⬜ |
| 5 | Data Safety, IARC und Store Listing finalisieren | Product/Ops | offen | - | Play-Console-Nachweise im Register | ⬜ |
| 6 | Permissions Declaration und App Access final einreichen | Compliance Owner + Product/Ops | offen | 5 | Declarations + Reviewer-Guide Link dokumentiert | ⬜ |
| 7 | Physische Commissioning-Checks abschliessen | QA/Operations | offen | 4, 6 | Ausgefuellte [PHYSICAL_COMMISSIONING_CHECKLIST.md](PHYSICAL_COMMISSIONING_CHECKLIST.md) + Sign-off | ⬜ |
| 8 | On-call/Eskalations-Roster benennen und Reachability pruefen | Operations Lead | offen | - | Vollstaendige [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md) + Evidence | ⬜ |
| 9 | Go/No-Go Re-Decision dokumentieren | Release Manager | nach 1-8 | 1-8 | Aktualisierte [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md) | ⬜ |

### 7.1 Fast-Track Criteria fuer Conditional Go

- Alle P0-Tasks 1-9 sind auf "Done" mit Nachweis.
- CodeQL und Android CI haben jeweils mindestens einen erfolgreichen aktuellen Run.
- Security Owner bestaetigt abgeschlossene Key-Rotation inkl. altem Key-Revocation-Nachweis.
- Product/Ops bestaetigt, dass Data Safety, IARC, Permissions Declaration und App Access im Store eingereicht sind.
