# Commissioning Acceptance Checklist (2026-03-19)

Status: operational checklist for final commissioning evidence and go-live decision.

## 1. Purpose

This checklist closes the remaining manual acceptance points that are not fully verifiable by automated backend checks.

Use this document as the final evidence artifact before production release approval.

## 2. Preconditions

1. Backend deployment completed successfully (`firebase deploy --only functions` green).
2. Backend quality gates green (`npm run build`, `npm run lint`, `npm test -- --runInBand`).
3. Operator panel validation executed once after the latest deployment.

## 3. Acceptance Blocks

### A. Android Apps Registered (Checklist key: android-apps)

Objective: verify both operational apps are correctly paired and visible in backend state.

Steps:

1. Register a parent device with the current production config.
2. Pair one child device via token/code flow.
3. Confirm child appears in parent dashboard with expected state (`isLocked`, rules sync baseline).
4. Confirm heartbeat or lastSeen updates for the child.

Evidence to capture:

1. Screenshot/operator export of parent dashboard with child listed.
2. Firestore document proof (`children/{childId}` with `masterImei`).
3. Timestamp of successful pairing event.

Acceptance decision:

- Pass if all 4 steps succeed and evidence exists.
- Fail if pairing is unstable or child state does not sync.

---

### B. AI Configuration + AI Workflow (Checklist key: ai-config)

Objective: ensure operator AI setup is complete and backend reports AI availability.

Steps:

1. In operator config, set `provider`, `model`, `keyRef`, `systemPrompt`.
2. Run setup validation and confirm AI check reports green.
3. Execute one support flow with AI suggestion generation.
4. Verify ticket stores AI fields (`aiGeneratedSolution`, confidence/status transitions as applicable).

Evidence to capture:

1. Operator validation result export showing AI configured.
2. One support ticket document with generated AI fields.
3. Timestamp and operator ID used for validation.

Acceptance decision:

- Pass if config completeness and AI generation both succeed.
- Fail if health check and runtime behavior diverge.

---

### C. Support Workflow Verified (Checklist key: support-workflow)

Objective: confirm end-to-end support handling including access grants and feedback paths.

Steps:

1. Create support ticket from parent context.
2. Grant support access from operator/admin.
3. Process ticket through AI/user feedback path.
4. Revoke support access and verify grant closure.

Evidence to capture:

1. Ticket lifecycle screenshots/log exports.
2. `supportAccessGrants` create and revoke evidence.
3. Final ticket status value and audit log references.

Acceptance decision:

- Pass if lifecycle is complete and reversible.
- Fail if grants remain active unintentionally or ticket state is inconsistent.

---

### D. Compliance Workflow Verified (Checklist key: compliance-flow)

Objective: prove legal/compliance paths are operational for DSAR/export/audit obligations.

Steps:

1. Trigger one DSAR/export request for a test account.
2. Verify audit trail entries are generated and retrievable.
3. Verify legal consent records are readable and version-consistent.
4. Confirm retention/deletion expectation for generated exports.

Evidence to capture:

1. DSAR/export artifact reference (sanitized).
2. Audit log query result for the action.
3. Legal consent record snapshot (`masterLegalConsents`).

Acceptance decision:

- Pass if DSAR and audit proof are complete and reproducible.
- Fail if any legal evidence chain is incomplete.

## 4. Final Go/No-Go Matrix

All of the following must be true for Go:

1. `android-apps` passed.
2. `ai-config` passed.
3. `support-workflow` passed.
4. `compliance-flow` passed.
5. No P0/P1 unresolved technical blockers in current release window.

Decision:

- Go: all criteria met.
- No-Go: one or more criteria not met.

## 5. Sign-Off Record

Release candidate:

- Version/commit:
- Deployment timestamp:

Approvals:

1. Engineering owner:
2. Product/Ops owner:
3. Compliance/Security owner:

Result:

- Final decision (Go/No-Go):
- Notes and residual risk:
