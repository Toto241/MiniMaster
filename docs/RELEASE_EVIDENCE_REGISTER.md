# Release Evidence Register

**Status:** Consolidated evidence register for release candidate approval.

Current synthesis note (2026-04-24): Repo-side remediation remains substantially complete, and contradictions around Admin-Panel security/automation documentation have been resolved. The repository now contains an automated manufacturing-status analysis (`scripts/analyze_fertigungsstand.py`) exposed through `npm run analyze:fertigungsstand` and `npm run analyze:fertigungsstand:gate`. This script is the repo-internal consistency gate for P0/P1/P2 implementation gaps, Admin-Panel automation focus, CI evidence, release gates, Legacy-Auth cutover state and documentation contradictions. External go-live blockers remain: GitHub Actions billing/spending limit, fresh CodeQL and Android CI evidence, final deploy evidence, Firebase key rotation, Play Console submission evidence, physical/emulator commissioning evidence, on-call roster and final Go/No-Go decision.

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
| Lint result (npm run lint) | 0 errors, 14 warnings (unused vars only) | ✅ | Automated | 2026-04-22 |
| Test result (npm test) | **78 suites, 2090/2090 passed** | ✅ | Automated | 2026-04-22 |
| Coverage report (`npm test -- --coverage --runInBand`) | Stmts 99.56%, Branch 96.65%, Funcs 98.52%, Lines 99.65% | ✅ | Automated | 2026-03-21 |
| Firestore rules structural test | `test/firestore-rules.test.ts` passed (included in full suite) | ✅ | Automated | 2026-04-22 |
| Static readiness checks | `scripts/static_readiness_checks.py`: 26/26 checks passed (100%) | ✅ | Automated | 2026-04-22 |
| Automated manufacturing-status analysis | `npm run analyze:fertigungsstand`; writes `build/fertigungsstand/latest-summary.json` and `build/fertigungsstand/latest-report.md`; gate mode: `npm run analyze:fertigungsstand:gate` | ✅ Repo gate added; latest run evidence pending after checkout | Automated | 2026-04-24 |
| Admin-Panel documentation consistency | [ADMIN_PANEL_ARCHITECTURE.md](ADMIN_PANEL_ARCHITECTURE.md) now declares automation-first status and resolves stale SRI/CSP/inline-handler contradictions | ✅ | Documented + Automated gate | 2026-04-24 |
| CodeQL security scan (0 high/critical) | ⛔ Blocked by GitHub Actions billing/spending limit; local security suites pass but are not a substitute for fresh CodeQL evidence | ⛔ | Engineering | 2026-04-23 |
| Android build / Android CI | ⛔ Blocked by GitHub Actions billing/spending limit; local static readiness checks pass but fresh CI evidence is still required | ⛔ | Engineering | 2026-04-23 |
| Deployment result | Final production deploy evidence is pending because production runtime secrets/config and deploy sign-off are external to the repository | ⛔ | Engineering | offen |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
| --------------- | -------- | --------------- | -------- | ------ |
| android-apps (pairing + sync) | ⬜ | Android device suites / emulator commissioning still require a real device or complete AVD environment; this remains a hard go-live gate | Automated + QA/Operations pending | offen |
| `ai-config` (AI setup + generation) | ⬜ | Productive provider/fallback evidence is still required | Engineering + Product/Ops | offen |
| `support-workflow` (ticket lifecycle) | ✅ | `backend-jest` incl. e2e-ticket-lifecycle evidence | Automated | 2026-03-29 |
| `compliance-flow` (DSAR + audit) | ✅ | `test/enforcement-automation.test.ts` | Automated | 2026-03-19 |

### 3.3 Security and Identity Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| Legacy auth telemetry snapshot | [LEGACY_AUTH_INVENTORY.md](LEGACY_AUTH_INVENTORY.md) | ✅ | Documented | 2026-03-19 |
| Auth mode / feature flags confirmed | Legacy Auth Freeze active; full cutover still requires zero telemetry and explicit `DISABLE_LEGACY_SECRETKEY_AUTH=true` production decision | 🔄 | Documented + Automated analysis | 2026-04-24 |
| Secrets/config review | Repo-side cleanup documented; external Firebase key rotation and restrictions remain required | ⬜ | Security Owner | offen |
| Security baseline checklist | [SECURITY_BASELINE_CHECKLIST.md](SECURITY_BASELINE_CHECKLIST.md) | ✅ | Documented | 2026-04-22 |

