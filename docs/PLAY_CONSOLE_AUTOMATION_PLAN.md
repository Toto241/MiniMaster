# Play Console Automation Plan

**Status:** Repo assistant added; final Play Console content and first app creation remain external.

## What is automated

| Area | Command | Result |
| --- | --- | --- |
| Repo criteria | `npm run playstore:protocol:gate` | Validates Data Safety, permissions, listing/IARC, reviewer guide and evidence docs. |
| Local upload readiness | `npm run play:plan` | Writes `build/play-console-release/latest-plan.json` and `.md` with AAB, package and credential checks. |
| Upload readiness gate | `npm run play:plan:gate` | Fails until AABs and Play Android Publisher credentials are present. |
| Track upload for existing Play apps | `npm run play:upload:internal` | Uploads both release AABs to the internal track as draft releases when credentials and AABs are present. |
| Release gates | `npm run release:doctor` | Aggregates preflight, Play protocol, Fertigungsstand, Admin QA, Dependabot, Code Scanning and GitHub run state. |

## Required setup before upload automation can run

1. Create both apps in Play Console:
   - Parent: `com.minimaster.masterapp`
   - Child: `com.minimaster.childapp`
2. Enroll both apps in Play App Signing.
3. Create a Google Play Android Publisher service account and grant Play Console release permissions for both apps.
4. Provide credentials through one of:
   - `PLAY_ANDROID_PUBLISHER_CREDENTIALS=path/to/service-account.json`
   - `GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json`
   - `PLAY_SERVICE_ACCOUNT_JSON=<raw JSON>`
   - `PLAY_SERVICE_ACCOUNT_JSON_BASE64=<base64 JSON>`
5. Build signed release bundles:
   - `./gradlew :masterApp:bundleRelease :childApp:bundleRelease`

## Product and policy decisions that must be planned before implementation

| Decision | Why it blocks go-live | Proposed owner |
| --- | --- | --- |
| First rollout scope | Country availability, language/store assets and legal text sign-off are market-specific. | Product/Ops + Legal |
| Child-app positioning | The Child app uses Accessibility, Usage Access, Overlay, Device Admin and foreground service special use; Play review needs a precise child-safety and parental-control explanation. | Product/Ops + Compliance |
| Reviewer access model | Reviewers need a repeatable parent/child flow without real family data. | Product/Ops |
| Legacy secretKey cutover | Release can continue only with an accepted migration/fallback policy or full cutover evidence. | Security/Backend |
| On-call roster | Production launch needs named responders and reachability evidence. | Operations |

## Non-automatable Play Console steps

- App creation for new Play packages.
- Data Safety final submission.
- IARC final questionnaire/certificate.
- Sensitive permissions declarations.
- App Access reviewer instructions.
- Store listing assets, screenshots and final publishing approval.

Use `docs/RELEASE_EVIDENCE_REGISTER.md` as the final place for screenshots, timestamps and sign-off links.
