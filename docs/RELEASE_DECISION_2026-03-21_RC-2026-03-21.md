# Release Decision - RC-2026-03-21

**Status:** Working decision record for the current candidate.

## Release Candidate

| Field | Value |
| ----- | ----- |
| Candidate ID (commit/tag) | RC-2026-03-21 |
| Branch | main |
| Freeze Date | 2026-03-21 |
| Decision Date | 2026-04-16 |
| Target Rollout Scope | DE pilot |

## Mandatory Input Artifacts

1. [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
2. [COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md](COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md)
3. [READINESS_SCORECARD_2026-03-19.md](READINESS_SCORECARD_2026-03-19.md)
4. RUNBOOK.md
5. [COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md](COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md) (baseline)

## Gate Summary

| Gate | Status | Evidence Link | Blocker |
| ----- | ----- | ----- | ----- |
| Technical Quality (build/lint/test) | Fail | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) | Lokale Repo-Qualitaet ist grün und repo-seitige CI-Fixes sind umgesetzt; die neu angestossene Revalidation vom 2026-04-17 zeigt fuer CodeQL und Android CI aktuell `queued / pending`, die finale externe Blocker-Klassifikation steht noch aus. |
| Functional Commissioning | Fail | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) | Android-Single-Emulator-Nachweis konnte auf diesem Windows-Host noch nicht gefahren werden, weil zwar Emulator-Binary, Debug-Secrets und Debug-APKs vorhanden sind, aber noch kein AVD und keine lokalen avdmanager/sdkmanager-Tools verfuegbar sind; iOS bleibt externer macOS/Xcode-Nachweis |
| Security and Identity | Fail | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) | Firebase key rotation/restrictions offen |
| Compliance | Pass | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) | Dokumentierte Compliance-Evidenz vorhanden |
| Play Store Submission Readiness | Fail | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) | Data Safety/IARC/Permissions/App Access offen |
| Operational Readiness | Fail | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) | On-call roster in Vorbereitung (Template vorhanden), commissioning weiterhin offen |

## Open Issues

| Priority | Count | Details |
| ----- | ----- | ----- |
| P0 (Release Blocker) | 8 | Frischer CodeQL/Android-CI-Nachweis; aktueller Deploy-Nachweis; Firebase-Key-Rotation; Play Console Paket; Permissions/App Access; physisches Commissioning; On-call Reachability; finale Re-Decision |
| P1 (Required before broad rollout) | 3 | AI-Config-Nachweis; Store-Listing-Asset-Paket; Residual-Risk-/Scope-Finalisierung |
| P2/P3 (Post-release backlog) | 0 | - |

## Pre-Go-Live Operational Blockers

| Item | Status | Owner | Due Date | Risk accepted? |
| ----- | ----- | ----- | ----- | ----- |
| Firebase key rotation/restrictions | Open | Security Owner | offen | No |
| Play Console Data Safety | Open | Product/Ops | offen | No |
| IARC rating | Open | Product/Ops | offen | No |
| Store listing finalized | Open | Product/Ops | offen | No |
| Permissions declaration | Open - operative Vorlage vorhanden ([PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md)), finale Play-Console-Einreichung offen | Compliance Owner | offen | No |
| App access guide attached | Open - reviewer guide draft vorhanden ([APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md)), Play Console Verlinkung offen | Product/Ops | offen | No |
| CodeQL result linked | Open - Rerun [24559307544](https://github.com/Toto241/MiniMaster/actions/runs/24559307544) laeuft aktuell noch (`queued / pending`); ein aktueller gruener Nachweis fehlt bis zum Abschluss weiter | Engineering Owner | offen | No |
| Android CI build evidence linked | Open - Rerun [24241408803](https://github.com/Toto241/MiniMaster/actions/runs/24241408803) laeuft aktuell noch (`queued / pending`); ein aktueller gruener Nachweis fehlt bis zum Abschluss weiter | Engineering Owner | offen | No |
| Deployment result linked | Open - lokale Deploy-Pruefung ergab vorhandene Firebase-CLI/Projektbindung, aber keine produktiven Runtime-Secrets im Workspace; finaler Deploy wurde daher nicht aus dieser Umgebung ausgefuehrt | Engineering Owner | offen | No |
| Physical commissioning executed | Open - lokaler Single-Emulator-Pfad auf Windows weiter blockiert durch fehlendes AVD und fehlende lokale avdmanager/sdkmanager-Tools; iOS-Funktionslauf bleibt externer macOS/Xcode-Nachweis | QA/Operations | offen | No |
| On-call roster assigned | Open - roster template vorhanden ([ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md)), Kontakte/Sign-off offen | Operations Lead | offen | No |

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
| Engineering Owner | | No-Go | 2026-04-16 |
| Product/Ops Owner | | No-Go | 2026-04-16 |
| Security/Compliance Owner | | No-Go | 2026-04-16 |
| Release Manager | | No-Go | 2026-04-16 |

## Follow-Up Backlog

| Item | Owner | Priority | Due Date |
| ----- | ----- | ----- | ----- |
| P0/P1-Ausfuehrung nach [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md) abarbeiten | Engineering + Product/Ops + Security + QA + Operations | P0 | offen |
| Frischen CodeQL-/Android-CI-/Deploy-Nachweis im Evidence Register verlinken | Engineering | P0 | offen |
| Operative Restpunkte aus Evidence Register schliessen | Product/Ops + Security + QA + Operations | P0 | offen |

## Next 24h Decision Path

1. P0-1 bis P0-3 aus [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md) schliessen.
2. Security/Store/Commissioning/On-call Restpunkte mit Nachweis schliessen.
3. Evidence Register aktualisieren.
4. Re-Entscheidung durch Release Manager dokumentieren.

### Switch Rule

- Wenn alle Gates bestanden sind, hoechstens ein P1 offen bleibt und dafuer eine dokumentierte Risk Acceptance mit Due Date vorliegt: von **No-Go** auf **Conditional Go** wechseln.
- Wenn alle Gates bestanden sind und keine P0-Punkte offen bleiben: von **No-Go** auf **Go** wechseln.
- Wenn ein Gate fehlschlaegt oder ein P0-Blocker offen bleibt: **No-Go** beibehalten.

## Immediate Operator Actions (After Billing Fix)

0. Priorisierte Restarbeiten nach [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md) abarbeiten.
1. GitHub Actions Billing/Spending-Limit im Account beheben.
2. Danach VS Code Task ausfuehren: `CI: Revalidate Release Gates (+ Rerun Failed)`
3. Anschliessend VS Code Task ausfuehren: `CI: Revalidate Release Gates`
4. [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) aktualisieren.
5. Re-Decision und Sign-off in diesem Dokument aktualisieren.

Expected result:

- Technisches Gate von Fail auf Pass umschaltbar, sobald CodeQL gruen ist und keine weiteren technischen P0-Punkte offen bleiben.
