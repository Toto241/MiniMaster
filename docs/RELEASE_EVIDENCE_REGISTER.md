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
| Build artifact (`npm run build`) | Local build successful (`tsc -p tsconfig.json`) | ✅ | Automated | 2026-03-21 |
| Lint result (`npm run lint`) | 0 errors, 0 warnings | ✅ | Automated | 2026-03-21 |
| Test result (`npm test -- --runInBand`) | 38 suites, 1482/1482 passed | ✅ | Automated | 2026-03-21 |
| Coverage report (`npm test -- --coverage --runInBand`) | Stmts 99.56%, Branch 96.65%, Funcs 98.52%, Lines 99.65% | ✅ | Automated | 2026-03-21 |
| Firestore rules structural test | `test/firestore-rules.test.ts` passed (included in full suite) | ✅ | Automated | 2026-03-21 |
| Deploy workflow config validation | `.github/workflows/deploy.yml`: korrekte Projekt-ID `minimaster-28fbd` + Secrets→`.env` Mapping dokumentiert | ✅ | Documented | 2026-03-21 |
| CodeQL security scan (0 high/critical) | Letzter Run: failed - [Run 23380432454](https://github.com/Toto241/MiniMaster/actions/runs/23380432454); Root cause (Compose weight import) in `childApp/.../MainActivity.kt` behoben, neuer CI-Run wartet auf Push (kein `workflow_dispatch`) | ⬜ | Automated | 2026-03-21 |
| Android build (if applicable) | Letzter Run: failed - [Run 23378478907](https://github.com/Toto241/MiniMaster/actions/runs/23378478907); Root cause (Compose weight import) in `childApp/.../MainActivity.kt` behoben, neuer CI-Run wartet auf Push (kein `workflow_dispatch`) | ⬜ | Automated | 2026-03-21 |
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
| On-call / escalation roster | _(pending assignment)_ | ⬜ | | |
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

## 6. Before Go-Live: Operative Restpunkte

| Aktion | Zielnachweis | Status | Owner | Zieltermin |
| ------ | ------ | ------ | ------ | ------ |
| Firebase-Key-Rotation + Restriktionen abschließen | Screenshot/Export aus Firebase Console + Runbook-Eintrag | ⬜ | Security Owner | offen |
| Play Console Data-Safety final einreichen | Play Console Review-Screenshot | ⬜ | Product/Ops | offen |
| IARC Rating finalisieren | IARC-Freigabe im Play Console Dashboard | ⬜ | Product/Ops | offen |
| Store Listing DE vollständig (Text + Screenshots) | Finaler Store-Listing-Entwurf + Asset-Paket | ⬜ | Product/Ops | offen |
| Permissions Declaration einreichen (Accessibility/Usage/Overlay) | Bestätigte Permissions-Declaration | ⬜ | Compliance Owner | offen |
| App-Access-Anleitung in Play Console hinterlegen | Link/Screenshot zur Reviewer-Anleitung | ⬜ | Product/Ops | offen |
| CodeQL-Ergebnis verlinken | [Run 23380432454](https://github.com/Toto241/MiniMaster/actions/runs/23380432454) (aktuell failed; Fix in childApp MainActivity umgesetzt; 0 high/critical als Ziel) | ⬜ | Engineering Owner | offen |
| Android CI Build-Nachweis verlinken | [Run 23378478907](https://github.com/Toto241/MiniMaster/actions/runs/23378478907) (aktuell failed; Fix in childApp MainActivity umgesetzt) | ⬜ | Engineering Owner | offen |
| Physische Commissioning-Checks durchführen | Ausgefüllte COMMISSIONING_ACCEPTANCE_CHECKLIST | ⬜ | QA/Operations | offen |
| On-call/Eskalations-Roster verbindlich benennen | Roster mit Namen, Kontakt, Vertretung | ⬜ | Operations Lead | offen |
