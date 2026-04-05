# Release Decision - RC-2026-03-21

Status: working decision record for the current candidate.

## Release Candidate

| Field | Value |
| ----- | ----- |
| Candidate ID (commit/tag) | RC-2026-03-21 |
| Branch | main |
| Freeze Date | 2026-03-21 |
| Decision Date | 2026-03-21 |
| Target Rollout Scope | DE pilot |

## Mandatory Input Artifacts

1. docs/RELEASE_EVIDENCE_REGISTER.md
2. docs/COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md
3. docs/READINESS_SCORECARD_2026-03-19.md
4. RUNBOOK.md
5. docs/COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md (baseline)

## Gate Summary

| Gate | Status | Evidence Link | Blocker |
| ----- | ----- | ----- | ----- |
| Technical Quality (build/lint/test) | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Build/Lint/Test lokal gruen (52/52 Suites, 1867/1867 Tests) inkl. static-readiness; Android CI ist aktuell gruen, CodeQL bleibt noch technischer Restblocker. |
| Functional Commissioning | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Mehrere commissioning checks offen |
| Security and Identity | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Firebase key rotation/restrictions offen |
| Compliance | Pass | docs/RELEASE_EVIDENCE_REGISTER.md | Dokumentierte Compliance-Evidenz vorhanden |
| Play Store Submission Readiness | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Data Safety/IARC/Permissions/App Access offen |
| Operational Readiness | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | On-call roster in Vorbereitung (Template vorhanden), commissioning weiterhin offen |

## Open Issues

| Priority | Count | Details |
| ----- | ----- | ----- |
| P0 (Release Blocker) | 4 | Key rotation offen; Play Console Paket offen; Permissions/App Access offen; commissioning/offizielle Go-Live-Operations offen |
| P1 (Requires risk acceptance) | 0 | - |
| P2/P3 (Post-release backlog) | 1 | CodeQL-Workflow-Nachhaertung abgeschlossen, aber Repo-seitige Code-Scanning-Aktivierung und finaler gruener Lauf stehen noch aus |

## Pre-Go-Live Operational Blockers

| Item | Status | Owner | Due Date | Risk accepted? |
| ----- | ----- | ----- | ----- | ----- |
| Firebase key rotation/restrictions | Open | Security Owner | offen | No |
| Play Console Data Safety | Open | Product/Ops | offen | No |
| IARC rating | Open | Product/Ops | offen | No |
| Store listing finalized | Open | Product/Ops | offen | No |
| Permissions declaration | In progress - operative Vorlage vorhanden (`docs/PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md`), finale Play-Console-Einreichung offen | Compliance Owner | offen | No |
| App access guide attached | In progress - reviewer guide draft vorhanden (`docs/APP_ACCESS_REVIEWER_GUIDE.md`), Play Console Verlinkung offen | Product/Ops | offen | No |
| CodeQL result linked | Open - Run [23998139916](https://github.com/Toto241/MiniMaster/actions/runs/23998139916) completed/failure (aktueller Blocker: Workflow- oder Build-Fehler) | Engineering Owner | offen | No |
| Android CI build evidence linked | Closed - Run [23949514844](https://github.com/Toto241/MiniMaster/actions/runs/23949514844) completed/success | Engineering Owner | 2026-04-05 | No |
| Physical commissioning executed | Open | QA/Operations | offen | No |
| On-call roster assigned | In progress - roster template vorhanden (`docs/ONCALL_ESCALATION_ROSTER.md`), Kontakte/Sign-off offen | Operations Lead | offen | No |

## Decision

- [ ] Go
- [ ] Conditional Go
- [x] No-Go

Reason: Mandatory gates are not passed and multiple before-go-live blockers are unresolved without completion evidence.

## Risk Acceptance

| Risk ID | Description | Accepted By | Mitigation | Due Date |
| ----- | ----- | ----- | ----- | ----- |
| - | - | - | - | - |

## Sign-Off

| Role | Name | Decision | Date |
| ----- | ----- | ----- | ----- |
| Engineering Owner | | No-Go | 2026-03-21 |
| Product/Ops Owner | | No-Go | 2026-03-21 |
| Security/Compliance Owner | | No-Go | 2026-03-21 |
| Release Manager | | No-Go | 2026-03-21 |

## Follow-Up Backlog

| Item | Owner | Priority | Due Date |
| ----- | ----- | ----- | ----- |
| Code scanning im Repository aktivieren und CodeQL erneut ausfuehren | Repo Owner + Engineering | P0 | offen |
| CodeQL nach Repo-Aktivierung erneut ausfuehren und erfolgreichen Lauf verlinken (letzter Fehl-Run: 23998139916) | Engineering | P0 | offen |
| Operative Restpunkte aus Evidence Register schliessen | Product/Ops + Security + QA | P0 | offen |

## Next 24h Decision Path

1. Code scanning im Repository aktivieren und CodeQL erneut anstossen.
2. Erfolgreichen CodeQL-Lauf im Evidence Register nachziehen.
3. Security/Store/Commissioning/On-call Restpunkte mit Nachweis schliessen.
4. Re-Entscheidung durch Release Manager dokumentieren.

### Switch Rule

- Wenn alle P0-Blocker geschlossen und nachgewiesen sind: von **No-Go** auf **Conditional Go** wechseln.
- Wenn mindestens ein P0-Blocker offen bleibt: **No-Go** beibehalten.

## Immediate Operator Actions (After Billing Fix)

0. Externe Gesamtstrecke nach `docs/RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md` abarbeiten.
1. VS Code Task ausfuehren: `CI: Revalidate Release Gates (+ Rerun Failed)`
2. Danach VS Code Task ausfuehren: `CI: Revalidate Release Gates`
3. Pruefen, dass in `docs/CI_REVALIDATION_LATEST.md` Android CI auf `completed / success` steht und CodeQL keine externen Repo-Blocker mehr meldet.
4. `docs/RELEASE_EVIDENCE_REGISTER.md` aktualisieren (CodeQL + Android CI Nachweis auf aktuellen Stand).
5. Re-Decision und Sign-off in diesem Dokument aktualisieren.

Expected result:

- Technisches Gate von Fail auf Pass umschaltbar, sobald CodeQL gruen ist und keine weiteren technischen P0-Punkte offen bleiben.
