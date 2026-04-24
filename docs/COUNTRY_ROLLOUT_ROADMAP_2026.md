# Country Rollout Roadmap — Legal & Localization

**Version:** 2026.04.22-1  
**Status:** Technical planning document for multi-country legal and localization rollout.  
**Source:** Selectively adopted from PR #152 as planning material only. This is not legal approval for production rollout.

## Zielmärkte (priorisiert)

| Priorität | Land/Lokale | Sprache | Rechtlicher Rahmen | Begründung |
|-----------|-------------|---------|-------------------|------------|
| P0 | 🇩🇪 Deutschland | de-DE | DSGVO + BGB | Heimatmarkt, vollständig |
| P0 | 🇦🇹 Österreich | de-AT | DSGVO + ABGB | Gleiche Sprache wie DE |
| P0 | 🇨🇭 Schweiz | de-CH | nDSG + OR | DE-Version als Ausgangspunkt für DE-CH |
| P1 | 🇬🇧 UK | en-GB | UK GDPR + AADC | Großer Markt, englisch |
| P1 | 🇺🇸 USA | en-US | COPPA + CCPA/CPRA + VCDPA | Größter Markt, COPPA kritisch |
| P1 | 🇫🇷 Frankreich | fr-FR | DSGVO + CNIL | Großer EU-Markt |
| P1 | 🇪🇸 Spanien | es-ES | DSGVO + LOPDGDD | Großer EU-Markt |
| P1 | 🇮🇹 Italien | it-IT | DSGVO + Garante / Codice del Consumo | Großer EU-Markt |
| P2 | 🇧🇷 Brasilien | pt-BR | LGPD | Größter LATAM-Markt |
| P2 | 🇨🇦 Kanada | en-CA / fr-CA | PIPEDA + provinziell | Anglophone Basis |
| P2 | 🇳🇱 Niederlande | nl-NL | DSGVO + AP | Wichtiger EU-Markt |
| P2 | 🇵🇱 Polen | pl-PL | DSGVO + UODO | Wachsender EU-Markt |
| P3 | 🇲🇽 Mexiko | es-MX | LFPDPPP | Spanisch vorhanden |
| P3 | 🇯🇵 Japan | ja-JP | APPI | APAC-Pionier |
| P3 | 🇰🇷 Südkorea | ko-KR | PIPA | APAC |
| P3 | 🇮🇳 Indien | en-IN | DPDP Act | Englisch vorhanden |

## Dokumenten-Status pro Land

### P0 — DACH

| Dokument | DE | AT | CH |
|----------|----|----|----|
| AGB | `AGB_TEMPLATE_DE.md` | DE-Version als Ausgangspunkt | DE-Version als Ausgangspunkt |
| Privacy Policy | `PRIVACY_POLICY_DE.md` | DE-Version als Ausgangspunkt | DE-Version mit nDSG-Review |
| Android Strings | `values-de` | `values-de` | `values-de` |
| Play Store Listing | Pending | Pending | Pending |

### P1 — Phase 1 Expansion

| Dokument | UK | US | FR | ES | IT |
|----------|----|----|----|----|----|
| AGB/Terms | Draft required | Draft required | Draft required | Draft required | Draft required |
| Privacy Policy | Draft required | Draft required | Draft required | Draft required | Draft required |
| Android Strings | `values-en-rGB` review | default `values` review | `values-fr` | `values-es` | `values-it` |
| Play Store Listing | Pending | Pending | Pending | Pending | Pending |
| Legal review | Required | Required | Required | Required | Required |

## Länder-spezifische Prüfhinweise

### UK 🇬🇧

- UK GDPR + Data Protection Act 2018.
- Age Appropriate Design Code für kindbezogene Dienste prüfen.
- ICO-Bezug statt EU-Aufsichtsbehörde.
- Internationale Transfers separat dokumentieren.

### USA 🇺🇸

- COPPA für Kinder unter 13 und verifizierbare elterliche Einwilligung prüfen.
- Staatliche Privacy Laws wie CCPA/CPRA, VCDPA und CPA berücksichtigen.
- Auto-Renewal- und Subscription-Hinweise gesondert prüfen.

### Frankreich 🇫🇷

- CNIL-Anforderungen und französische Verbraucherinformationen prüfen.
- Französische Vertragssprache und lokalisierte Datenschutzhinweise einplanen.

### Spanien 🇪🇸

- LOPDGDD/AEPD-Bezug prüfen.
- Lokalisierte Vertrags- und Datenschutzhinweise einplanen.

### Italien 🇮🇹

- Garante-Bezug und italienisches Verbraucherrecht prüfen.
- Lokalisierte Vertrags- und Datenschutzhinweise einplanen.

## Android-App-Lokalisierungs-Matrix

| Sprache | Locale | values-Ordner | Status |
|---------|--------|---------------|--------|
| Englisch | en | `values` | vorhanden, Review erforderlich |
| Deutsch | de-DE | `values-de` | vorhanden |
| Französisch | fr-FR | `values-fr` | zu prüfen/ergänzen |
| Spanisch | es-ES | `values-es` | zu prüfen/ergänzen |
| Italienisch | it-IT | `values-it` | zu prüfen/ergänzen |
| Portugiesisch (BR) | pt-BR | `values-pt-rBR` | geplant |
| Niederländisch | nl-NL | `values-nl` | geplant |
| Polnisch | pl-PL | `values-pl` | geplant |
| Japanisch | ja-JP | `values-ja` | geplant |
| Koreanisch | ko-KR | `values-ko` | geplant |

## Integrationsregeln

- Diese Roadmap ist Planung, kein Go-Live-Nachweis.
- Country Launch darf erst erfolgen, wenn Legal Review, Play Console Daten, App-Strings, Consent-Versionen und Release Evidence vollständig sind.
- Legal-Texte aus PR #152 dürfen nur als Draft übernommen werden.
- Produktive AGB/Privacy Policies müssen durch fachkundige Prüfung freigegeben werden.

## Nächste Schritte

1. P1-Draft-Templates als rechtlich ungeprüfte Arbeitsfassungen ablegen.
2. Android FR/ES/IT-Ressourcen gegen Build und Consent-Flow prüfen.
3. Backend `legalPolicies` mit versionierten Policy-IDs und Ländern verknüpfen.
4. Country Readiness Packets je Land erweitern.
5. Play Store Listing und App Access je Land erfassen.
6. Release Evidence Register um länderspezifische Freigabe erweitern.
