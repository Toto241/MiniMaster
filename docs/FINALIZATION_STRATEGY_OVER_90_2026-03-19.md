# Finalization Strategy >90% (2026-03-19)

Status: execution strategy to raise repository finalization maturity above 90%.

## 1. Target State

The repository is considered "over 90% finalized" when all of the following conditions are met:

1. Technical gates are stable and reproducible in CI and local workflows.
2. Remaining go-live blockers (legacy auth migration, child enforcement hardening, compliance evidence) are closed or risk-accepted with explicit sign-off.
3. Operational acceptance is complete and evidenced.
4. Release governance (go/no-go, rollback, incident readiness) is consistently executable.
5. Documentation and implementation state are aligned with no material drift.

## 2. Finalization Scoring Model

Total score: 100 points.

1. Engineering Quality and Test Reliability: 25 points
2. Security and Identity Maturity: 20 points
3. Product Enforcement Reliability (Child App): 20 points
4. Compliance and Legal Readiness: 20 points
5. Operational Readiness and Release Governance: 15 points

Exit threshold for finalization:

1. At least 90 total points.
2. No open P0 issue.
3. Maximum one open P1 issue with explicit temporary risk acceptance and due date.

## 3. Work Package Roadmap

### WP-01 Technical Gate Stabilization (Priority: P0)

Objective: keep all engineering gates green and deterministic.

Scope:

1. Keep backend gates green (`build`, `lint`, `test`).
2. Keep emulator-dependent tests graceful and deterministic in CI.
3. Add CI checks for markdown and docs consistency where relevant.

Deliverables:

1. CI runbook for expected pass criteria.
2. Stable test reports attached to each release candidate.
3. Gate evidence archive for final sign-off.

Completion criteria:

1. 5 consecutive green pipeline runs on target branch.
2. No flaky failures in test gating suites.

---

### WP-02 Legacy Auth Decommissioning Wave (Priority: P0)

Objective: eliminate production dependency on client-passed legacy credentials.

Scope:

1. Activate controlled disable path for legacy auth in production (`DISABLE_LEGACY_SECRETKEY_AUTH`).
2. Monitor `legacyAuthUsage` until residual usage is zero for agreed stabilization period.
3. Migrate remaining client flows to Firebase Auth and claims-only access.

Deliverables:

1. Migration cutover plan with rollback strategy.
2. Legacy usage dashboard snapshot (before/after).
3. Final removal ticket set for legacy-specific fields/endpoints.

Completion criteria:

1. No privileged production flow depends on secretKey login.
2. Legacy usage is zero for 14 consecutive days or formally accepted exception.

---

### WP-03 Child Enforcement Hardening (Priority: P0)

Objective: raise blocking and anti-bypass reliability on real devices.

Scope:

1. Validate app-blocking behavior on defined OEM/reference matrix.
2. Validate anti-tamper, disable/uninstall detection, and restart resilience.
3. Validate offline policy behavior and sync recovery.

Deliverables:

1. Enforcement test matrix with pass/fail evidence.
2. Regression pack for lock/unlock, blacklist, usage rules and heartbeat flows.
3. Hardening defect backlog with owner and target date.

Completion criteria:

1. No trivial bypass path in agreed threat model.
2. All critical enforcement scenarios pass on reference devices.

---

### WP-04 Compliance and Country Readiness Closure (Priority: P0)

Objective: complete legal and store readiness for first launch countries.

Scope:

1. Complete country dossier checks (terms, privacy, consent, DSAR, retention).
2. Validate re-consent and policy versioning behavior end-to-end.
3. Close store readiness artifacts and disclosure consistency checks.

Deliverables:

1. Country-specific go/no-go packets.
2. Compliance evidence bundle linked to release candidate.
3. Signed legal and product approvals.

Completion criteria:

1. No open mandatory legal artifact in initial rollout countries.
2. DSAR and audit evidence reproducible and documented.

---

### WP-05 Commissioning and Operational Acceptance Closure (Priority: P0)

Objective: finalize all manual acceptance gates with auditable evidence.

Scope:

1. Execute all items in commissioning checklist.
2. Record evidence with timestamps, owner and environment.
3. Produce final operational readiness report.

Deliverables:

1. Completed commissioning checklist artifact.
2. Consolidated evidence register.
3. Final go/no-go decision record.

Completion criteria:

1. All commissioning keys in pass state.
2. Approval signatures captured from engineering, product/ops, compliance.

---

### WP-06 Security Baseline for Web and Desktop Surfaces (Priority: P1)

Objective: complete baseline hardening for operator-facing surfaces.

Scope:

1. CSP/SRI verification and session/re-auth consistency.
2. Credential handling verification for browser/desktop contexts.
3. Operator CLI restriction and auditability review.

Deliverables:

1. Security baseline checklist with status per surface.
2. Risk register entries for accepted residual risk.

Completion criteria:

1. No unresolved high severity web/desktop security baseline issue.

---

### WP-07 Documentation and Governance Alignment (Priority: P1)

Objective: remove implementation-documentation drift and lock governance flow.

Scope:

1. Align quality, architecture, runbook and acceptance docs with current implementation state.
2. Add release governance template with mandatory evidence links.

Deliverables:

1. Updated docs set with no contradictory release status.
2. Single release decision template used for every candidate.

Completion criteria:

1. Documentation review passes with no high-impact inconsistency.

## 4. Implementation Sequence

### Wave A (Immediate, 1-2 weeks)

1. WP-01 Technical Gate Stabilization
2. WP-05 Commissioning and Operational Acceptance Closure
3. WP-02 Legacy Auth Decommissioning preparation and telemetry verification

### Wave B (2-4 weeks)

1. WP-03 Child Enforcement Hardening
2. WP-04 Compliance and Country Readiness Closure

### Wave C (Parallel hardening)

1. WP-06 Security Baseline Web/Desktop
2. WP-07 Documentation and Governance Alignment

## 5. Dependency Map

1. WP-05 depends on WP-01 completion and latest production-like deployment.
2. WP-02 cutover depends on validated client migration paths.
3. WP-04 legal closure depends on completed compliance evidence and acceptance outputs from WP-05.
4. Final go/no-go requires completion of WP-02, WP-03, WP-04 and WP-05.

## 6. Tracking and Cadence

Weekly steering cadence:

1. Monday: blocker review and owner commitments.
2. Wednesday: risk and evidence checkpoint.
3. Friday: readiness score recalculation and release decision recommendation.

Required artifacts per week:

1. Updated scorecard snapshot.
2. Open P0/P1 register with owners and dates.
3. Evidence links for newly completed tasks.

## 7. Readiness Scorecard Template

Fill this at every steering checkpoint:

1. Engineering Quality and Test Reliability: /25
2. Security and Identity Maturity: /20
3. Product Enforcement Reliability: /20
4. Compliance and Legal Readiness: /20
5. Operational Readiness and Release Governance: /15
6. Total: /100
7. Open P0 count:
8. Open P1 count:
9. Recommendation: continue / release-candidate / go-live

## 8. Definition of Finalized (>90%)

The repository is marked over 90% finalized only if all statements below are true:

1. Score is at least 90/100.
2. Open P0 count is zero.
3. All commissioning keys passed and signed.
4. Legacy auth production dependency removed or formally risk-accepted with target removal date.
5. Child enforcement and compliance evidence complete for rollout scope.
