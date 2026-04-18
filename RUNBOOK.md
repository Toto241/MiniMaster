# Runbook / Operations Guide

This document describes how to operate MiniMaster in production-like environments.

## 1. Service Ownership & Escalation

### Roles

- **Primary on-call (Engineering):** investigates backend, rules, auth, Android sync and deploy regressions.
- **Secondary on-call (Product/Ops):** coordinates customer impact, release rollback and status communication.
- **Security/Compliance contact:** engaged for data exposure, abuse, consent, DSAR or legal incidents.

### Severity Model

- **SEV-1:** Core user journey broken for a large share of users, security incident, or widespread child enforcement failure.
- **SEV-2:** One critical subsystem degraded (e.g. FCM, billing verification, task proof upload, admin login).
- **SEV-3:** Localized defect, degraded observability, workaround exists.

### First Response Targets

- **SEV-1:** acknowledge within 15 minutes, mitigation started within 30 minutes.
- **SEV-2:** acknowledge within 30 minutes, mitigation started within 2 hours.
- **SEV-3:** triage within business day.

## 2. Production Baseline Checklist

Before enabling traffic, verify:

1. `npm run build`, `npm run lint`, `npm test` are green on the release commit.
2. Firestore rules and indexes are deployed together with functions.
3. Admin bootstrap and role assignment are verified.
4. App Check mode is explicitly set (`monitor` or `enforced`) and documented.
5. Support AI credentials are configured intentionally (Gemini primary, OpenAI fallback only if desired).
6. Release channel, project ID and region are recorded in the operator runtime config.

## 3. Deploy / Rollback

### Standard deploy sequence

