# Release Decision Template

Status: mandatory template for every release candidate go/no-go decision.

## Release Candidate

| Field | Value |
|-------|-------|
| Candidate ID (commit/tag) | |
| Branch | |
| Freeze Date | |
| Decision Date | |
| Target Rollout Scope | |

## Gate Summary

| Gate | Status | Evidence Link | Blocker |
|------|--------|---------------|---------|
| Technical Quality (build/lint/test) | ⬜ Pass / ⬜ Fail | | |
| Functional Commissioning | ⬜ Pass / ⬜ Fail | | |
| Security and Identity | ⬜ Pass / ⬜ Fail | | |
| Compliance | ⬜ Pass / ⬜ Fail | | |
| Operational Readiness | ⬜ Pass / ⬜ Fail | | |

## Open Issues

| Priority | Count | Details |
|----------|-------|---------|
| P0 (Release Blocker) | | |
| P1 (Requires risk acceptance) | | |
| P2/P3 (Post-release backlog) | | |

## Decision Rules

1. **Go:** All gates passed, zero P0 issues.
2. **Conditional Go:** All gates passed, max one P1 with documented risk acceptance and due date.
3. **No-Go:** Any gate failed or any P0 issue open.

## Decision

- [ ] **Go** — Release approved for rollout scope.
- [ ] **Conditional Go** — Release approved with documented residual risk.
- [ ] **No-Go** — Release blocked, action items below.

## Risk Acceptance (if Conditional Go)

| Risk ID | Description | Accepted By | Mitigation | Due Date |
|---------|-------------|-------------|------------|----------|
| | | | | |

## Sign-Off

| Role | Name | Decision | Date |
|------|------|----------|------|
| Engineering Owner | | | |
| Product/Ops Owner | | | |
| Security/Compliance Owner | | | |
| Release Manager | | | |

## Follow-Up Backlog

| Item | Owner | Priority | Due Date |
|------|-------|----------|----------|
| | | | |

---

## Usage Instructions

1. Copy this template for each release candidate.
2. Fill all fields before the go/no-go board meeting.
3. Link to the Release Evidence Register for detailed evidence.
4. Archive the completed template with the release artifacts.
5. Use consistent naming: `RELEASE_DECISION_<date>_<candidate-id>.md`
