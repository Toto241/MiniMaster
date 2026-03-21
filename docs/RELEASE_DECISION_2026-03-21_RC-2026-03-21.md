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
| Technical Quality (build/lint/test) | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Build/Lint/Test lokal gruen; CodeQL/Android CI Verifikationslaeufe laufen aktuell (in progress) |
| Functional Commissioning | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Mehrere commissioning checks offen |
| Security and Identity | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Firebase key rotation/restrictions offen |
| Compliance | Pass | docs/RELEASE_EVIDENCE_REGISTER.md | Dokumentierte Compliance-Evidenz vorhanden |
| Play Store Submission Readiness | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Data Safety/IARC/Permissions/App Access offen |
| Operational Readiness | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | On-call roster + commissioning offen |

## Open Issues

| Priority | Count | Details |
| ----- | ----- | ----- |
| P0 (Release Blocker) | 6 | Key rotation offen; Play Console Paket offen; Permissions/App Access offen; CodeQL failed; Android CI failed; commissioning offen |
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
| App access guide attached | Open | Product/Ops | offen | No |
| CodeQL result linked | Open (failed run linked) | Engineering Owner | offen | No |
| Android CI build evidence linked | Open (failed run linked) | Engineering Owner | offen | No |
| Physical commissioning executed | Open | QA/Operations | offen | No |
| On-call roster assigned | Open | Operations Lead | offen | No |

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
| CodeQL workflow auf gruen bringen | Engineering | P0 | offen |
| Android CI workflow auf gruen bringen | Engineering | P0 | offen |
| CI-Rerun nach Push ausloesen und Evidence-Links aktualisieren | Engineering | P0 | offen |
| Operative Restpunkte aus Evidence Register schliessen | Product/Ops + Security + QA | P0 | offen |