### 3.4 Compliance Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
| --------------- | --------------- | -------- | ------------- | ------ |
| DSAR export test evidence | `test/branch-coverage-boost.test.ts` (`exportUserData` tests) | ✅ | Automated | 2026-03-19 |
| Audit trail evidence | AuditLogger in all functions, `test/enforcement-automation.test.ts` | ✅ | Automated | 2026-03-19 |
| Legal consent versioning test | [LEGAL_VERSIONING_RECONSENT_SPEC.md](LEGAL_VERSIONING_RECONSENT_SPEC.md) plus targeted Web-Control regression evidence | ✅ | Automated + Documented | 2026-04-17 |
| Country readiness packet (DE) | [COUNTRY_READINESS_PACKETS.md](COUNTRY_READINESS_PACKETS.md) | ✅ | Documented | 2026-03-19 |

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
| GitHub Actions Billing/Spending-Limit bereinigen | CodeQL und Android CI starten wieder und erzeugen aktuelle Run-Links | ⬜ | Repo Owner | offen |
| CodeQL-Ergebnis verlinken | Frischer erfolgreicher CodeQL-Run | ⬜ | Engineering Owner | nach Billing-Fix |
| Android CI Build-Nachweis verlinken | Frischer erfolgreicher Android-CI-Run | ⬜ | Engineering Owner | nach Billing-Fix |
| Fertigungsstandsanalyse lokal/CI ausfuehren | `build/fertigungsstand/latest-summary.json` und `latest-report.md` archiviert | ⬜ | Engineering Owner | naechster Checkout/CI-Lauf |
| Finalen Deploy-Nachweis erfassen | Deployment-Referenz in diesem Register | ⬜ | Engineering Owner | nach CI-Fix |
| Firebase-Key-Rotation + Restriktionen abschliessen | Screenshot/Export aus Firebase Console + Runbook-Eintrag | ⬜ | Security Owner | offen |
| Play Console Data-Safety final einreichen | Play Console Review-Screenshot | ⬜ | Product/Ops | offen |
| IARC Rating finalisieren | IARC-Freigabe im Play Console Dashboard | ⬜ | Product/Ops | offen |
| Store Listing DE vollständig | Finaler Store-Listing-Entwurf + Asset-Paket | ⬜ | Product/Ops | offen |
| Permissions Declaration einreichen | Finale Einreichbestaetigung aus Play Console | ⬜ | Compliance Owner | offen |
| App-Access-Anleitung in Play Console hinterlegen | Link/Screenshot zur Reviewer-Anleitung | ⬜ | Product/Ops | offen |
| Physische/Emulator-Commissioning-Checks durchführen | Ausgefüllte Commissioning-Checkliste mit Evidence | ⬜ | QA/Operations | offen |
| On-call/Eskalations-Roster verbindlich benennen | Roster mit Namen, Kontakt, Vertretung und Reachability-Test | ⬜ | Operations Lead | offen |

## 6. Current Priority Execution Plan

| # | Task | Owner | Abhaengigkeit | Nachweis fuer Done | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | GitHub-Actions-Billing/Spending-Limit beheben | Repo Owner | GitHub Account | CI_REVALIDATION_LATEST.md ohne Billing-Blocker | ⬜ |
| 2 | CodeQL und Android CI neu ausfuehren | Engineering | 1 | completed/success Runs | ⬜ |
| 3 | `npm run analyze:fertigungsstand:gate` ausfuehren und archivieren | Engineering | Checkout/CI | latest-summary.json + latest-report.md | ⬜ |
| 4 | Release-Evidence mit aktuellen Run-Links aktualisieren | Engineering | 2, 3 | dieses Register aktualisiert | ⬜ |
| 5 | Finalen Deploy-Nachweis erfassen | Engineering | 2 | Deployment-Referenz | ⬜ |
| 6 | Firebase-Key-Rotation nach Runbook durchfuehren | Security Owner | Console-Zugriff | Key-ID alt/neu + Revocation-Zeitpunkt dokumentiert | ⬜ |
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
