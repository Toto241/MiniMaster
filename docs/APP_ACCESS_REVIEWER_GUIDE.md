# App Access Reviewer Guide (Google Play)

Status: in progress - draft exists, final Play Console submission pending.
Owner: Product/Ops

## 0. Release Gate Mapping

Release blocker reference: App access guide attached

Owner and target:
- Owner: Product/Ops
- Due: 2026-03-23 14:00 (local)
- Evidence target: Play Console screenshot + reviewer guide link

Completion rule:
- This document is "done" only when section 11 is fully completed and linked in the release evidence register.

## 1. Purpose

This document is intended for Google Play reviewers to validate app behavior that depends on privileged Android permissions and parent-managed flows.

Apps:
- Parent app: com.minimaster.masterapp
- Child app: com.google.pairing

## 2. Test Credentials

Use dedicated reviewer accounts only.

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Parent reviewer account | TODO | TODO | Pre-created in Firebase Auth |
| Child test profile | TODO | TODO | Paired to parent account |

Security notes:
- Rotate credentials after review.
- Do not reuse production operator credentials.

## 3. Required Devices

- 1 Android device for parent app (Android 10+)
- 1 Android device for child app (Android 10+)
- Stable internet connection

Optional:
- USB cable + adb for debug validation (not required for core app access review)

## 4. Setup Steps (Reviewer)

1. Install parent app build provided in Play track.
2. Install child app build provided in Play track.
3. Login to parent app using provided reviewer credentials.
4. Open pairing flow in parent app and generate pairing code.
5. On child app, enter pairing code and complete pairing.
6. Grant requested permissions on child app when prompted.

Expected outcome:
- Child appears in parent dashboard.
- Parent can create task and push rule updates.

## 5. Permissions Justification

### 5.1 Device Administrator (child app)

Why needed:
- Enforce remote lock/unlock requested by parent.
- Prevent circumvention of active safety rules.

Where used:
- Child app lock flow and anti-tamper checks.

### 5.2 Accessibility Service (child app)

Why needed:
- Enforce app blocking rules selected by parent.
- Detect foreground blocked apps and show blocking overlay.

Where used:
- Child app enforcement pipeline.

### 5.3 Camera (optional)

Why needed:
- Optional photo proof for task completion.

Where used:
- Child task submission when parent requires photo.

### 5.4 Location (optional)

Why needed:
- Optional location-based rules configured by parent.

Where used:
- Child rule evaluation only if location rule is enabled.

## 6. Minimal Reviewer Test Scenario

1. Parent creates one child pairing session.
2. Parent creates one task (photo proof optional).
3. Parent enables one app-block rule.
4. Child opens blocked app.
5. Parent triggers lock and unlock.

Expected outcome:
- Blocked app cannot be opened while rule is active.
- Lock/unlock is reflected on child device.
- Task appears and can be completed according to configuration.

## 7. Known Constraints

- Child app is not standalone and requires parent pairing.
- Enforcement behavior requires granted Device Admin + Accessibility permissions.
- Optional features (camera, location) are inactive unless parent enables them.

## 8. Contact for Review Team

| Function | Contact | Availability |
| --- | --- | --- |
| Product/Ops | TODO | Werktags 09:00-18:00 CET, danach Pager |
| Engineering support | TODO | Werktags 09:00-18:00 CET, danach Pager |
| Escalation (Incident) | TODO | 24/7 via Incident Bridge |

### 8.1 Credential Rotation Schedule

1. Nach abgeschlossener Play-Review: Reviewer-Konten in Firebase Auth deaktivieren.
2. Reviewer-Passwort-Reset erzwingen fuer alle `minimaster-qa-*`-Accounts.
3. Bestaetigung in Section 10 Evidence Log eintragen.
4. Spaetestens 48h nach Reviewabschluss durchfuehren.

### 8.2 Contact Fill-In Guide (Product/Ops)

Fuer jede TODO-Zelle:
- Name + Nachname + Rolle
- E-Mail-Adresse (intern)
- Mobilnummer fuer Eskalation
- Die Zeile erst als ausgefuellt markieren wenn der Kontakt per Test-Ping bestaetigt hat.
| Engineering support | TODO | TODO |
| Escalation | TODO | TODO |

## 9. Submission Checklist

- [ ] Reviewer credentials added
- [ ] Pairing code flow validated on review builds
- [ ] Permission prompts verified against policy text
- [ ] This guide linked in Play Console "App access"
- [ ] Credential rotation plan scheduled after review

## 10. Evidence Capture (for Release Evidence Register)

| Evidence item | Value |
| --- | --- |
| Play Console app access URL | TODO |
| Screenshot path (submission page) | TODO |
| Screenshot path (review credentials page) | TODO |
| Reviewer guide link entered in console | TODO |
| Submitted by | TODO |
| Submission timestamp (local) | TODO |

Notes:
- Save screenshots before and after pressing submit.
- Add this evidence in docs/RELEASE_EVIDENCE_REGISTER.md under "Before Go-Live: Operative Restpunkte".

## 11. Finalization Sign-off

| Role | Name | Date | Signature |
| --- | --- | --- | --- |
| Product/Ops Owner | TODO | TODO | TODO |
| Compliance Owner | TODO | TODO | TODO |
| Engineering witness | TODO | TODO | TODO |

Final status:
- [ ] Submitted in Play Console
- [ ] Evidence captured and stored
- [ ] Release Evidence Register updated
