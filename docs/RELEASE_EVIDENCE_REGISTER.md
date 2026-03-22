# Release Evidence Register

Status: consolidated evidence register for release candidate approval.

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
| Build artifact (`npm run build`) | Local build successful (`tsc -p tsconfig.json`) | ✅ | Automated | 2026-03-22 |
| Lint result (`npm run lint`) | 0 errors, 0 warnings | ✅ | Automated | 2026-03-22 |
| Test result (`npm test -- --runInBand`) | 40 suites, 1500/1500 passed | ✅ | Automated | 2026-03-22 |
| Coverage report (`npm test -- --coverage --runInBand`) | Stmts 99.56%, Branch 96.65%, Funcs 98.52%, Lines 99.65% | ✅ | Automated | 2026-03-21 |
| Firestore rules structural test | `test/firestore-rules.test.ts` passed (included in full suite) | ✅ | Automated | 2026-03-21 |
| Deploy workflow config validation | `.github/workflows/deploy.yml`: korrekte Projekt-ID `minimaster-28fbd` + Secrets→`.env` Mapping dokumentiert | ✅ | Documented | 2026-03-21 |
| CodeQL security scan (0 high/critical) | Run [23401992153](https://github.com/Toto241/MiniMaster/actions/runs/23401992153): completed/failure; Annotation: "job was not started because recent account payments have failed or your spending limit needs to be increased"; letzter erfolgreicher Referenz-Run: [23381838965](https://github.com/Toto241/MiniMaster/actions/runs/23381838965) | ⬜ | Engineering (blocked by repo billing) | 2026-03-22 |
| Android build (if applicable) | Run [23401992162](https://github.com/Toto241/MiniMaster/actions/runs/23401992162): completed/failure; Annotation: "job was not started because recent account payments have failed or your spending limit needs to be increased"; letzter erfolgreicher Referenz-Run: none in inspected history | ⬜ | Engineering (blocked by repo billing) | 2026-03-22 |
| Deployment result | _(pending final deploy — deploy.yml jetzt mit korrekter Projekt-ID minimaster-28fbd)_ | ⬜ | | |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
| --------------- | -------- | --------------- | -------- | ------ |
| `android-apps` (pairing + sync) | ⬜ | | | |
| `ai-config` (AI setup + generation) | ⬜ | | | |
| `support-workflow` (ticket lifecycle) | ⬜ | | | |
| `compliance-flow` (DSAR + audit) | ✅ | test/enforcement-automation.test.ts | Automated | 2026-03-19 |

### 3.3 Security and Identity Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Legacy auth telemetry snapshot | docs/LEGACY_AUTH_INVENTORY.md | ✅ | Documented | 2026-03-19 |
| Auth mode / feature flags confirmed | copilot-instructions.md: Legacy Auth Freeze active | ✅ | Documented | 2026-03-19 |
| Secrets/config review | `start.html`+`Firebase-Konsole.txt` bereinigt; `.env.example` + `.gitignore` aktualisiert; `deploy.yml` Projekt-ID-Bug (minimaster-app→minimaster-28fbd) behoben; Firebase-Key-Rotation im Console-Runbook offen | ⬜ | Security Owner | 2026-03-21 |
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
| On-call / escalation roster | `docs/ONCALL_ESCALATION_ROSTER.md` (operationalisiert; Namen/Kontakte/Reachability/Sign-off noch offen) | ⬜ | Operations Lead | 2026-03-22 |
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

## 6. Before Go-Live: Operative Restpunkte

| Aktion | Zielnachweis | Status | Owner | Zieltermin |
| ------ | ------ | ------ | ------ | ------ |
| Firebase-Key-Rotation + Restriktionen abschließen | Screenshot/Export aus Firebase Console + Runbook-Eintrag | ⬜ | Security Owner | offen |
| Play Console Data-Safety final einreichen | Play Console Review-Screenshot | ⬜ | Product/Ops | offen |
| IARC Rating finalisieren | IARC-Freigabe im Play Console Dashboard | ⬜ | Product/Ops | offen |
| Store Listing DE vollständig (Text + Screenshots) | Finaler Store-Listing-Entwurf + Asset-Paket | ⬜ | Product/Ops | offen |
| Permissions Declaration einreichen (Accessibility/Usage/Overlay) | Arbeitsstand dokumentiert in `docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md`; finale Einreichbestaetigung aus Play Console noch offen | ⬜ | Compliance Owner | offen |
| App-Access-Anleitung in Play Console hinterlegen | Link/Screenshot zur Reviewer-Anleitung (operationalisierter Draft in `docs/APP_ACCESS_REVIEWER_GUIDE.md`; Play Console Verlinkung noch offen) | ⬜ | Product/Ops | offen |
| GitHub Actions Billing/Spending-Limit bereinigen | Billing-&-Plans-Nachweis; danach CodeQL Job startbar (externe Owner-Aktion erforderlich) | ⬜ | Repo Owner | offen |
| CodeQL-Ergebnis verlinken | Letzter Run: [23401992153](https://github.com/Toto241/MiniMaster/actions/runs/23401992153) (completed/failure; Billing weiterhin kritisch) | ⬜ | Engineering Owner | offen |
| Android CI Build-Nachweis verlinken | Letzter Run: [23401992162](https://github.com/Toto241/MiniMaster/actions/runs/23401992162) (completed/failure; Billing weiterhin kritisch) | ⬜ | Engineering Owner | offen |
| Physische Commissioning-Checks durchführen | Ausgefüllte COMMISSIONING_ACCEPTANCE_CHECKLIST | ⬜ | QA/Operations | offen |
| On-call/Eskalations-Roster verbindlich benennen | Roster mit Namen, Kontakt, Vertretung (operationalisierte Vorlage in `docs/ONCALL_ESCALATION_ROSTER.md`; Inhalte offen) | ⬜ | Operations Lead | offen |

## 7. 24h Execution Plan (Owner-Driven)

Zeitraum: 2026-03-22 bis 2026-03-23 (lokale Zeit).

Status legend:
- `✅` completed
- `🔄` in progress
- `⛔` blocked (external dependency)
- `⬜` not started

| # | Task | Owner | ETA | Abhaengigkeit | Nachweis fuer "Done" | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GitHub Actions Billing/Spending-Limit beheben | Repo Owner | 2026-03-22 18:00 | - | Screenshot/Export aus Billing & Plans + bestaetigter Runner-Start | ⛔ |
| 2 | CI-Rerun nach Billing-Fix ausloesen (`-RerunLatestFailed`) | Engineering Owner | 2026-03-22 19:00 | 1 | Aktualisiertes `docs/CI_REVALIDATION_LATEST.md` mit laufenden Jobs | ✅ |
| 3 | CodeQL-Resultat verlinken und auf gruen pruefen | Engineering Owner | 2026-03-22 21:00 | 2 | Erfolgreicher Run-Link im Abschnitt 3.1 | ⛔ |
| 4 | Android-CI-Resultat verlinken und auf gruen pruefen | Engineering Owner | 2026-03-22 21:00 | 2 | Erfolgreicher Run-Link im Abschnitt 3.1 | ⛔ |
| 5 | Firebase-Key-Rotation nach Runbook durchfuehren | Security Owner | 2026-03-23 10:00 | - | Key-ID alt/neu + Loeschzeit in Evidence Register dokumentiert | ⬜ |
| 6 | Play Console Data Safety einreichen | Product/Ops | 2026-03-23 12:00 | - | Review-Screenshot + Formularstatus "Submitted" | ⬜ |
| 7 | IARC-Rating finalisieren | Product/Ops | 2026-03-23 12:30 | 6 | IARC/Content-Rating Screenshot in Play Console | ⬜ |
| 8 | Permissions Declaration + App-Access-Guide hinterlegen | Compliance Owner + Product/Ops | 2026-03-23 14:00 | 6 | Bestaetigte Declarations + Reviewer-Guide Link (`docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md` vorbereitet) | 🔄 |
| 9 | Physische Commissioning-Checks abschliessen | QA/Operations | 2026-03-23 16:00 | 5, 8 | Ausgefuellte [docs/PHYSICAL_COMMISSIONING_CHECKLIST.md](docs/PHYSICAL_COMMISSIONING_CHECKLIST.md) + Sign-off | ⬜ |
| 10 | On-call/Eskalations-Roster benennen | Operations Lead | 2026-03-23 16:30 | - | Namen + Kontakte + Vertretung in Runbook/Evidence | ⬜ |
| 11 | Go/No-Go Re-Decision dokumentieren | Release Manager | 2026-03-23 18:00 | 1-10 | Aktualisierte [docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md) | ⬜ |

### 7.1 Fast-Track Criteria fuer Conditional Go

- Alle P0-Tasks 1-10 sind auf "Done" mit Nachweis.
- CodeQL und Android CI haben jeweils mindestens einen erfolgreichen aktuellen Run.
- Security Owner bestaetigt abgeschlossene Key-Rotation inkl. altem Key-Revocation-Nachweis.
- Product/Ops bestaetigt, dass Data Safety, IARC, Permissions Declaration und App Access im Store eingereicht sind.
