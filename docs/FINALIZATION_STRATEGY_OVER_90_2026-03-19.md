# Finalization Strategy >90% (2026-03-19)

Status: execution strategy to raise repository finalization maturity above 90%.

Update 2: repository total is now 94/100. The remaining work is no longer "reach 90+ overall", but "push every relevant single metric above 90%".

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

## 9. Deliverables Index

All work package deliverables are tracked through the following artifacts:

| WP | Deliverable | Location |
|----|------------|----------|
| WP-01 | CI Runbook | [docs/CI_RUNBOOK.md](CI_RUNBOOK.md) |
| WP-01 | CI artifact archiving | [.github/workflows/ci.yml](../.github/workflows/ci.yml) (backend-quality-gate artifact) |
| WP-02 | Legacy Auth Usage Monitor | [admin-panel/app.js](../admin-panel/app.js) (`loadLegacyAuthUsage`) + [admin-panel/index.html](../admin-panel/index.html) |
| WP-02 | Migration Cutover Plan | [docs/LEGACY_AUTH_CUTOVER_PLAN.md](LEGACY_AUTH_CUTOVER_PLAN.md) |
| WP-03 | Enforcement Test Matrix | [docs/CHILD_ENFORCEMENT_TEST_MATRIX.md](CHILD_ENFORCEMENT_TEST_MATRIX.md) |
| WP-04 | Country Readiness Packets | [docs/COUNTRY_READINESS_PACKETS.md](COUNTRY_READINESS_PACKETS.md) |
| WP-05 | Release Evidence Register | [docs/RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) |
| WP-06 | Security Baseline Checklist | [docs/SECURITY_BASELINE_CHECKLIST.md](SECURITY_BASELINE_CHECKLIST.md) |
| WP-06 | SRI on external scripts | [web-control/index.html](../web-control/index.html) + [admin-panel/index.html](../admin-panel/index.html) |
| WP-07 | Release Decision Template | [docs/RELEASE_DECISION_TEMPLATE.md](RELEASE_DECISION_TEMPLATE.md) |
| WP-07 | Readiness Scorecard | [docs/READINESS_SCORECARD_2026-03-19.md](READINESS_SCORECARD_2026-03-19.md) |

## 10. Current Position After Reaching 94/100

The repository already passed the original >90 finalization target. The next quality bar is stricter:

1. Every scorecard category should be strictly above 90% of its own maximum.
2. Every top-level coverage metric should be above 90%.
3. Every high-risk backend module should be above 90% on lines and branch coverage.
4. Every release-governance evidence lane should be at least 90% complete before production publish.

Current measured state:

| Metric Family | Current | Threshold for "all metrics >90" | Gap |
|---------------|---------|----------------------------------|-----|
| Total score | 94/100 | >90 | none |
| Engineering category | 24/25 = 96% | >90 | none |
| Security category | 18/20 = 90% | >90 | **needs +1** |
| Enforcement category | 19/20 = 95% | >90 | none |
| Compliance category | 19/20 = 95% | >90 | none |
| Operations category | 14/15 = 93.3% | >90 | none |
| Coverage statements | 84.83% | >90 | **needs +5.17** |
| Coverage branches | 71.20% | >90 | **needs +18.80** |
| Coverage functions | 86.01% | >90 | **needs +3.99** |
| Coverage lines | 85.30% | >90 | **needs +4.70** |

Conclusion:

1. The scorecard is close to saturation.
2. The real long pole is branch coverage, not governance.
3. The fastest route to "every metric >90" is a file-targeted test campaign, plus a small number of operational proof closures.

## 11. Exact Weak Spots Blocking >90%

### 11.1 Scorecard-Level Gaps

| Area | Current | Why it is not >90 | Fastest closing action |
|------|---------|-------------------|------------------------|
| Security and Identity Maturity | 18/20 | exactly 90%, not above | attach CodeQL result + legacy auth dashboard export + close one baseline evidence gap |

### 11.2 Global Coverage Gaps

| Coverage Metric | Current | Main cause |
|-----------------|---------|-----------|
| Statements | 84.83% | large unexecuted admin/auth/pairing paths |
| Branches | 71.20% | many validation/error/permission branches still unhit |
| Functions | 86.01% | helper functions and v2 trigger branches not all executed |
| Lines | 85.30% | long tail of operational and corruption-handling lines |

### 11.3 File-Level Coverage Gaps

Derived from lcov on 2026-03-19:

| File | Function Coverage | Line Coverage | Branch Coverage | Strategic meaning |
|------|-------------------|---------------|-----------------|------------------|
| src/admin.ts | 34/42 = 81.0% | 332/349 = 95.1% | 192/267 = 71.9% | biggest branch pool in the backend |
| src/auth.ts | 7/9 = 77.8% | 105/139 = 75.5% | 66/93 = 71.0% | weakest auth and migration coverage |
| src/device.ts | 10/10 = 100% | 171/195 = 87.7% | 100/117 = 85.5% | close to 90, needs failure-path lift |
| src/pairing.ts | 4/4 = 100% | 137/168 = 81.5% | 57/86 = 66.3% | best ROI after auth for branch gains |
| src/tasks.ts | 4/4 = 100% | 111/121 = 91.7% | 44/57 = 77.2% | line target met, branch target still low |
| src/triggers.ts | 6/8 = 75.0% | 117/125 = 93.6% | 90/110 = 81.8% | retry/error branches still missing |

