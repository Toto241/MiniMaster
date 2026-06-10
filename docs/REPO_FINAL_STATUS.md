# MiniMaster — Repository Final Status

**Stand:** 2026-06-10  
**Zweck:** Eindeutige Trennung zwischen abgeschlossener Repo-Arbeit und externen Release-Gates.

## Repo-Ready (abgeschlossen)

| Bereich | Status | Nachweis |
| --- | --- | --- |
| Backend & Tests | ✅ | `npm run build`, `npm run lint`, `npm run test:ci` |
| Firestore Rules | ✅ | `npm run test:rules:structural` |
| Admin Panel Automation | ✅ | QA/KI-Tabs, `data-action`-Delegation, Python-Katalog |
| Admin Panel CSP / SRI | ✅ | 0 Inline-Handler, App-Check-SRI gesetzt |
| Support Automation UI | ✅ | Callable-Evidenz im Support-Tab und Ticket-Modal |
| Dokumentationskonsistenz | ✅ | Admin/Security-Docs ohne veraltete Widersprüche |
| PR152 Guard | ✅ | `npm run guard:pr152` |
| Fertigungsstand-Gate | ✅ | `npm run analyze:fertigungsstand:gate` (`repo_ready=true`) |
| Android CI (Workflow) | ✅ | `CI_REVALIDATION_LATEST.md` |
| Dependency Security | ✅ | `npm audit` clean, Dependabot `TOTAL=0` |

## Release-Ready (extern, dokumentiert)

Diese Punkte können nicht allein im Repository abgeschlossen werden:

| Gate | Owner | Referenz |
| --- | --- | --- |
| GitHub Code Scanning aktivieren | Repo Owner | Issue #158, `GO_NO_GO_EXTERNAL_CHECKLIST.md` #2 |
| Produktions-Deploy | Engineering | `RELEASE_EVIDENCE_REGISTER.md` §3.1 |
| Physisches/Emulator-Commissioning | QA/Operations | `scripts/run-dual-device-commissioning.ps1` |
| Firebase Key Rotation | Security | Runbook + Console |
| Play Console Einreichungen | Product/Ops | `PLAY_CONSOLE_SUBMISSION_PACKET_2026-05-30.md` |
| On-Call-Roster | Operations | `ONCALL_ESCALATION_ROSTER.md` |
| Legacy-Auth Hard Cutover | Engineering + Security | `LEGACY_AUTH_CUTOVER_PLAN.md` Phase 3 |
| Go/No-Go Unterschriften | Release Manager | `RELEASE_EVIDENCE_REGISTER.md` §4 |

## Befehle

```bash
npm run validate:readiness
npm run analyze:fertigungsstand
npm run analyze:fertigungsstand:gate
npm run release:doctor
```

## Entscheidungskriterium

- **Repo final:** `repo_ready=true` in `build/fertigungsstand/latest-summary.json`
- **Release final:** alle externen P0-Punkte in `GO_NO_GO_EXTERNAL_CHECKLIST.md` mit Nachweis erledigt
