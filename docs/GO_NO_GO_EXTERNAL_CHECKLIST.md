# Go/No-Go — Externe Restpunkte (Checkliste)

**Stand:** 2026-05-30  
**Zweck:** Kompakte Abarbeitungsliste für alles, was **nicht im Repo** geschlossen werden kann. Technische Repo-Arbeit (Session-Security, Auth Phase 2, Evidence-Skripte, Play-Console-Paket) ist erledigt.

## Vor dem Release (P0 — alle müssen Done sein)

| # | Aktion | Owner | Nachweis | Status |
|---|--------|-------|----------|--------|
| 1 | GitHub Actions Billing/Spending-Limit beheben | Repo Owner | Kein Billing-Blocker in CI; Runs starten | ⬜ |
| 2 | Code Scanning aktivieren (Issue #158) | Engineering | Frischer grüner CodeQL-Run + SARIF | ⬜ |
| 3 | Android CI grün | Engineering | Link zu erfolgreichem `android-release` Run | ⬜ |
| 4 | Physisches/Emulator-Commissioning | QA/Operations | `scripts/run-dual-device-commissioning.ps1` + Checkliste | ⬜ |
| 5 | Play Console: Data Safety | Product/Ops | Screenshot / Review-Status | ⬜ |
| 6 | Play Console: IARC Rating | Product/Ops | Freigabe im Dashboard | ⬜ |
| 7 | Play Console: Store Listing DE | Product/Ops | Finales Listing + Assets | ⬜ |
| 8 | Play Console: Permissions Declaration | Compliance | Einreichbestätigung | ⬜ |
| 9 | Play Console: App Access (Reviewer) | Product/Ops | Anleitung hinterlegt | ⬜ |
| 10 | Firebase Key Rotation + Restriktionen | Security | Key alt/neu dokumentiert in Runbook | ⬜ |
| 11 | On-Call/Eskalations-Roster | Operations | Namen, Kontakt, Reachability-Test | ⬜ |
| 12 | Produktions-Deploy | Engineering | Deployment-Referenz in `RELEASE_EVIDENCE_REGISTER.md` | ⬜ |
| 13 | Go/No-Go Unterschriften | Release Manager | `RELEASE_EVIDENCE_REGISTER.md` §4 ausgefüllt | ⬜ |

## Hilfskommandos (Repo)

```bash
npm run security:evidence:collect
npm run commissioning:evidence:collect
npm run playstore:protocol:gate
npm run analyze:fertigungsstand:gate
```

## Referenzen

- Vollständiges Register: [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
- Play Console Paket: [PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md](PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md)
- Externes Ausführungspaket: [RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md](RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md)

## Entscheidungskriterium

**Go** nur wenn P0 #1–#13 Done mit verlinktem Nachweis.  
**Conditional Go** nur wenn dokumentierte Restrisiken vom Security/Compliance Owner akzeptiert sind.
