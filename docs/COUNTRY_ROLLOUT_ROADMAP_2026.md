# Country Rollout Roadmap — Legal & Localization

**Version:** 2026.04.22-1  
**Status:** Technical planning document for multi-country legal and localization rollout.

## Zielmärkte (Priorisiert)

| Priorität | Land/Lokale | Sprache | Rechtlicher Rahmen | Begründung |
|-----------|-------------|---------|-------------------|------------|
| P0 | 🇩🇪 Deutschland | de-DE | DSGVO + BGB | Heimatmarkt, vollständig |
| P0 | 🇦🇹 Österreich | de-AT | DSGVO + ABGB | Gleiche Sprache wie DE |
| P0 | 🇨🇭 Schweiz | de-CH | nDSG + OR | DE-Version akzeptabel für DE-CH |
| P1 | 🇬🇧 UK | en-GB | UK GDPR + AADC | Großer Markt, englisch |
| P1 | 🇺🇸 USA | en-US | COPPA + CCPA/CPRA + VCDPA | Größter Markt, COPPA kritisch |
| P1 | 🇫🇷 Frankreich | fr-FR | DSGVO + CNIL | Größter EU-Markt nach DE |
| P1 | 🇪🇸 Spanien | es-ES | DSGVO + LOPDGDD | Großer EU-Markt |
| P1 | 🇮🇹 Italien | it-IT | DSGVO + CdP | Großer EU-Markt |
| P2 | 🇧🇷 Brasilien | pt-BR | LGPD | Größter LATAM-Markt |
| P2 | 🇨🇦 Kanada | en-CA / fr-CA | PIPEDA + provinziell | Anglophone Basis |
| P2 | 🇳🇱 Niederlande | nl-NL | DSGVO + AP | Wichtiger EU-Markt |
| P2 | 🇵🇱 Polen | pl-PL | DSGVO + UODO | Wachsender EU-Markt |
| P3 | 🇲🇽 Mexiko | es-MX | LFPDPPP | Spanisch vorhanden |
| P3 | 🇯🇵 Japan | ja-JP | APPI | APAC-Pionier |
| P3 | 🇰🇷 Südkorea | ko-KR | PIPA | APAC |
| P3 | 🇮🇳 Indien | en-IN | DPDP Act | Englisch vorhanden |

## Dokumenten-Status pro Land

### P0 — DACH (Vollständig)

| Dokument | DE | AT | CH |
|----------|----|----|----|
| AGB | ✅ `AGB_TEMPLATE_DE.md` | ✅ (DE-Version) | ✅ (DE-Version) |
| Privacy Policy | ✅ `PRIVACY_POLICY_DE.md` | ✅ (DE-Version) | ✅ (DE-Version, nDSG kompatibel) |
| Android Strings | ✅ `values-de` | ✅ `values-de` | ✅ `values-de` |
| Play Store Listing | ⬜ Pending | ⬜ Pending | ⬜ Pending |

### P1 — Phase 1 Expansion (Ziel: Q2 2026)

| Dokument | UK | US | FR | ES | IT |
|----------|----|----|----|----|----|
| AGB | ⬜ `AGB_TEMPLATE_EN_UK.md` | ⬜ `AGB_TEMPLATE_EN_US.md` | ⬜ `AGB_TEMPLATE_FR.md` | ⬜ `AGB_TEMPLATE_ES.md` | ⬜ `AGB_TEMPLATE_IT.md` |
| Privacy Policy | ⬜ `PRIVACY_POLICY_EN_UK.md` | ⬜ `PRIVACY_POLICY_EN_US.md` | ⬜ `PRIVACY_POLICY_FR.md` | ⬜ `PRIVACY_POLICY_ES.md` | ⬜ `PRIVACY_POLICY_IT.md` |
| Android Strings | ⬜ `values-en-rGB` | ✅ `values` (default) | ⬜ `values-fr` | ⬜ `values-es` | ⬜ `values-it` |
| Play Store Listing | ⬜ Pending | ⬜ Pending | ⬜ Pending | ⬜ Pending | ⬜ Pending |

### P2 — Phase 2 Expansion (Ziel: Q3 2026)

| Dokument | BR | CA | NL | PL |
|----------|----|----|----|----|
| AGB | ⬜ `AGB_TEMPLATE_PT_BR.md` | ⬜ `AGB_TEMPLATE_EN_CA.md` | ⬜ `AGB_TEMPLATE_NL.md` | ⬜ `AGB_TEMPLATE_PL.md` |
| Privacy Policy | ⬜ `PRIVACY_POLICY_PT_BR.md` | ⬜ `PRIVACY_POLICY_EN_CA.md` | ⬜ `PRIVACY_POLICY_NL.md` | ⬜ `PRIVACY_POLICY_PL.md` |
| Android Strings | ⬜ `values-pt-rBR` | ⬜ `values-en-rCA` | ⬜ `values-nl` | ⬜ `values-pl` |

## Länder-spezifische rechtliche Besonderheiten

### UK 🇬🇧
- **UK GDPR** + Data Protection Act 2018
- **AADC** (Age Appropriate Design Code) — Kinderdienste
- UK-spezifische Datenschutzhinweise
- Keine EU-DSGVO-Verweise, sondern UK-ICO-Verweise

### USA 🇺🇸
- **COPPA** — Kinder unter 13: verifizierbare elterliche Einwilligung
- **CCPA/CPRA** (Kalifornien), **VCDPA** (Virginia), **CPA** (Colorado)
- Bundesstaatliche Auto-Renewal-Gesetze
- Kein EU-Verbraucherschutz — stärkere Disclaimer-Möglichkeiten

### Frankreich 🇫🇷
- **CNIL**-spezifische Anforderungen
- Cookie-Banner-Pflicht (strenger als DSGVO-Baseline)
- Französische Vertragssprache bei Verbraucherverträgen empfohlen

### Spanien 🇪🇸
- **LOPDGDD** (Ley Orgánica de Protección de Datos)
- **AEPD** (Agencia Española de Protección de Datos)
- Spanische Vertragssprache bei Verbraucherverträgen

### Italien 🇮🇹
- **Garante per la protezione dei dati personali**
- Italienische Vertragssprache bei Verbraucherverträgen

## Android-App-Lokalisierungs-Matrix

| Sprache | Locale | values-Ordner | Status |
|---------|--------|---------------|--------|
| Englisch (Default) | en | `values` | ✅ Vollständig |
| Deutsch | de-DE | `values-de` | ✅ Vollständig |
| Französisch | fr-FR | `values-fr` | ⬜ Zu erstellen |
| Spanisch | es-ES | `values-es` | ⬜ Zu erstellen |
| Italienisch | it-IT | `values-it` | ⬜ Zu erstellen |
| Portugiesisch (BR) | pt-BR | `values-pt-rBR` | ⬜ Zu erstellen |
| Niederländisch | nl-NL | `values-nl` | ⬜ Zu erstellen |
| Polnisch | pl-PL | `values-pl` | ⬜ Zu erstellen |
| Japanisch | ja-JP | `values-ja` | ⬜ Zu erstellen |
| Koreanisch | ko-KR | `values-ko` | ⬜ Zu erstellen |

## Nächste Schritte

1. **P1 AGB-Templates erstellen** (UK, US, FR, ES, IT)
2. **P1 Android-Strings erstellen** (FR, ES, IT)
3. **Juristische Prüfung** pro Land einholen
4. **Play Store Listings** lokalisieren
5. **Backend legalPolicies** mit Versionen befüllen
6. **Country Readiness Packets** für P1-Länder vervollständigen
