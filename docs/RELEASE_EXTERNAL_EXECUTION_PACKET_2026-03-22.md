# Release External Execution Packet (2026-03-22)

**Status:** Operator packet for all remaining non-repo blockers.

**Companion docs:** [EXTERNAL_P0_EXECUTION_CHECKLIST_2026-04-16.md](EXTERNAL_P0_EXECUTION_CHECKLIST_2026-04-16.md), [RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md](RELEASE_P0_P1_EXECUTION_PLAN_2026-04-06.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md), [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md)

## 1. Purpose

Dieses Paket fasst alle externen Aktionen zusammen, die nicht direkt im Repository abgeschlossen werden koennen.
Ziel: P0-Blocker nacheinander schliessen und Nachweise sofort in das Evidence Register eintragen.

## 2. Hard Blockers (Current)

1. GitHub Actions bleibt extern blockiert, weil Billing/Spending-Limit weitere CodeQL- und Android-CI-Nachweise vor Jobstart stoppt.
2. Play Console Submission-Paket (Data Safety, IARC, Permissions, App Access) offen.
3. Firebase Key Rotation nur in Console durchfuehrbar.
4. Physische Commissioning-Checks und On-call Sign-off fehlen.

## 3. One-Pass Execution Order

1. Repo Owner: GitHub Actions Billing/Spending-Limit beheben und Repository-/Account-Settings pruefen.
2. Engineering: CI-Reruns triggern und erfolgreiche Runs verlinken.
3. Security: Firebase Key Rotation durchfuehren und dokumentieren.
4. Product/Ops + Compliance: Play Console Data Safety, IARC, Permissions, App Access einreichen.
5. QA/Operations: Physisches Commissioning und On-call Roster finalisieren.
6. Release Manager: Re-Decision von No-Go auf Conditional Go/Go pruefen.

## 4. Action Blocks

### 4.1 GitHub Actions Billing / Repository Settings (Repo Owner)

- Aktion: GitHub -> Billing / Plans -> fehlgeschlagene Zahlung oder Spending-Limit fuer GitHub Actions beheben.
- Zusatzcheck: Sicherstellen, dass der Workflow nicht mehr vor Jobstart an Billing-/Spending-Limit scheitert.
- Done-Nachweis:
  - Screenshot der korrigierten Billing-/Plan-Einstellung
  - Anschliessend melden CodeQL und Android CI keinen Billing-Blocker mehr in [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md)
- Ziel-Doku:
  - [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md)
  - [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

### 4.2 CI Revalidation (Engineering)

- Schritt 1: VS Code Task `CI: Revalidate Release Gates (+ Rerun Failed)`
- Schritt 2: VS Code Task `CI: Revalidate Release Gates`
- Done-Nachweis:
  - aktueller erfolgreicher CodeQL-Run verlinkt
  - aktueller erfolgreicher Android-CI-Run verlinkt
- Ziel-Doku:
  - [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md)
  - [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
  - [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md)

### 4.3 Firebase Key Rotation (Security)

- Referenz: [FIREBASE_KEY_ROTATION_RUNBOOK.md](FIREBASE_KEY_ROTATION_RUNBOOK.md)
- Done-Nachweis:
  - alte Key-ID, neue Key-ID, Revocation-Zeitpunkt
  - Screenshot/Export aus Firebase Console
- Ziel-Doku:
  - [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

### 4.4 Play Console Package (Product/Ops + Compliance)

- Data Safety + IARC + Store Listing:
  - Referenz: [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md)
  - Referenz: [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md)
- Permissions Declaration + App Access:
  - Referenz: [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md)
  - Referenz: [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md)
- Done-Nachweis:
  - je ein Screenshot mit "Submitted" / freigegebenem Status
  - App Access URL in Play Console hinterlegt
- Ziel-Doku:
  - [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
  - [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md)

### 4.5 Physical Commissioning + On-Call (QA/Operations)

- Referenz Commissioning:
  - [PHYSICAL_COMMISSIONING_CHECKLIST.md](PHYSICAL_COMMISSIONING_CHECKLIST.md)
- Referenz On-call:
  - [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md)
- Done-Nachweis:
  - ausfuellte Checklisten + Sign-off
  - benannte Primaer-/Sekundaerkontakte mit Erreichbarkeitstest
- Ziel-Doku:
  - [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
  - [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md)

## 5. Completion Criteria

Alle folgenden Bedingungen muessen true sein:

1. CodeQL und Android CI jeweils mit aktuellem `completed/success` Run.
2. Firebase Key Rotation abgeschlossen und nachgewiesen.
3. Data Safety, IARC, Permissions Declaration und App Access eingereicht.
4. Physical Commissioning + On-call Sign-off abgeschlossen.

Dann darf die Re-Decision stattfinden.

## 6. Final Re-Decision Template

- Candidate: RC-2026-03-21
- Datum/Uhrzeit Re-Decision: __________________
- Entscheidung: ⬜ No-Go / ⬜ Conditional Go / ⬜ Go
- Rest-Risiken: __________________________________
- Engineering Owner Sign-off: _____________________
- Product/Ops Owner Sign-off: _____________________
- Security/Compliance Owner Sign-off: ______________
- Release Manager Sign-off: ________________________
