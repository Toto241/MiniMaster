# On-call and Escalation Roster

**Status:** In progress; template exists, contact assignment pending.
Owner: Operations Lead

## 0. Release Gate Mapping

Release blocker reference: On-call roster assigned

Owner and target:

- Owner: Operations Lead
- Due: 2026-03-23 16:30 (local)
- Evidence target: named roster + reachable contacts + sign-off

Completion rule:

- This document is "done" only when all role rows are fully filled, paging channels are set, and section 10 is signed.

## 0.1 Current Status Snapshot

- Template and escalation logic exist.
- External inputs are still missing for named owners, paging channels, bridge URL, and reachability proof.
- This file should be completed together with [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) and [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md).

## 1. Coverage Window

Primary region: DE pilot
Coverage mode: 24/7 during launch window, then business-hours + pager fallback.

Launch window:

- Start: EXTERNAL_INPUT_REQUIRED
- End: EXTERNAL_INPUT_REQUIRED

## 2. Roles and Contacts

| Role | Primary | Secondary | Contact Channel | Response SLO |
| --- | --- | --- | --- | --- |
| Incident Commander | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | Phone + Chat | 15 min |
| Backend On-call | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | Pager + Chat | 15 min |
| Android On-call | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | Pager + Chat | 15 min |
| Security On-call | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | Phone + Chat | 30 min |
| Product/Ops On-call | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | Phone + Chat | 30 min |

Reachability check:

- [ ] All primary contacts answered test ping
- [ ] All secondary contacts answered test ping
- [ ] Backup escalation path verified

## 2.1 External Inputs Required Before Go-Live

| Input | Source owner | Required for |
| --- | --- | --- |
| Named primary/secondary contacts | Operations Lead | Section 2 |
| Pager or alerting channel | Operations Lead | Section 5 |
| Incident chat room and exec channel | Operations Lead + Product/Ops | Section 5 |
| Release bridge URL and owner | Operations Lead | Section 5 |
| Reachability test evidence | Operations Lead | Section 9 |
| Sign-off names and dates | Operations Lead, Engineering, Security | Section 8 |

## 3. Escalation Matrix

### Severity P0 (service outage, security incident, data risk)

1. Trigger Incident Commander immediately.
2. Page Backend + Android on-call.
3. Inform Security on-call if auth, secrets, or policy risk is involved.
4. Status update cadence: every 30 minutes until mitigated.

### Severity P1 (major degradation, no data loss)

1. Notify responsible engineering on-call.
2. Escalate to Incident Commander if unresolved after 30 minutes.
3. Status update cadence: every 60 minutes.

### Severity P2/P3 (minor)

1. Create ticket and assign owner.
2. Review in next business-hours triage.

## 4. Mandatory Runbooks

- [RUNBOOK.md](../RUNBOOK.md)
- [FIREBASE_KEY_ROTATION_RUNBOOK.md](FIREBASE_KEY_ROTATION_RUNBOOK.md)
- [PHYSICAL_COMMISSIONING_CHECKLIST.md](PHYSICAL_COMMISSIONING_CHECKLIST.md)
- [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md)

## 5. Paging and Communications

Primary channels:

- Pager: EXTERNAL_INPUT_REQUIRED
- Incident chat room: EXTERNAL_INPUT_REQUIRED
- Executive update channel: EXTERNAL_INPUT_REQUIRED

Fallback:

- Phone tree (if pager unavailable): EXTERNAL_INPUT_REQUIRED

Release bridge:

- Bridge URL: EXTERNAL_INPUT_REQUIRED
- Bridge owner: EXTERNAL_INPUT_REQUIRED
- Incident note document: EXTERNAL_INPUT_REQUIRED

## 6. Release-Day Command Cadence

T-60 min:

- Confirm all on-call members are reachable.
- Confirm rollback owner is assigned.

T-0:

- Start release bridge.
- Freeze unrelated changes.

T+30 / T+60 / T+120:

- Report health checks, crash trends, and user-impact summary.

## 7. Handover Notes

Every handover must include:

- Active incidents and current severity
- Open release blockers
- Last known-good deployment reference
- Pending actions with owner and ETA

## 7.1 Minimum Completion Package For This Roster

Before this file can be considered done, collect all of the following:

1. Named primary and secondary contacts for every role.
2. One tested paging path and one tested bridge path.
3. Reachability timestamp recorded in section 9.
4. Signed confirmation from Operations, Engineering, and Security.
5. Matching status update in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).

## 8. Sign-off

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Operations Lead | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED |
| Engineering Owner | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED |
| Security Owner | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED | EXTERNAL_INPUT_REQUIRED |

## 9. Evidence Capture (for Release Evidence Register)

| Evidence item | Value |
| --- | --- |
| Final roster location | [ONCALL_ESCALATION_ROSTER.md](ONCALL_ESCALATION_ROSTER.md) |
| Reachability test timestamp | EXTERNAL_INPUT_REQUIRED |
| Pager test result screenshot/log | EXTERNAL_INPUT_REQUIRED |
| Bridge test screenshot/log | EXTERNAL_INPUT_REQUIRED |
| Updated by | EXTERNAL_INPUT_REQUIRED |

## 10. Go-Live Readiness Check

- [ ] Coverage window finalized
- [ ] All role owners named
- [ ] Escalation matrix validated in dry run
- [ ] Mandatory runbooks confirmed reachable
- [ ] Evidence register updated with completion state

## 11. Assignment Protocol (Operations Lead — Fill-In Guide)

Schritt-fuer-Schritt, um alle Felder mit `EXTERNAL_INPUT_REQUIRED` zu schliessen:

1. **Incident Commander**: Teamlead oder erfahrene Ingenieur-Kontaktperson benennen, Mobilnummer + Chat-Handle eintragen.
2. **Backend On-call**: Firebase/Functions-verantwortlichen Entwickler eintragen; Pager-ID aus internem Alerting-Tool kopieren.
3. **Android On-call**: Android-Lead fuer Master- und Child-App eintragen.
4. **Security On-call**: Security Owner oder Stellvertreter mit direkter Rufnummer.
5. **Product/Ops On-call**: Product Manager mit Availability-Fenster (typisch Buerozeiten + Pager-Fallback).
6. **Coverage window**: Start = geplanter Deploy-Zeitpunkt; End = T+72h (Pilot-Beobachtungsphase).
7. **Paging channel**: Slack-Kanal `#minimaster-oncall` oder PagerDuty-Service-ID eintragen.
8. **Bridge URL**: Google Meet / Teams-Kanal fuer Incident Bridge anlegen, URL hier eintragen.
9. **Reachability test**: Test-Ping an alle benannten Kontakte senden; Antwort-Zeitstempel in Section 9 eintragen.
10. **Sign-off** in Section 8 ausfuellen, sobald alle Kontakte bestaetigt sind.

> Ziel: Abschluss bis 2026-03-23 16:30 — danach Section 9 + Evidence Register aktualisieren.