Interpretation:

1. auth.ts and pairing.ts are the highest leverage files for statements and lines.
2. admin.ts is the highest leverage file for branches because it contains 267 branch points.
3. triggers.ts and tasks.ts are the easiest way to raise function coverage above 90.
4. device.ts only needs targeted failure tests, not structural work.

## 12. Strategy Stack To Push Every Metric Above 90%

### Strategy S-01: Coverage Lift Wave Focused on Branch Density

Objective: move global coverage to at least 90/90/90/90.

Execution rule:

1. Do not add broad low-value tests.
2. Only target files with the largest uncovered branch pools.
3. Prefer tests that cover validation, authorization, corruption cleanup, retry and catch paths because they move multiple metrics at once.

Target order:

1. src/auth.ts
2. src/pairing.ts
3. src/admin.ts
4. src/triggers.ts
5. src/tasks.ts
6. src/device.ts

Expected effect:

1. auth.ts + pairing.ts should raise statements and lines fastest.
2. admin.ts should raise branches fastest.
3. triggers.ts should raise functions fastest.

### Strategy S-02: Security Category Move from 90% to >90%

Objective: move Security and Identity Maturity from 18/20 to 19/20 or 20/20.

Actions:

1. Capture and archive one legacy auth dashboard snapshot from the admin panel.
2. Link a real CodeQL scan result or explicit "0 high/critical" evidence in the evidence register.
3. Close one remaining web baseline evidence item, preferably CSP/style-src risk ownership or session re-auth proof.

Reasoning:

1. This category is already at the boundary.
2. It can be pushed above 90 without code-heavy changes.
3. It should not be mixed into the coverage wave because the closure mechanics are different.

### Strategy S-03: Commissioning Proof Saturation

Objective: ensure operational evidence is not only >90 as a category, but >90 complete per release gate.

Actions:

1. Execute the physical commissioning checklist and mark each key with tester, timestamp and environment.
2. Assign the on-call roster directly in the release evidence register.
3. Attach one real rollback rehearsal reference or operator dry-run output.

Reasoning:

1. Operations is already above 90, but still contains manual placeholders.
2. Removing placeholders reduces go-live risk even if it barely changes the score.

### Strategy S-04: Replace "broad work packages" with "metric contracts"

Objective: stop tracking progress by package completion only and instead track by explicit numeric contracts.

Recommended contracts:

1. Global statements >= 90.0%
2. Global branches >= 90.0%
3. Global functions >= 90.0%
4. Global lines >= 90.0%
5. Security category >= 19/20
6. Each critical backend file branch coverage >= 90.0%
7. Each critical backend file line coverage >= 90.0%

Reasoning:

1. The repository already proved it can hit package-level milestones.
2. The remaining problem is precision, not scope.
3. Metric contracts make it obvious what still blocks "all metrics >90".

## 13. File-Targeted Test Campaigns

### 13.1 auth.ts Campaign

Primary goal: raise function, line and branch coverage above 90.

Test themes:

1. bootstrapFirstAdmin full happy path and denial path.
2. legacy auth disable-flag behavior when secretKey auth is blocked.
3. telemetry logging branches in logLegacyAuthUsage.
4. failure paths in role assignment and custom token issuance.
5. malformed user state and claims reconciliation.

Why this matters:

1. auth.ts is currently the weakest major backend file on line coverage.
2. Small targeted tests will disproportionately move global statements, lines and functions.

### 13.2 pairing.ts Campaign

Primary goal: raise branch coverage from 66.3% to >90.

Test themes:

1. corrupt pairing code documents with missing or wrong field types.
2. corrupt token documents that must be deleted before throwing.
3. deadline boundary conditions at exact expiry time.
4. collision exhaustion path for code generation.
5. child-limit exhaustion and malformed subscription state.

Why this matters:

1. pairing.ts has a small file size with many uncovered branches.
2. It is one of the best ROI targets for branch coverage.

### 13.3 admin.ts Campaign

Primary goal: raise branch coverage from 71.9% to at least 90.

Test themes:

1. remaining branches in health check and daily error report flows.
2. analyzeSystemErrors variants for empty, malformed and mixed datasets.
3. updateKnowledgeBase denial/failure branches.
4. sendTestFcmMessage missing-token and send-failure paths.
5. triggerScheduledJob and executeAutoFix branches not yet covered.

Why this matters:

1. admin.ts contains the largest remaining branch pool.
2. Even modest progress here moves the global branch metric materially.

