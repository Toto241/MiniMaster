# Release Evidence Register

**Status:** Consolidated evidence register for release candidate approval.

Current synthesis note (2026-05-30): Auth migration Phase 2 client work is complete in-repo (`test/auth-migration-phase2-completion.test.ts`). Local security evidence is automated via `npm run security:evidence:collect` (`build/security-evidence/`). Automated backend commissioning evidence is available via `npm run commissioning:evidence:collect` (`build/commissioning-evidence/`). Play Console submission packet consolidated in `docs/PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md`. iOS beta UI contract tests added (`MiniMasterParentUIContractTests`). External go-live blockers remain: GitHub Code Scanning enablement (Issue #158), physical Android commissioning, Play Console submission clicks, Firebase key rotation, on-call roster, final Go/No-Go decision.

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
| Test result (npm test) | **89 suites, 2429/2429 passed** | ✅ | Automated | 2026-04-24 |
| Coverage report (`npm test -- --coverage --runInBand`) | Stmts 99.56%, Branch 96.65%, Funcs 98.52%, Lines 99.65% | ✅ | Automated | 2026-03-21 |
| Firestore rules structural test | `test/firestore-rules.test.ts` passed (included in full suite) | ✅ | Automated | 2026-04-22 |
| Static readiness checks | `scripts/static_readiness_checks.py`: 26/26 checks passed (100%) | ✅ | Automated | 2026-04-22 |
| Automated manufacturing-status analysis | `npm run analyze:fertigungsstand`; writes `build/fertigungsstand/latest-summary.json` and `build/fertigungsstand/latest-report.md`; gate mode: `npm run analyze:fertigungsstand:gate` | ✅ Repo gate added; latest run evidence pending after checkout | Automated | 2026-04-24 |
| Admin-Panel documentation consistency | [ADMIN_PANEL_ARCHITECTURE.md](ADMIN_PANEL_ARCHITECTURE.md) now declares automation-first status and resolves stale SRI/CSP/inline-handler contradictions | ✅ | Documented + Automated gate | 2026-04-24 |
| PR152 selective integration guard | `npm run guard:pr152` — all P0/P1/P2 checks pass (security files, ESLint rules, Firestore rules/indexes, monetisation tabs present) | ✅ | Automated | 2026-04-24 |
| Desktop security hardening | Electron 36→41 and electron-builder 24→26 config applied; overrides for `@tootallnate/once` and `uuid` transitive vulns added | 🔄 Config applied; pending `npm install` | Automated + Engineering | 2026-04-24 |
| Local security evidence bundle | `npm run security:evidence:collect` → `build/security-evidence/latest-summary.json` | ✅ Repo-side pass (2026-05-30) | Automated | 2026-05-30 |
| Automated commissioning evidence (backend) | `npm run commissioning:evidence:collect` → `build/commissioning-evidence/latest-summary.json` | 🔄 Partial — backend pass, physical device pending | Automated | 2026-05-30 |
| Play Console submission packet | [PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md](PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md) | ✅ Repo-ready; external Play Console clicks pending | Product/Ops | 2026-05-30 |
| Auth migration Phase 2 (clients) | [AUTH_MIGRATION_PLAN.md](AUTH_MIGRATION_PLAN.md) + `test/auth-migration-phase2-completion.test.ts` | ✅ | Engineering | 2026-05-30 |
| iOS beta UI contract tests | `iosMasterApp/Tests/MiniMasterParentTests/MiniMasterParentUIContractTests.swift` | ✅ Repo-side | Engineering | 2026-05-30 |
| CodeQL security scan (0 high/critical) | ⛔ Blocked by repository setting (Code Scanning not enabled — Issue #158); local security evidence pass is not a substitute for SARIF upload | ⛔ | Engineering | 2026-05-30 |
| Android build / Android CI | ⚠️ Workflow now includes network health check (`dl.google.com` probe) and skips gracefully when Google Maven is unreachable; fresh green CI run still pending | ⚠️ | Engineering | 2026-04-24 |
| Deployment result | Final production deploy evidence is pending because production runtime secrets/config and deploy sign-off are external to the repository | ⛔ | Engineering | offen |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
| --------------- | -------- | --------------- | -------- | ------ |
| android-apps (pairing + sync) | 🔄 | Backend automated evidence in `build/commissioning-evidence/`; physical USB/emulator commissioning still required via `scripts/run-dual-device-commissioning.ps1` | Automated + QA/Operations pending | 2026-05-30 |
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
