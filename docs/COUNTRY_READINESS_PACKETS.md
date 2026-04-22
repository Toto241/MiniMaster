# Country Go/No-Go Readiness Packets

**Status:** Structured go/no-go assessment for initial rollout countries.

**Companion docs:** [LEGAL_COUNTRY_COMPLIANCE_MATRIX.md](LEGAL_COUNTRY_COMPLIANCE_MATRIX.md), [LEGAL_ROLLOUT_CHECKLIST.md](LEGAL_ROLLOUT_CHECKLIST.md), [LEGAL_VERSIONING_RECONSENT_SPEC.md](LEGAL_VERSIONING_RECONSENT_SPEC.md), [RELEASE_EVIDENCE_REGISTER.md](RELEASE_EVIDENCE_REGISTER.md)

## 1. Purpose

Provide a per-country readiness assessment that covers legal, technical, and operational prerequisites for production launch.

## 2. Packet Template

Each country packet must contain the following sections with pass/fail status.

---

## Country: Germany (DE)

### Legal Readiness

| Item | Status | Evidence | Notes |
|------|--------|----------|-------|
| AGB (Terms) in German | ✅ Pass | `legalPolicies/terms_DE_de-DE_*` | Template in [AGB_TEMPLATE_DE.md](AGB_TEMPLATE_DE.md) |
| Datenschutzerklärung in German | ✅ Pass | `legalPolicies/privacy_DE_de-DE_*` | DSGVO-compliant |
| Age-appropriate consent flow (under 16) | ✅ Pass | Parental role enforced by design | Parent registers, child has no direct account |
| DSAR process (Art. 15-22 DSGVO) | ✅ Pass | `exportUserData` + `deleteUserAccount` functions | Tested in Admin Panel Compliance tab |
| Data Processing Agreement (DPA) | ⬜ Pending | Firebase/Google Cloud DPA | Standard Google DPA applies |
| Transfer Impact Assessment (non-EU) | ⬜ Pending | SCCs for Firebase (Google US) | Firebase EU data residency option available |
| ePrivacy/TTDSG compliance | ✅ Pass | No tracking cookies, telemetry is functional only | |
| Auto-renewal transparency | ✅ Pass | Subscription terms in app, cancel via Play Store | |

### Technical Readiness

| Item | Status | Evidence |
|------|--------|----------|
| Localized UI (German) | ✅ Pass | MasterApp + Admin Panel in German |
| Legal policy versioning backend | ✅ Pass | `legalPolicies` + `masterLegalConsents` collections |
| Re-consent enforcement | ✅ Pass | `needsLegalReconsent` Cloud Function |
| DSAR export functional | ✅ Pass | `exportUserData` tested |
| Account deletion functional | ✅ Pass | `deleteUserAccount` tested |
| Audit logging active | ✅ Pass | `audit_logs` collection with TTL |

### Store Readiness

| Item | Status | Evidence |
|------|--------|----------|
| Play Store listing (DE) | ⬜ Pending | Draft listing required |
| Data Safety section | ⬜ Pending | Must reflect actual data collection |
| In-app disclosure text | ✅ Pass | First-start flow with consent |
| Age rating | ⬜ Pending | IARC rating required |

### Go/No-Go Decision

- **Legal:** Conditional Go (DPA and TIA pending formal sign-off)
- **Technical:** Go
- **Store:** No-Go (listing artifacts pending)
- **Overall:** Conditional Go — blocked on store readiness artifacts

---

## Country: Austria (AT)

### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| AGB in German | ✅ Pass | Same as DE version applies |
| Datenschutzerklärung in German | ✅ Pass | Same as DE version, AT-specific DPA if needed |
| Age consent (14+) | ✅ Pass | AT threshold is 14, parental design covers this |
| DSAR process | ✅ Pass | Same as DE |

### Technical Readiness

Same as DE — no AT-specific technical requirements.

### Go/No-Go Decision

- **Overall:** Conditional Go — same blockers as DE

---

## Country: Switzerland (CH)

### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| AGB in German | ✅ Pass | DE version acceptable for DE-CH |
| Datenschutzerklärung | ✅ Pass | nDSG (new Swiss DPA) compatible |
| Age consent | ✅ Pass | No specific digital age consent law yet |
| Data transfer (CH-adequacy) | ✅ Pass | EU adequacy decision covers CH |

### Go/No-Go Decision

- **Overall:** Conditional Go — same store blockers as DE

---

