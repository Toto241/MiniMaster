# On-call and Escalation Roster

Status: in progress - template exists, contact assignment pending.
Owner: Operations Lead

## 0. Release Gate Mapping

Release blocker reference: On-call roster assigned

Owner and target:
- Owner: Operations Lead
- Due: 2026-03-23 16:30 (local)
- Evidence target: named roster + reachable contacts + sign-off

Completion rule:
- This document is "done" only when all role rows are fully filled, paging channels are set, and section 10 is signed.

## 1. Coverage Window

Primary region: DE pilot
Coverage mode: 24/7 during launch window, then business-hours + pager fallback.

Launch window:
- Start: TODO
- End: TODO

## 2. Roles and Contacts

| Role | Primary | Secondary | Contact Channel | Response SLO |
| --- | --- | --- | --- | --- |
| Incident Commander | TODO | TODO | Phone + Chat | 15 min |
| Backend On-call | TODO | TODO | Pager + Chat | 15 min |
| Android On-call | TODO | TODO | Pager + Chat | 15 min |
| Security On-call | TODO | TODO | Phone + Chat | 30 min |
| Product/Ops On-call | TODO | TODO | Phone + Chat | 30 min |

Reachability check:
- [ ] All primary contacts answered test ping
- [ ] All secondary contacts answered test ping
- [ ] Backup escalation path verified

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

- RUNBOOK.md
- docs/FIREBASE_KEY_ROTATION_RUNBOOK.md
- docs/PHYSICAL_COMMISSIONING_CHECKLIST.md
- docs/APP_ACCESS_REVIEWER_GUIDE.md

## 5. Paging and Communications

Primary channels:
- Pager: TODO
- Incident chat room: TODO
- Executive update channel: TODO

Fallback:
- Phone tree (if pager unavailable): TODO

Release bridge:
- Bridge URL: TODO
- Bridge owner: TODO
- Incident note document: TODO

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

## 8. Sign-off

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Operations Lead | TODO | TODO | TODO |
| Engineering Owner | TODO | TODO | TODO |
| Security Owner | TODO | TODO | TODO |

## 9. Evidence Capture (for Release Evidence Register)

| Evidence item | Value |
| --- | --- |
| Final roster location | docs/ONCALL_ESCALATION_ROSTER.md |
| Reachability test timestamp | TODO |
| Pager test result screenshot/log | TODO |
| Bridge test screenshot/log | TODO |
| Updated by | TODO |

## 10. Go-Live Readiness Check

- [ ] Coverage window finalized
- [ ] All role owners named
- [ ] Escalation matrix validated in dry run
- [ ] Mandatory runbooks confirmed reachable
- [ ] Evidence register updated with completion state
