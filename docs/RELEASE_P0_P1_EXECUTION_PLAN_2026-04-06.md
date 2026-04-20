# Release P0/P1 Execution Plan (2026-04-06)

**Status:** Current execution list after repo-side fixes were completed on 2026-04-06.

**Companion docs:** [EXTERNAL_P0_EXECUTION_CHECKLIST_2026-04-16.md](EXTERNAL_P0_EXECUTION_CHECKLIST_2026-04-16.md), [RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md](RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md), [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md)

## 1. Purpose

Dieses Dokument ersetzt keine fachlichen Nachweise, sondern priorisiert die verbleibenden Arbeiten in eine harte Ausfuehrungsreihenfolge.
Der Stand ist:

- Repo-seitige Blocker sind geschlossen.
- Lokale Validierung ist grün.
- Verbleibende Luecken liegen in externer CI-Evidenz, Betriebsfreigabe, Store-Freigabe und finaler Release-Entscheidung.

## 2. Current State Snapshot

### Repo-side completed

- GitHub Actions Workflows auf aktuelle Action-Majors angehoben.
- Veraltetes Node-24-Forcing entfernt.
- Reviewer-/On-call-Dokumente operationalisiert.
- Markdown-/Editor-Probleme geschlossen.
- Lokale Problems/Errors sind aktuell leer.

### Still open

- GitHub-Actions-Billing/Spending-Limit beheben; aktuelle Revalidation blockiert CodeQL und Android CI vor Jobstart.
- Frischer CodeQL-Nachweis nach Billing-Fix.
- Frischer Android-CI-Nachweis nach Billing-Fix.
- Finaler Deploy-Nachweis.
- Firebase-Key-Rotation in der Console.
- Play Console Submission-Paket.
- Physische Commissioning-Checks.
- Verbindliches On-call-/Sign-off-Paket.

## 3. P0 Hard Blockers

Diese Punkte muessen vor jeder Freigabeentscheidung mindestens auf Conditional Go geschlossen sein.

| P0 | Aufgabe | Owner | Done-Nachweis | Abhaengigkeit |
| --- | --- | --- | --- | --- |
| P0-1 | GitHub-Actions-Billing/Spending-Limit beheben | Repo Owner | Revalidation ohne Billing-Blocker in [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) | GitHub Account/Org Zugriff |
| P0-2 | CodeQL und Android CI nach Billing-Fix neu ausfuehren | Engineering | Aktuelle Runs in `completed/success` und in [CI_REVALIDATION_LATEST.md](CI_REVALIDATION_LATEST.md) dokumentiert | P0-1 |
| P0-3 | Release-Evidence mit aktuellen CI-Run-Links aktualisieren | Engineering | [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) zeigt aktuelle gruene Run-Links | P0-2 |
| P0-4 | Finalen Deploy-Nachweis erzeugen | Engineering | Deploy-Referenz in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) eingetragen | P0-2 |
| P0-5 | Firebase-Key-Rotation und Restriktionen abschliessen | Security Owner | Key-ID alt/neu, Revocation-Zeitpunkt, Console-Nachweis im Evidence Register | Firebase Console Zugriff |
| P0-6 | Play Console Paket einreichen: Data Safety, IARC, Permissions, App Access | Product/Ops + Compliance | Screenshots/URLs und Status im Evidence Register | Play Console Zugriff |
| P0-7 | Physische Commissioning-Checks auf Geraet/Emulator abschliessen | QA/Operations | Ausgefuellte Checkliste mit Sign-off; aktuell blockiert, bis fuer den geplanten Single-Emulator-Lauf ein lokales AVD plus avdmanager/sdkmanager verfuegbar ist oder alternativ eine reale Testumgebung/macOS-iOS-Nachweis bereitsteht | Reale Testumgebung |
| P0-8 | On-call Roster final benennen und Reachability-Test dokumentieren | Operations Lead | Vollstaendige Namen/Kontakte + Reachability-Evidence | Operative Owner verfuegbar |
| P0-9 | Re-Decision auf Conditional Go oder Go dokumentieren | Release Manager | Aktualisierte [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md) | P0-1 bis P0-8 |

## 4. P1 Required Before Broad Rollout

Diese Punkte blockieren nicht den naechsten Nachweiszyklus, sollten aber vor einem breiteren Rollout nicht offen bleiben.

| P1 | Aufgabe | Owner | Done-Nachweis |
| --- | --- | --- | --- |
| P1-1 | AI-Konfigurationsnachweis fuer produktive Provider dokumentieren | Engineering + Product/Ops | Evidence-Register oder Betriebsdoku mit aktivem Provider-/Fallback-Status |
| P1-2 | DE Store-Listing Asset-Paket final archivieren | Product/Ops | Finales Asset-Paket und Referenz im Release-Artefakt |
| P1-3 | Residual-Risk-Notizen und Rollout-Scope finalisieren | Release Manager + Security | Ausgefuellte Decision-Sektion mit Scope und Restrisiken |

## 5. Execution Order

1. P0-1 bis P0-4 als technischer Nachweisblock.
2. P0-5 und P0-6 als Console-/Store-Block.
3. P0-7 und P0-8 als Betriebsblock.
4. P0-9 als Re-Decision.
5. Danach P1-1 bis P1-3 fuer Rollout-Haertung.

## 6. Stop Rules

- Wenn Billing/Spending-Limit, CodeQL oder Android CI nicht grün werden, bleibt der Status No-Go.
- Wenn Key-Rotation, Play Console Paket, Commissioning oder On-call ungeprueft bleiben, bleibt der Status No-Go.
- Conditional Go ist erst zulaessig, wenn alle Gates bestanden sind, hoechstens ein P1 offen bleibt und dafuer eine dokumentierte Risk Acceptance mit Due Date vorliegt.

## 7. Completion Target

Dieses Dokument ist abgearbeitet, wenn:

1. alle P0-Zeilen geschlossen sind,
2. die Nachweise in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) eingetragen sind,
3. die Re-Decision in [RELEASE_DECISION_2026-03-21_RC-2026-03-21.md](RELEASE_DECISION_2026-03-21_RC-2026-03-21.md) aktualisiert wurde.