## 3. Phase 1 Expansion — In Progress

### Country: United Kingdom (UK)

#### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| Terms in UK English | ✅ Pass | Template in [AGB_TEMPLATE_EN_UK.md](AGB_TEMPLATE_EN_UK.md) |
| Privacy Policy in UK English | ✅ Pass | Template in [PRIVACY_POLICY_EN_UK.md](PRIVACY_POLICY_EN_UK.md) |
| UK GDPR + DPA 2018 compliance | ✅ Pass | ICO references, UK SCCs, TRA |
| AADC (children's design code) | ✅ Pass | High privacy defaults, no profiling |
| Android Strings (en) | ✅ Pass | `values` (default) |

#### Go/No-Go Decision
- **Overall:** Conditional Go — store listing artifacts pending

---

### Country: United States (US)

#### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| Terms in US English | ✅ Pass | COPPA, CCPA/CPRA, state law clauses in [AGB_TEMPLATE_EN_US.md](AGB_TEMPLATE_EN_US.md) |
| Privacy Policy in US English | ✅ Pass | COPPA, CCPA/CPRA, VCDPA, CPA in [PRIVACY_POLICY_EN_US.md](PRIVACY_POLICY_EN_US.md) |
| COPPA compliance | ✅ Pass | Verifiable parental consent, no direct child collection |
| Android Strings (en) | ✅ Pass | `values` (default) |

#### Go/No-Go Decision
- **Overall:** Conditional Go — state-specific legal review recommended, store listing pending

---

### Country: France (FR)

#### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| CGU en français | ✅ Pass | CNIL, DSGVO, Code de la consommation in [AGB_TEMPLATE_FR.md](AGB_TEMPLATE_FR.md) |
| Politique de confidentialité en français | ✅ Pass | RGPD + CNIL in [PRIVACY_POLICY_FR.md](PRIVACY_POLICY_FR.md) |
| Android Strings (fr) | ✅ Pass | `values-fr` — legal consent gate + usage rules added |

#### Go/No-Go Decision
- **Overall:** Conditional Go — store listing (FR) pending, CNIL cookie banner review

---

### Country: Spain (ES)

#### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| CGU en español | ✅ Pass | RGPD + LOPDGDD + LSSI in [AGB_TEMPLATE_ES.md](AGB_TEMPLATE_ES.md) |
| Política de privacidad en español | ✅ Pass | RGPD + LOPDGDD in [PRIVACY_POLICY_ES.md](PRIVACY_POLICY_ES.md) |
| Android Strings (es) | ✅ Pass | `values-es` — legal consent gate + usage rules added |

#### Go/No-Go Decision
- **Overall:** Conditional Go — store listing (ES) pending

---

### Country: Italy (IT)

#### Legal Readiness

| Item | Status | Notes |
|------|--------|-------|
| ToS in italiano | ✅ Pass | GDPR + Codice Privacy + Codice del Consumo in [AGB_TEMPLATE_IT.md](AGB_TEMPLATE_IT.md) |
| Informativa privacy in italiano | ✅ Pass | GDPR + Garante in [PRIVACY_POLICY_IT.md](PRIVACY_POLICY_IT.md) |
| Android Strings (it) | ✅ Pass | `values-it` — fully translated, legal + usage rules added |

#### Go/No-Go Decision
- **Overall:** Conditional Go — store listing (IT) pending

---

## 4. Countries Not Yet Assessed

The following countries require full legal assessment before rollout:

- Brazil (BR) — LGPD assessment needed
- Canada (CA) — PIPEDA + provincial law assessment needed
- Netherlands (NL) — AP-specific requirements assessment needed
- Poland (PL) — UODO-specific requirements assessment needed
- Mexico (MX) — LFPDPPP assessment needed
- Japan (JP) — APPI assessment needed
- South Korea (KR) — PIPA assessment needed
- India (IN) — DPDP Act assessment needed

## 4. Process

1. Complete this packet for each target country.
2. Legal owner signs off on legal readiness.
3. Product owner validates technical readiness.
4. Store artifacts prepared and reviewed.
5. Final go/no-go recorded with date and signatories.

## 5. Compliance Evidence Bundle

For each approved country, the following must be archived:

1. Signed country go/no-go packet (this document).
2. Legal policy documents with version IDs.
3. DSAR test evidence (export + deletion).
4. Audit log sample for the test period.
5. Re-consent flow test evidence.
6. Store listing screenshots with data safety section.