```bash
npm install
npm run build
npm run lint
npm test
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

### Safe rollout order

1. Deploy Firestore rules + indexes + functions together.
2. Validate operator login, support dashboard and parent web login.
3. Validate one pairing flow on test devices.
4. Validate one task lifecycle including proof upload and review.

### Rollback

If the current release causes breakage:

1. Pause further operator changes.
2. Roll back Hosting to the last known good release.
3. Redeploy last known good Functions/Firestore bundle from the tagged commit.
4. Re-run smoke checks for login, pairing, child sync and task review.
5. Create an incident timeline with timestamps, affected services and user impact.

## 4. Monitoring & Alerting

### Core indicators to watch

- Cloud Functions error rate and latency spikes.
- Firestore permission-denied spikes.
- FCM send failures / missing token warnings.
- Support ticket volume spikes after deploys.
- App Check verification failures.
- Subscription verification errors.

### Suggested alert thresholds

- **Functions error rate:** >5% for 10 minutes.
- **P95 callable latency:** >3 seconds for 15 minutes.
- **FCM send failures:** >20 failures in 15 minutes.
- **Permission denied spikes:** 3x normal baseline in 15 minutes.
- **App Check failures:** sustained increase after rollout.

### Logging / query playbook

Check Firebase / Cloud Logging for these patterns:

- `App Check verification failed`
- `Task update` + `missing before/after data`
- `No FCM token`
- `permission-denied`
- `setAdminClaim`
- `Subscription`
- `supportTickets`

Recommended query dimensions:

- service / function name
- release timestamp
- `childId`, `masterImei`, `taskId`, `ticketId`
- auth role (`admin`, `support`, `auditor`, `master`)

## 5. Incident Playbooks

### A. Child device does not receive updates / notifications

1. Check whether child document contains a recent `fcmToken`.
2. Inspect trigger logs for update diff generation and FCM errors.
3. Verify App Check and auth failures are not blocking callables.
4. Validate device network reachability and app background restrictions.
5. If only one release is affected, compare recent function deploy and revert if necessary.

### B. Pairing failures

1. Verify `pairingTokens` / `pairingCodes` lifecycle and expiry handling.
2. Confirm project config, Functions region and Hosting target are correct.
3. Check for mismatched release/config between child app, master app and backend.
4. Inspect Firestore permission-denied and callable unauthenticated errors.

### C. Task proof upload / review failures

1. Validate Storage rules deployment and bucket reachability.
2. Confirm task documents transition through `pending` → `pending_approval` → `approved/rejected`.
3. Check parent review UI and child upload logs for failed upload attempts.
4. If review notifications fail, verify FCM token freshness for master and child.

### D. Admin / operator access problems

1. Verify Firebase Auth login works.
2. Confirm custom claim (`role=admin|support|auditor`) exists.
3. Review recent changes to operator config or bootstrap values.
4. If role claims are wrong, use the audited admin path to restore them and capture the change in incident notes.

### E. Billing / entitlement verification failures

1. Validate Google API credentials and package identifiers.
2. Confirm purchase token freshness and expected SKU.
3. Inspect backend logs for verification exceptions and quota errors.
4. If necessary, temporarily freeze entitlement-changing actions until validation is stable again.

### F. Security / abuse / compliance incident

1. Classify as SEV-1 unless clearly low impact.
2. Preserve logs, audit entries and deployment references immediately.
3. Restrict privileged access if account compromise is suspected.
4. Notify security/compliance owner.
5. Determine whether DSAR, breach notification or customer communication duties are triggered.

## 6. Post-Deploy Smoke Checks

After every production deploy, complete this sequence:

1. Operator login succeeds.
2. Full Validation in operator dashboard shows no critical blockers.
3. Parent web panel login succeeds.
4. Pairing on test devices succeeds.
5. Child receives sync after a rule change.
6. Task proof upload and review work end-to-end.
7. Support ticket creation and operator processing work.

For final release approval, execute and archive the commissioning checklist in [docs/COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md](docs/COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md).
Apply the full release acceptance orchestration in [docs/COMPLETE_ACCEPTANCE_PROCESS_2026-03-19.md](docs/COMPLETE_ACCEPTANCE_PROCESS_2026-03-19.md).
Track progress to >90% finalization using [docs/FINALIZATION_STRATEGY_OVER_90_2026-03-19.md](docs/FINALIZATION_STRATEGY_OVER_90_2026-03-19.md).
Use the release decision template for every candidate: [docs/RELEASE_DECISION_TEMPLATE.md](docs/RELEASE_DECISION_TEMPLATE.md).
Consolidate evidence in the release evidence register: [docs/RELEASE_EVIDENCE_REGISTER.md](docs/RELEASE_EVIDENCE_REGISTER.md).
Review CI gate expectations in the CI runbook: [docs/CI_RUNBOOK.md](docs/CI_RUNBOOK.md).
Validate security baseline before release: [docs/SECURITY_BASELINE_CHECKLIST.md](docs/SECURITY_BASELINE_CHECKLIST.md).

### 6.1 Release Cutover Checklist (Before Go-Live)

Execute this list after technical smoke checks and before final Go/No-Go:

1. Firebase key rotation/restrictions completed and logged in runbook notes.
2. Play Console Data Safety form submitted and reviewed.
3. IARC rating completed.
4. Store listing finalized (texts, screenshots, contact).
5. Permissions declaration submitted (Accessibility / Usage / Overlay).
6. App access guide attached for reviewer access.
7. CodeQL result linked in release evidence (`0 high/critical`).
8. Android CI build evidence linked (workflow run + APK artifacts).
9. Physical commissioning checklist executed and archived.
10. On-call + escalation roster assigned and visible to operators.

Source of truth for status tracking: [docs/RELEASE_EVIDENCE_REGISTER.md](docs/RELEASE_EVIDENCE_REGISTER.md) section "Before Go-Live: Operative Restpunkte".

## 7. Evidence & Audit Trail

For every SEV-1 / SEV-2 incident record:

- start time, detection time, acknowledgement time
- impacted components
- affected user segment / geography
- mitigation chosen
- rollback or hotfix commit / deploy reference
- follow-up action items with owner and due date

## 8. Required Secrets & Access

Required secrets / credentials should be maintained outside the repository:

- Firebase project access
- Functions / Hosting deployment credentials
- Google Play / service account credentials
- `GEMINI_API_KEY`
- optional `OPENAI_API_KEY`

For CI/CD-specific repository secrets and their exact names, use the deploy guide: [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md).

Never commit service account JSON files, `google-services.json`, API keys or copied console tokens.

## Recovery-Token Rotation (ADMIN_RECOVERY_TOKEN) — Quartals-SOP

Der `ADMIN_RECOVERY_TOKEN` schützt Notfall-Operationen (z. B. `resetOperatorAccounts`).
Rotation MUSS mindestens alle 90 Tage erfolgen; Verzögerungen werden vom
`getOperatorSetupStatus`-Endpunkt als `recoveryToken.status = "overdue"` markiert
und im Admin-Panel-Tab "⚙️ Einrichtung" rot angezeigt.

### Ablauf (alle ~10 min)

1. **Pre-Check (Operator-Workstation, PowerShell)**

   ```powershell
   .\scripts\operator-setup.ps1 -Action status -ProjectId <PROJECT> `
     -IdToken (firebase auth:print-id-token) `
     -OutFile pre-rotation.json
   ```

   Erwartet: `recoveryToken.tokenCount >= 1`, `status` ∈ {ok, near-due, overdue}.

2. **Rotation ausführen**

   ```powershell
   .\scripts\operator-setup.ps1 -Action rotate-token -ProjectId <PROJECT>
   ```

   Skript erzeugt 32 Bytes Entropie (URL-safe Base64), schreibt sie in den
   Secret Manager (`ADMIN_RECOVERY_TOKEN`) und setzt `ADMIN_RECOVERY_TOKEN_ROTATED_AT`
   auf das aktuelle Datum (ISO-yyyy-MM-dd).

3. **Overlap-Phase (max. 24 h)**

   Der bestehende Token bleibt parallel via Komma-getrennter Liste in
   `ADMIN_RECOVERY_TOKEN` gültig, bis alle Operatoren das neue Token verteilt
   haben. Auth-Helper akzeptiert jedes Element (`getAdminRecoveryTokens()`).

4. **Functions Re-Deploy** (damit neue Secret-Version greift)

   ```powershell
   firebase --project <PROJECT> deploy --only functions:resetOperatorAccounts
   ```

5. **Smoke-Test**

   ```powershell
   .\scripts\operator-setup.ps1 -Action status -ProjectId <PROJECT> `
     -IdToken (firebase auth:print-id-token)
   ```

   Erwartet: `recoveryToken.status = "ok"`, `tokenAgeDays = 0`.

