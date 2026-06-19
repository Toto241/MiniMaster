# Go/No-Go — Externe Restpunkte (Checkliste)

**Stand:** 2026-06-19  
**Zweck:** Kompakte Abarbeitungsliste für alles, was **nicht im Repo** geschlossen werden kann. Android/Play und iOS trennen Repo-Gates von externen Store-/Device-Nachweisen.

## Vor dem Release (P0 — alle müssen Done sein)

| # | Aktion | Owner | Nachweis | Status |
|---|--------|-------|----------|--------|
| 1 | GitHub Actions Billing/Spending-Limit beheben | Repo Owner | Kein Billing-Blocker in CI; Runs starten | ✅ |
| 2 | Code Scanning aktivieren (Issue #158) | Repo Owner | `gh api repos/Toto241/MiniMaster/code-scanning/default-setup` liefert 200 | ⬜ (API noch 403) |
| 3 | Android CI grün | Engineering | [run 27233004667](https://github.com/Toto241/MiniMaster/actions/runs/27233004667) | ✅ |
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
| 14 | Play-Upload-Assistent dry-run | Engineering | `npm run play:plan` schreibt `build/play-console-release/latest-plan.md`; offene Checks dokumentiert | ⬜ |
| 15 | iOS Family Controls entitlement | Product/Ops | Apple Developer Capability/Provisioning-Nachweis fuer `com.minimaster.childapp` | ⬜ |
| 16 | iOS Xcode 26+/TestFlight Build | Engineering | Archive-/Upload-Logs und TestFlight Processing fuer Parent und Child | ⬜ |
| 17 | iOS physisches FamilyControls-E2E | QA/Operations | Pairing, Lock/Unlock, App-Token-Blacklist, Offline-Policy auf echtem iPhone/iPad | ⬜ |
| 18 | App Store Connect iOS Metadata | Product/Ops/Compliance | Privacy Labels, Age Rating, Review Notes, Subscription Products | ⬜ |

## Hilfskommandos (Repo)

```bash
npm run security:evidence:collect
npm run commissioning:evidence:collect
npm run playstore:protocol:gate
npm run analyze:fertigungsstand:gate
npm run plan:android-release-matrix
npm run run:android-release-matrix:smoke
npm run validate:android-release-matrix
npm run evidence:release
npm run play:plan
npm run ios:readiness
npm run ios:readiness:gate
```

## Referenzen

- Vollständiges Register: [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)
- Play Console Paket: [PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md](PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md)
- iOS Paritätsplan: [IOS_ANDROID_PARITY_PLAN_2026-06-19.md](IOS_ANDROID_PARITY_PLAN_2026-06-19.md)
- Externes Ausführungspaket: [RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md](RELEASE_EXTERNAL_EXECUTION_PACKET_2026-03-22.md)

## Entscheidungskriterium

**Go** nur wenn P0 #1–#18 Done mit verlinktem Nachweis.  
**Conditional Go** nur wenn dokumentierte Restrisiken vom Security/Compliance Owner akzeptiert sind.
