# Legal Review Tracking

**Status:** Active tracking for P1 market legal drafts  
**Last updated:** 2026-04-24  
**Companion docs:** [LEGAL_DRAFT_INVENTORY_P1.md](LEGAL_DRAFT_INVENTORY_P1.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

## Scope

This document tracks the legal review status for all MiniMaster legal templates required for P1 country rollout (UK, USA, France, Spain, Italy). No template in this list may be marked `production-ready` without documented legal review.

## Review Status Overview

| Country | Language | Terms/AGB | Privacy Policy | Reviewer | Review Date | Status | Blocker |
|---------|----------|-----------|----------------|----------|-------------|--------|---------|
| UK | EN | `AGB_TEMPLATE_EN_UK.md` | `PRIVACY_POLICY_EN_UK.md` | — | — | ⬜ Unreviewed | No reviewer assigned |
| USA | EN | `AGB_TEMPLATE_EN_US.md` | `PRIVACY_POLICY_EN_US.md` | — | — | ⬜ Unreviewed | No reviewer assigned |
| France | FR | `AGB_TEMPLATE_FR.md` | `PRIVACY_POLICY_FR.md` | — | — | ⬜ Unreviewed | No reviewer assigned |
| Spain | ES | `AGB_TEMPLATE_ES.md` | `PRIVACY_POLICY_ES.md` | — | — | ⬜ Unreviewed | No reviewer assigned |
| Italy | IT | `AGB_TEMPLATE_IT.md` | `PRIVACY_POLICY_IT.md` | — | — | ⬜ Unreviewed | No reviewer assigned |
| Germany | DE | `AGB_TEMPLATE_DE.md` | `PRIVACY_POLICY_DE.md` | — | — | ⬜ Unreviewed | Baseline market; assumed reviewed externally |

## Review Criteria

Before any template can advance from `Draft` to `Reviewed`:

1. **Jurisdiction check:** Local counsel confirms applicability to target market.
2. **Completeness check:** All 14 privacy policy and 12 terms sections from [LEGAL_DRAFT_INVENTORY_P1.md](LEGAL_DRAFT_INVENTORY_P1.md) are present.
3. **Consistency check:** App strings, consent versions, Play Store declarations and backend policy IDs are synchronized.
4. **Translation check:** Native speaker or certified translator verifies accuracy (for non-EN markets).
5. **Compliance check:** Country-specific requirements (COPPA, CCPA, UK GDPR/AADC, RGPD/CNIL, etc.) are addressed.

## Review Workflow

```
Draft → In Review → Reviewed → Production-Ready
```

- **Draft:** Template exists, no review started.
- **In Review:** Reviewer assigned, review in progress.
- **Reviewed:** Reviewer signed off, comments resolved.
- **Production-Ready:** Product/Ops and Compliance Owner confirmed deployment.

## Blocking Issues

| ID | Description | Impact | Owner | Target Resolution |
|----|-------------|--------|-------|-------------------|
| LEGAL-001 | No legal counsel assigned for any P1 market | All P1 templates blocked at Draft | Product/Ops | Offen |
| LEGAL-002 | App strings for FR/ES/IT child app exist but are not legally reviewed | Consent flow may contain unverified language | Engineering + Product | Offen |
| LEGAL-003 | Play Console Data Safety, IARC, Permissions declarations not submitted | Store submission blocked | Product/Ops | Offen |

## Integration with Release Gates

- **Compliance Gate:** Requires at least baseline (DE) review evidence. P1 expansion requires per-country review evidence.
- **Play Store Submission Gate:** Requires Data Safety, IARC, and Permissions declarations aligned with reviewed privacy policies.
- **Backend Consent Gate:** Requires `TermsVersion`, `PrivacyVersion`, and `ConsentTimestamp` logic tested with reviewed text versions.

## Next Actions

1. Assign legal counsel or external legal review service for P1 markets.
2. Schedule review sprint for UK and USA templates (shared English base, fastest path).
3. Coordinate FR/ES/IT reviews with native-speaking legal advisors.
4. Once any template reaches `Reviewed`, update backend consent-version constants and run regression tests.
5. Link final review sign-off in [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md) §3.4.