6. **Old-Token-Removal** (24–72 h später)

   `ADMIN_RECOVERY_TOKEN` Secret-Version mit nur dem neuen Token überschreiben:

   ```powershell
   .\scripts\operator-setup.ps1 -Action set-secret -SecretName ADMIN_RECOVERY_TOKEN -ProjectId <PROJECT>
   # interaktiv: nur den NEUEN Token-Wert eingeben
   ```

7. **Audit-Eintrag**

   Im Admin-Panel-Tab "⚙️ Einrichtung" Checklist-Punkt
   `recovery_token_rotated_q<N>_<YYYY>` togglen oder via:

   ```powershell
   .\scripts\operator-setup.ps1 -Action mark `
     -ItemId recovery_token_rotation -Done $true `
     -Note "Q2/2026 - rotiert von <Operator>" `
     -ProjectId <PROJECT> -IdToken (firebase auth:print-id-token)
   ```

### Notfall-Rotation (Token kompromittiert)

- Schritte 2 + 4 + 6 SOFORT hintereinander (keine Overlap-Phase).
- Audit-Log-Review: `audit_logs` mit `action = "admin.reset_operator_accounts"`
  in den letzten 7 Tagen prüfen (Admin-Panel → Logs → Filter Action).
- Incident-Record nach `IMPLEMENTATION_CHECKLIST.md → Sicherheits-Risiken`.

### Verantwortlich

- **Primär:** Lead-Operator (siehe On-Call-Roster)
- **Backup:** Sicherheitsbeauftragter
- **Eskalation bei Failure:** Geschäftsführung + alle Co-Operatoren via Out-of-Band-Kanal
