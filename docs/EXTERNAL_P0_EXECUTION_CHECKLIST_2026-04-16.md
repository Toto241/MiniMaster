# External P0 Execution Checklist (2026-04-16)

**Status:** Operator-facing execution checklist for all remaining external P0 release blockers.

Purpose:

1. Execute the remaining non-repo release blockers in the right order.
2. Capture the exact evidence required by the release documents.
3. Avoid drift between GitHub, Firebase Console, Play Console, QA, and sign-off artifacts.

## 1. Execution Order

Run the remaining P0 items in this exact order:

1. Fix GitHub Actions billing / spending limit.
2. Re-run CodeQL and Android CI.
3. Update release evidence with fresh CI links.
4. Execute final deploy with real runtime secrets.
5. Rotate Firebase key and capture revocation evidence.
6. Submit Play Console package.
7. Execute physical commissioning.
8. Complete on-call roster and reachability test.
9. Refresh release decision.

## 2. P0-1 GitHub Billing / Spending Limit

Owner: Repo Owner

Steps:

1. Open GitHub account or organization settings.
2. Open Billing & plans.
3. Resolve failed payment or raise spending limit for GitHub Actions.
4. Confirm Actions jobs are no longer blocked for the repository.

Done evidence:

1. Screenshot or exported confirmation from Billing & plans.
2. Fresh [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) without billing blocker.

Update after done:

1. [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
2. [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md)

## 3. P0-2 Re-run CodeQL and Android CI

Owner: Engineering

Steps:

1. Run VS Code task `CI: Revalidate Release Gates (+ Rerun Failed)`.
2. Run VS Code task `CI: Revalidate Release Gates`.
3. Confirm both latest runs are `completed / success`.

Done evidence:

1. Fresh success links for CodeQL and Android CI in [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md).

Stop rule:

1. If either workflow still fails, do not continue to release decision.

## 4. P0-3 Update Release Evidence

Owner: Engineering

Steps:

1. Copy fresh CodeQL run link into [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).
2. Copy fresh Android CI run link into [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).
3. Set technical gate status from blocked/in-progress to pass only if both runs are green.

Done evidence:

1. Updated [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) section 3.1.

## 5. P0-4 Final Deploy

Owner: Engineering

Prerequisites:

1. Production runtime secrets available.
2. Correct Firebase project selected: `minimaster-28fbd`.

Steps:

1. Prepare production secrets or dotenv source outside the repo.
2. Run production deploy.
3. Execute post-deploy smoke validation.

Suggested validation:

1. Admin login works.
2. Eltern-Panel works.
3. Functions reachable.
4. Storage health OK.

Done evidence:

1. Deploy command timestamp.
2. Deploy output snapshot.
3. Deployment reference in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).

## 6. P0-5 Firebase Key Rotation

Owner: Security Owner

Source runbook:

1. [FIREBASE_KEY_ROTATION_RUNBOOK.md](FIREBASE_KEY_ROTATION_RUNBOOK.md)

Steps:

1. Generate new service account key in project `minimaster-28fbd`.
2. Verify new key against staging or controlled deploy path.
3. Update GitHub secret.
4. Revoke old key only after successful validation.
5. Record old/new key IDs and revocation timestamp.

Done evidence:

1. Screenshot/export from Firebase or GCP Console.
2. Old key revoked timestamp.
3. Evidence entry in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).

## 7. P0-6 Play Console Package

Owners: Product/Ops + Compliance

Sub-packets:

1. Data Safety: use [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md)
2. Store Listing and IARC: use [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md)
3. Permissions Declaration: use [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md)
4. App Access: use [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md)

Done evidence:

1. Play Console screenshots for all submitted sections.
2. Reviewer guide linked in App Access.
3. IARC completion proof.
4. Final store listing asset package reference.

Stop rule:

1. Do not mark this item done if any of Data Safety, IARC, Permissions, or App Access is still draft-only.

## 8. P0-7 Physical Commissioning

Owner: QA/Operations

Source checklist:

1. [PHYSICAL_COMMISSIONING_CHECKLIST.md](PHYSICAL_COMMISSIONING_CHECKLIST.md)

Steps:

1. Use two devices or equivalent validated setup.
2. Execute pairing, task flow, enforcement, and approval flow.
3. Capture screenshots, timestamps, and Firestore proof.

Done evidence:

1. Completed checklist.
2. Sign-off attached.
3. Evidence linked in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).

## 9. P0-8 On-call and Reachability

Owner: Operations Lead

Source template:

1. [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md)

Steps:

1. Fill all named roles.
2. Set pager, bridge, and escalation channels.
3. Run reachability test.
4. Capture timestamp and proof.

Done evidence:

1. Completed roster.
2. Reachability evidence.
3. Sign-off in roster and release register.

## 10. P0-9 Re-Decision

Owner: Release Manager

Steps:

1. Review all completed P0 artifacts.
2. Update [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).
3. Update [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md).
4. Switch from No-Go only if all P0 items are evidenced.

Done evidence:

1. Updated release decision.
2. Recorded date, scope, and sign-off.

## 11. Quick Exit Criteria

Conditional Go or Go is only allowed if all points below are true:

1. No GitHub billing blocker remains.
2. CodeQL is green.
3. Android CI is green.
4. Final deploy evidence exists.
5. Firebase key rotation evidence exists.
6. Play Console package is submitted.
7. Physical commissioning is signed.
8. On-call roster is signed.
9. Release decision is refreshed.
