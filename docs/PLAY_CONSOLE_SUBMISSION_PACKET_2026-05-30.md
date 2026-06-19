# Play Console Submission Packet (DE Pilot)

**Status:** Repo-ready submission bundle — external Play Console clicks still required  
**Generated:** 2026-05-30  
**Apps:** `com.minimaster.masterapp` (Parent), `com.minimaster.childapp` (Child)

## Submission checklist

| Item | Repo artifact | Console action | Status |
| --- | --- | --- | --- |
| Data Safety form | [PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md](PLAY_CONSOLE_DATA_SAFETY_TEMPLATE.md) | Copy answers into Play Console → App content → Data safety | Ready to submit |
| IARC questionnaire | [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md) Part B | Complete IARC in Play Console | Ready to submit |
| Store listing DE | [STORE_LISTING_AND_IARC_READINESS.md](STORE_LISTING_AND_IARC_READINESS.md) Part A | Paste title/short/full description + assets | Ready to submit |
| Permissions declaration | [PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md](PLAY_PERMISSIONS_DECLARATION_CHECKLIST.md) | Submit Accessibility, Usage Access, Overlay, Device Admin, foreground service special use, and Camera declarations | Ready to submit |
| App access guide | [APP_ACCESS_REVIEWER_GUIDE.md](APP_ACCESS_REVIEWER_GUIDE.md) | Attach reviewer login path in Play Console | Ready to submit |
| Privacy policy URL | [PRIVACY_POLICY_DE.md](PRIVACY_POLICY_DE.md) | `https://toto241.github.io/MiniMaster/privacy/` (interim; spaeter `https://minimaster.app/privacy`) — Setup: [ENABLE_GITHUB_PAGES.md](ENABLE_GITHUB_PAGES.md) | Ready |
| Support email | Admin panel default `privacy@minimaster.app` | Enter in Store listing contact details | Ready |

## Automation helpers

- `npm run playstore:protocol:gate` verifies the repository-side submission artifacts.
- `npm run play:plan` checks release AABs, package IDs and Play Android Publisher credentials.
- `npm run play:plan:gate` fails until release AABs and Play Android Publisher credentials are ready.
- `npm run play:upload:internal` uploads existing Play apps to the internal track as draft releases once Play App Signing and service-account permissions are configured.
- Detailed automation plan: [PLAY_CONSOLE_AUTOMATION_PLAN.md](PLAY_CONSOLE_AUTOMATION_PLAN.md)

## Pre-filled operator values

Use these values consistently across Data Safety and Store listing:

- **Privacy policy URL (interim):** `https://toto241.github.io/MiniMaster/privacy/` — siehe `npm run pages:privacy:setup`
- **Support / privacy email:** `privacy@minimaster.app`
- **Category:** Parenting / Tools
- **Target audience:** Parents with children under 13 (child app on child device)
- **Ads:** No
- **In-app purchases:** Yes (subscription via Google Play Billing)

## Evidence links (repo-side)

- Security evidence: `npm run security:evidence:collect` → `build/security-evidence/latest-report.md`
- Commissioning evidence: `npm run commissioning:evidence:collect` → `build/commissioning-evidence/latest-report.md`
- Release register: [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

## Remaining external steps

1. Upload final screenshots and feature graphic to Play Console.
2. Submit both apps for review after physical commissioning evidence is attached.
3. Record submission timestamps in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md).
