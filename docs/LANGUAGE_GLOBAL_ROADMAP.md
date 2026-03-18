# Language Global Roadmap

## Goal

This document defines the global language strategy for MiniMaster Android apps (`masterApp` and `childApp`) and explains rollout priorities.

## Implemented App Locales

The following locales are integrated in both apps:

- `en` (default)
- `de`
- `fr`
- `zh-CN`
- `es`
- `pt-BR`
- `hi`
- `ar`
- `id`
- `ja`
- `ru`
- `tr`
- `it`
- `ko`
- `vi`
- `pl`
- `nl`
- `th`
- `uk`
- `fa`
- `bn`
- `ur`
- `sw`
- `he`
- `ro`
- `cs`
- `sv`
- `no`
- `da`
- `fi`
- `el`
- `hu`

## Priority Waves

### Wave 1 (Core Reach)

- English, German, French, Spanish, Portuguese (Brazil), Hindi, Arabic, Chinese (Simplified)

Rationale:

- High user reach across Americas, Europe, MENA, India, and Greater China.
- Strong relevance for family/education and parental-control scenarios.

### Wave 2 (Expansion)

- Indonesian, Japanese, Russian, Turkish, Italian, Korean, Vietnamese

Rationale:

- Significant Android market share and high regional app adoption.

### Wave 3 (Long Tail)

- Polish, Dutch, Thai, Ukrainian, Persian, Bengali, Urdu, Swahili, Hebrew, Romanian, Czech, Swedish, Norwegian, Danish, Finnish, Greek, Hungarian

Rationale:

- Regional growth and localization depth after Wave 1/2 KPI validation.

## Current Translation Quality State

- Existing production-level translations are maintained for: `de`, `fr`, `zh-CN`.
- Newly added locales are integrated with baseline resource parity using default strings.
- Human translation and in-market review should be prioritized by wave.

## Android Resource Qualifier Mapping

- `id` -> `values-in`
- `he` -> `values-iw`
- `pt-BR` -> `values-pt-rBR`
- `zh-CN` -> `values-zh-rCN`

## Release Recommendations

1. Ship Wave 1 with reviewed translations first.
2. Add telemetry per locale (activation, onboarding completion, retention).
3. Expand to Wave 2 based on KPI thresholds and support capacity.
4. Keep Wave 3 behind business-region prioritization.

## Risk Register

- RTL layout regressions for Arabic/Hebrew.
- Text overflow in long-language labels.
- Inconsistent legal/compliance wording across locales.
- Higher QA matrix size with each added locale.

## QA Gates

1. String-key parity against default resources.
2. RTL smoke tests (`ar`, `he`).
3. First-start language selection smoke tests.
4. Locale persistence after app restart.
5. Regression check for pairing and permission onboarding in non-default locale.
