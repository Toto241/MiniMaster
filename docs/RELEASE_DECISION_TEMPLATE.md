# Release Decision Template

**Status:** Mandatory template for every release candidate go/no-go decision.

**Companion docs:** [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md), [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md), [RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md](RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md), [COMPLETE_ACCEPTANCE_PROCESS_2026-03-19.md](COMPLETE_ACCEPTANCE_PROCESS_2026-03-19.md)

## Release Candidate

|Field|Value|
|-------|-------|
|Candidate ID (commit/tag)||
|Branch||
|Freeze Date||
|Decision Date||
|Target Rollout Scope||

### Mandatory Input Artifacts

1. [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) (inkl. Abschnitt "Before Go-Live: Operative Restpunkte")
2. [COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md](COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md)
3. [READINESS_SCORECARD_2026-03-19.md](READINESS_SCORECARD_2026-03-19.md)
4. [RUNBOOK.md](../RUNBOOK.md) (inkl. Release Cutover Checklist)
5. Optional: [COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md](COMPLIANCE_EVIDENCE_BUNDLE_2026-03-19.md) als Baseline-Nachweis

## Gate Summary

|Gate|Status|Evidence Link|Blocker|
|------|--------|---------------|---------|
|Technical Quality (build/lint/test)|⬜ Pass / ⬜ Fail|||
|Functional Commissioning|⬜ Pass / ⬜ Fail|||
|Security and Identity|⬜ Pass / ⬜ Fail|||
|Compliance|⬜ Pass / ⬜ Fail|||
|Play Store Submission Readiness|⬜ Pass / ⬜ Fail|||
|Operational Readiness|⬜ Pass / ⬜ Fail|||

## Open Issues

|Priority|Count|Details|
|----------|-------|---------|
|P0 (Release Blocker)|||
|P1 (Requires risk acceptance)|||
|P2/P3 (Post-release backlog)|||

## Decision Rules

1. **Go:** All gates passed, zero P0 issues.
2. **Conditional Go:** All gates passed, max one P1 with documented risk acceptance and due date.
3. **No-Go:** Any gate failed or any P0 issue open.
4. **No-Go:** Any "Before Go-Live: Operative Restpunkte" item is unresolved without owner + due date + explicit risk acceptance.

## Pre-Go-Live Operational Blockers (from Release Evidence Register)

|Item|Status|Owner|Due Date|Risk accepted?|
|------|--------|-------|----------|----------------|
|Firebase key rotation/restrictions|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|Play Console Data Safety|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|IARC rating|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|Store listing finalized|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|Permissions declaration|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|App access guide attached|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|CodeQL result linked|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|Android CI build evidence linked|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|Physical commissioning executed|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|
|On-call roster assigned|⬜ Open / ⬜ Closed|||⬜ Yes / ⬜ No|

## Decision

- [ ] **Go** — Release approved for rollout scope.
- [ ] **Conditional Go** — Release approved with documented residual risk.
- [ ] **No-Go** — Release blocked, action items below.

## Risk Acceptance (if Conditional Go)

|Risk ID|Description|Accepted By|Mitigation|Due Date|
|---------|-------------|-------------|------------|----------|
||||||

## Sign-Off

|Role|Name|Decision|Date|
|------|------|----------|------|
|Engineering Owner||||
|Product/Ops Owner||||
|Security/Compliance Owner||||
|Release Manager||||

## Follow-Up Backlog

|Item|Owner|Priority|Due Date|
|------|-------|----------|----------|
|||||

---

## Usage Instructions

1. Copy this template for each release candidate.
2. Fill all fields before the go/no-go board meeting.
3. Pull all blocker states from [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) and keep both documents in sync.
4. Archive the completed template with the release artifacts.
5. Use consistent naming: `RELEASE_DECISION_<date>_<candidate-id>.md`