### 13.4 triggers.ts Campaign

Primary goal: raise function coverage from 75% to >90 and branch coverage from 81.8% to >90.

Test themes:

1. sendFcmWithRetry retry backoff path and final failure path.
2. onChildDeviceUpdateV2 no-token, no-change, partial-change and send-failure paths.
3. analyzeTaskPhoto malformed storage URL and missing bucket metadata paths.
4. analyzeWithGemini invalid schema and timeout variants.

Why this matters:

1. Two currently unhit functions are in this file.
2. A small trigger-focused suite can close the global function gap quickly.

### 13.5 tasks.ts and device.ts Campaigns

Primary goal: finish the long tail.

Test themes for tasks.ts:

1. unauthorized master access.
2. invalid state transitions for complete and approve.
3. corrupted task documents and missing proof handling.
4. internal update failures for create/complete/approve.

Test themes for device.ts:

1. update failures after authorization succeeds.
2. getRulesForChild malformed child doc shape.
3. reportDailyUsage invalid numeric bounds and duplicate day records.
4. tamper event persistence failure after notification path.

Why this matters:

1. These files are already near target.
2. The right 10-15 tests can push them past 90 branch and line coverage.

## 14. Operational Strategies Beyond Test Coverage

### O-01 Legacy Auth Closure Proof

Produce a dated evidence packet containing:

1. admin panel screenshot/export of legacyAuthUsage,
2. explanation of current residual usage,
3. kill-switch state,
4. target date for zero-usage enforcement.

Effect:

1. moves Security and Identity Maturity above 90,
2. reduces release-review ambiguity.

### O-02 Country Readiness Saturation

Close the final legal/store readiness gap by attaching:

1. German store screenshots,
2. final disclosures copy,
3. age rating and parental disclosure references,
4. cross-check against legal packet and privacy text.

Effect:

1. makes Compliance and Legal Readiness effectively complete,
2. removes the last documentation-only blocker in rollout countries.

### O-03 Commissioning Execution Pack

Create one auditable pack containing:

1. checklist execution evidence,
2. operator identity,
3. environment details,
4. observed result,
5. linked screenshots or log snippets.

Effect:

1. turns current documentation readiness into execution readiness,
2. prevents last-minute release-governance gaps.

## 15. Recommended Execution Order From Here

### Phase 1: Fastest metric lift (1-2 days)

1. auth.ts targeted tests
2. pairing.ts targeted tests
3. triggers.ts missing-function tests

Expected outcome:

1. strongest movement in statements, lines and functions,
2. visible improvement in branch coverage.

### Phase 2: Branch-heavy lift (2-4 days)

1. admin.ts branch campaign
2. tasks.ts invalid-state campaign
3. device.ts failure-path campaign

Expected outcome:

1. global branch coverage pushed toward 85-90,
2. all critical backend files approach or exceed 90 line coverage.

### Phase 3: Non-code saturation (parallel)

1. legacy auth dashboard export
2. CodeQL result link
3. commissioning execution evidence
4. DE store artifact completion

Expected outcome:

1. every scorecard category strictly above 90,
2. release evidence becomes publish-ready.

## 16. Definition of Done for "Every Metric >90%"

This stricter goal is complete only when all conditions below are true:

1. Total score is >= 95/100.
2. Every scorecard category is strictly above 90% of its maximum.
3. Global statements, branches, functions and lines are each >= 90.0%.
4. src/admin.ts, src/auth.ts, src/device.ts, src/pairing.ts, src/tasks.ts and src/triggers.ts each have >= 90.0% line coverage.
5. The same critical files each have >= 90.0% branch coverage, or any exception is explicitly risk-accepted with owner and removal date.
6. Security evidence includes a real CodeQL result and legacy auth telemetry snapshot.
7. Commissioning evidence is executed, not only templated.

## 17. Recommended Next Work Packages

To reach the stricter target, add these work packages after WP-07:

### WP-08 Quantitative Coverage Saturation (Priority: P0)

Objective: push all global coverage metrics above 90.

Deliverables:

1. auth/pairing/admin/triggers test expansions,
2. updated coverage evidence,
3. no uncovered critical helper functions.

Completion criteria:

1. statements >= 90,
2. branches >= 90,
3. functions >= 90,
4. lines >= 90.

### WP-09 Security Evidence Saturation (Priority: P0)

Objective: move security maturity from boundary state to clearly above threshold.

Deliverables:

1. legacy auth dashboard snapshot,
2. CodeQL result reference,
3. web security residual-risk ownership note.

Completion criteria:

1. Security and Identity Maturity >= 19/20.

### WP-10 Commissioning Execution Closure (Priority: P0)

Objective: convert all remaining operational placeholders into executed evidence.

Deliverables:

1. signed commissioning artifact,
2. operator validation export,
3. on-call roster and rollback rehearsal reference.

Completion criteria:

1. no placeholder remains in release evidence for launch scope.
