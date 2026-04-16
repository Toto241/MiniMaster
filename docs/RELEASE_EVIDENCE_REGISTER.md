# Release Evidence Register

Status: consolidated evidence register for release candidate approval.

Current synthesis note (2026-04-16): Repo-side remediation remains complete. Current blockers are the confirmed GitHub Actions billing/spending-limit failure for CodeQL and Android CI, the missing final deploy evidence, and external go-live operations. A local deploy was not executed from this workspace because Firebase CLI/project access is present, but runtime secrets/config for a production-grade Functions deploy are not available locally (`.env` / `.runtimeconfig.json` absent). See [docs/RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](docs/RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md) and [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md).

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
| CodeQL security scan (0 high/critical) | Revalidation vom 2026-04-16 zeigt fuer Rerun [24323887350](https://github.com/Toto241/MiniMaster/actions/runs/24323887350) `completed / failure`; laut [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md) wurde der Job wegen GitHub-Actions-Billing/Spending-Limit nicht gestartet, Code-Scanning-Blocker ist nicht mehr aktiv | ⛔ | Engineering | 2026-04-16 |
| Android build (if applicable) | Revalidation vom 2026-04-16 zeigt fuer Rerun [24241408803](https://github.com/Toto241/MiniMaster/actions/runs/24241408803) `completed / failure`; laut [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md) wurde der Job wegen GitHub-Actions-Billing/Spending-Limit nicht gestartet | ⛔ | Engineering | 2026-04-16 |
| Deployment result | Lokale Deploy-Bereitschaft am 2026-04-16 geprüft: Firebase CLI, Projektbindung und Login sind vorhanden, aber belastbarer Final-Deploy aus diesem Workspace nicht ausgeführt, weil produktive Runtime-Secrets/-Config lokal nicht vorliegen (`.env` / `.runtimeconfig.json` fehlen) | ⛔ | Engineering | 2026-04-16 |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
| --------------- | -------- | --------------- | -------- | ------ |
| android-apps (pairing + sync) | ⬜ | build/test-automation/latest-summary.json (android-connected-master/android-connected-child skipped: No connected Android device or emulator detected via adb.) | Automated + Device Owner pending | 2026-04-05 |
| `ai-config` (AI setup + generation) | ⬜ | Betriebsnachweis fuer produktiven Provider/Fallback noch offen | Engineering + Product/Ops | offen |
| `support-workflow` (ticket lifecycle) | ✅ | build/test-automation/latest-summary.json (`backend-jest` inkl. e2e-ticket-lifecycle) | Automated | 2026-03-29 |
| `compliance-flow` (DSAR + audit) | ✅ | test/enforcement-automation.test.ts | Automated | 2026-03-19 |

### 3.3 Security and Identity Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Legacy auth telemetry snapshot | docs/LEGACY_AUTH_INVENTORY.md | ✅ | Documented | 2026-03-19 |
| Auth mode / feature flags confirmed | copilot-instructions.md: Legacy Auth Freeze active | ✅ | Documented | 2026-03-19 |
| Secrets/config review | Repo-seitige Bereinigung abgeschlossen; verbleibend ist die externe Firebase-Key-Rotation inkl. Restriktionsnachweis aus der Console | ⬜ | Security Owner | 2026-04-06 |
| Security baseline checklist | docs/SECURITY_BASELINE_CHECKLIST.md | ✅ | Documented | 2026-03-19 |

### 3.4 Compliance Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| DSAR export test evidence | test/branch-coverage-boost.test.ts (exportUserData tests) | ✅ | Automated | 2026-03-19 |
| Audit trail evidence | AuditLogger in all functions, test/enforcement-automation.test.ts | ✅ | Automated | 2026-03-19 |
| Legal consent versioning test | docs/LEGAL_VERSIONING_RECONSENT_SPEC.md | ✅ | Documented | 2026-03-19 |
| Country readiness packet (DE) | docs/COUNTRY_READINESS_PACKETS.md | ✅ | Documented | 2026-03-19 |

### 3.5 Operational Readiness Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Runbook current version | RUNBOOK.md | ✅ | Documented | 2026-03-19 |
| On-call / escalation roster | [docs/ONCALL_ESCALATION_ROSTER.md](docs/ONCALL_ESCALATION_ROSTER.md) ist operationalisiert; reale Namen, Kontakte, Reachability und Sign-off noch offen | ⬜ | Operations Lead | 2026-04-06 |
| Rollback rehearsal or path validated | deploy.sh includes rollback instructions | ✅ | Documented | 2026-03-19 |
| Operator validation summary export | docs/COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md | ✅ | Documented | 2026-03-19 |

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

Fuer die externe Umsetzungsstrecke (Billing/Console/Sign-off) siehe: `docs/RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md`.
Aktuelle Priorisierung siehe: [docs/RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](docs/RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md).

## 6. Before Go-Live: Operative Restpunkte

| Aktion | Zielnachweis | Status | Owner | Zieltermin |
| ------ | ------ | ------ | ------ | ------ |
| Firebase-Key-Rotation + Restriktionen abschließen | Screenshot/Export aus Firebase Console + Runbook-Eintrag | ⬜ | Security Owner | offen |
| Play Console Data-Safety final einreichen | Play Console Review-Screenshot | ⬜ | Product/Ops | offen |
| IARC Rating finalisieren | IARC-Freigabe im Play Console Dashboard | ⬜ | Product/Ops | offen |
| Store Listing DE vollständig (Text + Screenshots) | Finaler Store-Listing-Entwurf + Asset-Paket | ⬜ | Product/Ops | offen |
| Permissions Declaration einreichen (Accessibility/Usage/Overlay) | Arbeitsstand dokumentiert in `docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md`; finale Einreichbestaetigung aus Play Console noch offen | ⬜ | Compliance Owner | offen |
| App-Access-Anleitung in Play Console hinterlegen | Link/Screenshot zur Reviewer-Anleitung (operationalisierter Draft in `docs/APP_ACCESS_REVIEWER_GUIDE.md`; Play Console Verlinkung noch offen) | ⬜ | Product/Ops | offen |
| GitHub Actions Billing/Spending-Limit bereinigen | Aktuelle Revalidation zeigt fuer CodeQL und Android CI erneut einen Billing-/Spending-Limit-Blocker; die Jobs wurden nicht gestartet, siehe [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md) | ⬜ | Repo Owner | offen |
| CodeQL-Ergebnis verlinken | Frischer Rerun [24323887350](https://github.com/Toto241/MiniMaster/actions/runs/24323887350) ist mit Billing-Blocker fehlgeschlagen; belastbarer gruener Nachweis fehlt weiter, siehe [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md) | ⬜ | Engineering Owner | offen |
| Android CI Build-Nachweis verlinken | Frischer Rerun [24241408803](https://github.com/Toto241/MiniMaster/actions/runs/24241408803) ist mit Billing-Blocker fehlgeschlagen; belastbarer gruener Nachweis fehlt weiter, siehe [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md) | ⬜ | Engineering Owner | offen |
| Physische Commissioning-Checks durchführen | Ausgefüllte COMMISSIONING_ACCEPTANCE_CHECKLIST | ⬜ | QA/Operations | offen |
| On-call/Eskalations-Roster verbindlich benennen | Roster mit Namen, Kontakt, Vertretung (operationalisierte Vorlage in `docs/ONCALL_ESCALATION_ROSTER.md`; Inhalte offen) | ⬜ | Operations Lead | offen |

## 7. Current Priority Execution Plan (Owner-Driven)

Stand: 2026-04-06.

Status legend:

- `✅` completed
- `🔄` in progress
- `⛔` blocked (external dependency)
- `⬜` not started

| # | Task | Owner | ETA | Abhaengigkeit | Nachweis fuer "Done" | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | CodeQL und Android CI nach Repo-Fix neu ausfuehren | Engineering Owner | kurzfristig | GitHub Actions | Aktualisierte [docs/CI_REVALIDATION_LATEST.md](docs/CI_REVALIDATION_LATEST.md) mit aktuellen Runs | 🔄 |
| 2 | Aktuelle CI-Evidenz im Register nachziehen | Engineering Owner | nach 1 | 1 | Frische Run-Links in Abschnitt 3.1 | ⬜ |
| 3 | Finalen Deploy-Nachweis erfassen | Engineering Owner | nach 1 | 1 | Deployment-Referenz in Abschnitt 3.1 | ⬜ |
| 4 | Firebase-Key-Rotation nach Runbook durchfuehren | Security Owner | offen | - | Key-ID alt/neu + Revocation-Zeitpunkt dokumentiert | ⬜ |
| 5 | Data Safety, IARC und Store Listing finalisieren | Product/Ops | offen | - | Play-Console-Nachweise im Register | ⬜ |
| 6 | Permissions Declaration und App Access final einreichen | Compliance Owner + Product/Ops | offen | 5 | Declarations + Reviewer-Guide Link dokumentiert | ⬜ |
| 7 | Physische Commissioning-Checks abschliessen | QA/Operations | offen | 4, 6 | Ausgefuellte [docs/PHYSICAL_COMMISSIONING_CHECKLIST.md](docs/PHYSICAL_COMMISSIONING_CHECKLIST.md) + Sign-off | ⬜ |
| 8 | On-call/Eskalations-Roster benennen und Reachability pruefen | Operations Lead | offen | - | Vollstaendige [docs/ONCALL_ESCALATION_ROSTER.md](docs/ONCALL_ESCALATION_ROSTER.md) + Evidence | ⬜ |
| 9 | Go/No-Go Re-Decision dokumentieren | Release Manager | nach 1-8 | 1-8 | Aktualisierte [docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md) | ⬜ |

### 7.1 Fast-Track Criteria fuer Conditional Go

- Alle P0-Tasks 1-9 sind auf "Done" mit Nachweis.
- CodeQL und Android CI haben jeweils mindestens einen erfolgreichen aktuellen Run.
- Security Owner bestaetigt abgeschlossene Key-Rotation inkl. altem Key-Revocation-Nachweis.
- Product/Ops bestaetigt, dass Data Safety, IARC, Permissions Declaration und App Access im Store eingereicht sind.
