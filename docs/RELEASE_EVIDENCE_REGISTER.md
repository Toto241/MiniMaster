# Release Evidence Register

Status: consolidated evidence register for release candidate approval.

## 1. Purpose

Every release candidate must have traceable evidence for all mandatory gates. This register is the single artifact that links to all required proof.

## 2. Release Candidate Information

| Field | Value |
|-------|-------|
| Release Candidate ID | _(commit hash or tag)_ |
| Branch | `main` |
| Candidate Freeze Date | _(fill before review)_ |
| Deployment Reference | _(firebase deploy output reference)_ |

## 3. Mandatory Evidence Items

### 3.1 Technical Quality Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
|---------------|---------------|--------|-------------|------|
| Build artifact (`npm run build`) | CI run: _(URL)_ | ⬜ | | |
| Lint result (`npm run lint`) | CI run: _(URL)_ | ⬜ | | |
| Test result (`npm test` — 240 tests) | CI run: _(URL)_ | ⬜ | | |
| Coverage report (>75% statements) | Artifact: _(URL)_ | ⬜ | | |
| Firestore rules structural test | CI run: _(URL)_ | ⬜ | | |
| CodeQL security scan (0 high/critical) | Security tab: _(URL)_ | ⬜ | | |
| Android build (if applicable) | CI run: _(URL)_ | ⬜ | | |
| Deployment result | Firebase console: _(URL)_ | ⬜ | | |

### 3.2 Functional Commissioning Gate

| Checklist Key | Result | Evidence Link | Tester | Date |
|---------------|--------|---------------|--------|------|
| `android-apps` (pairing + sync) | ⬜ | | | |
| `ai-config` (AI setup + generation) | ⬜ | | | |
| `support-workflow` (ticket lifecycle) | ⬜ | | | |
| `compliance-flow` (DSAR + audit) | ⬜ | | | |

### 3.3 Security and Identity Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
|---------------|---------------|--------|-------------|------|
| Legacy auth telemetry snapshot | Admin Panel export: _(ref)_ | ⬜ | | |
| Auth mode / feature flags confirmed | Environment config: _(ref)_ | ⬜ | | |
| Secrets/config review | _(notes)_ | ⬜ | | |
| Security baseline checklist | _(link to SECURITY_BASELINE_CHECKLIST.md)_ | ⬜ | | |

### 3.4 Compliance Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
|---------------|---------------|--------|-------------|------|
| DSAR export test evidence | _(ref)_ | ⬜ | | |
| Audit trail evidence | _(ref)_ | ⬜ | | |
| Legal consent versioning test | _(ref)_ | ⬜ | | |
| Country readiness packet (DE) | COUNTRY_READINESS_PACKETS.md | ⬜ | | |

### 3.5 Operational Readiness Gate

| Evidence Item | Link/Reference | Status | Verified By | Date |
|---------------|---------------|--------|-------------|------|
| Runbook current version | RUNBOOK.md | ⬜ | | |
| On-call / escalation roster | _(ref)_ | ⬜ | | |
| Rollback rehearsal or path validated | _(notes)_ | ⬜ | | |
| Operator validation summary export | _(ref)_ | ⬜ | | |

## 4. Sign-Off Record

### Final Go/No-Go Decision

| Role | Name | Decision | Date | Signature |
|------|------|----------|------|-----------|
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
