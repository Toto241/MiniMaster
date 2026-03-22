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
| Technical Quality (build/lint/test) | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Build/Lint/Test/Coverage lokal gruen; CodeQL- und Android-CI-Reruns wurden am 2026-03-22 ausgefuehrt und erneut mit Billing/Spending-Limit Fehler beendet |
| Functional Commissioning | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Mehrere commissioning checks offen |
| Security and Identity | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Firebase key rotation/restrictions offen |
| Compliance | Pass | docs/RELEASE_EVIDENCE_REGISTER.md | Dokumentierte Compliance-Evidenz vorhanden |
| Play Store Submission Readiness | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Data Safety/IARC/Permissions/App Access offen |
| Operational Readiness | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | On-call roster in Vorbereitung (Template vorhanden), commissioning weiterhin offen |

## Open Issues

| Priority | Count | Details |
| ----- | ----- | ----- |
| P0 (Release Blocker) | 5 | GitHub Actions Billing/Spending-Limit fuer CodeQL/Android CI offen; Key rotation offen; Play Console Paket offen; Permissions/App Access offen; commissioning offen |
| P1 (Requires risk acceptance) | 0 | - |
| P2/P3 (Post-release backlog) | 0 | - |

## Pre-Go-Live Operational Blockers

| Item | Status | Owner | Due Date | Risk accepted? |
| ----- | ----- | ----- | ----- | ----- |
| Firebase key rotation/restrictions | Open | Security Owner | offen | No |
| Play Console Data Safety | Open | Product/Ops | offen | No |
| IARC rating | Open | Product/Ops | offen | No |
| Store listing finalized | Open | Product/Ops | offen | No |
| Permissions declaration | Open | Compliance Owner | offen | No |
| App access guide attached | In progress - reviewer guide draft vorhanden (`docs/APP_ACCESS_REVIEWER_GUIDE.md`), Play Console Verlinkung offen | Product/Ops | offen | No |
| CodeQL result linked | Open - Run [23401992153](https://github.com/Toto241/MiniMaster/actions/runs/23401992153) completed/failure (Billing/Spending-Limit; kein Runner-Start) | Engineering Owner | offen | No |
| Android CI build evidence linked | Open - Run [23401992162](https://github.com/Toto241/MiniMaster/actions/runs/23401992162) completed/failure (Billing/Spending-Limit; kein Runner-Start) | Engineering Owner | offen | No |
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
| GitHub Billing/Spending-Limit fuer Actions bereinigen | Repo Owner | P0 | offen |
| CodeQL nach Billing-Fix erneut ausfuehren und verlinken (letzter Fehl-Run: 23401992153) | Engineering | P0 | offen |
| Android CI nach Billing-Fix erneut ausfuehren und verlinken (letzter Fehl-Run: 23401992162) | Engineering | P0 | offen |
| Operative Restpunkte aus Evidence Register schliessen | Product/Ops + Security + QA | P0 | offen |

## Next 24h Decision Path

1. Billing fix abschliessen und CI-Reruns starten.
2. CodeQL + Android CI auf aktuellen erfolgreichen Run bringen und im Evidence Register verlinken.
3. Security/Store/Commissioning/On-call Restpunkte mit Nachweis schliessen.
4. Re-Entscheidung bis 2026-03-23 18:00 durch Release Manager dokumentieren.

### Switch Rule

- Wenn alle P0-Blocker geschlossen und nachgewiesen sind: von **No-Go** auf **Conditional Go** wechseln.
- Wenn mindestens ein P0-Blocker offen bleibt: **No-Go** beibehalten.

## Immediate Operator Actions (After Billing Fix)

1. VS Code Task ausfuehren: `CI: Revalidate Release Gates (+ Rerun Failed)`
2. Danach VS Code Task ausfuehren: `CI: Revalidate Release Gates`
3. Pruefen, dass in `docs/CI_REVALIDATION_LATEST.md` beide Pipelines auf `completed / success` stehen.
4. `docs/RELEASE_EVIDENCE_REGISTER.md` aktualisieren (CodeQL + Android CI Nachweis auf aktuell erfolgreich).
5. Re-Decision und Sign-off in diesem Dokument aktualisieren.

Expected result:
- Technisches Gate von Fail auf Pass umschaltbar, sofern keine weiteren offenen technischen P0-Punkte bestehen.
