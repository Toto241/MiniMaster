# P1 Legal Draft Inventory

Stand: 2026-04-24

Dieses Inventar uebernimmt aus PR #152 nur die sinnvolle Struktur der internationalen Legal-Erweiterung. Es legt **keine produktiven Rechtstexte** fest. Alle Eintraege sind Arbeitsfassungen und benoetigen fachkundige juristische Pruefung.

## Grundsatz

- P1-Laender: UK, USA, Frankreich, Spanien, Italien.
- Kein Text aus diesem Inventar ist ohne Legal Review produktionsfaehig.
- Alle Country Packs muessen mit App-Strings, Consent-Versionen, Play-Store-Angaben und Backend-Policy-IDs synchronisiert werden.
- Externe Gates bleiben im `RELEASE_EVIDENCE_REGISTER.md` sichtbar.

## P1-Dokumentenbedarf

| Land | Terms / AGB | Privacy Policy | Zentrale Pruefpunkte | Status |
|---|---|---|---|---|
| UK | `AGB_TEMPLATE_EN_UK.md` geplant | `PRIVACY_POLICY_EN_UK.md` geplant | UK GDPR, Data Protection Act 2018, AADC, ICO, internationale Transfers | Draft required |
| USA | `AGB_TEMPLATE_EN_US.md` geplant | `PRIVACY_POLICY_EN_US.md` geplant | COPPA, CCPA/CPRA, VCDPA, CPA, Auto-Renewal, Subscriptions | Draft required |
| Frankreich | `AGB_TEMPLATE_FR.md` geplant | `PRIVACY_POLICY_FR.md` geplant | RGPD, CNIL, Verbraucherrecht, Vertragssprache | Draft required |
| Spanien | `AGB_TEMPLATE_ES.md` geplant | `PRIVACY_POLICY_ES.md` geplant | RGPD, LOPDGDD, AEPD, LSSI | Draft required |
| Italien | `AGB_TEMPLATE_IT.md` geplant | `PRIVACY_POLICY_IT.md` geplant | GDPR, Garante, Codice del Consumo | Draft required |

## Mindestinhalt je Privacy Policy Draft

1. Verantwortlicher / Controller.
2. Kategorien personenbezogener Daten.
3. Daten von Eltern/Erziehungsberechtigten.
4. Daten von Kindgeraeten.
5. Zwecke der Verarbeitung.
6. Rechtsgrundlagen.
7. Supportzugriff und Audit-Protokollierung.
8. Push-Benachrichtigungen.
9. Zahlungsabwicklung ueber Google Play.
10. Internationale Transfers.
11. Speicherfristen und Loeschung.
12. Betroffenenrechte.
13. Beschwerderecht bei Aufsichtsbehoerde.
14. Kontakt.

## Mindestinhalt je Terms/AGB Draft

1. Geltungsbereich.
2. Nutzerkonto / Elternrolle.
3. Geraetekopplung.
4. Kind-App und Berechtigungen.
5. Sperrfunktionen / Aufgabenworkflow.
6. Subscription / Billing / Kuendigung.
7. Verbotene Nutzung.
8. Verfuegbarkeit und Grenzen.
9. Haftung / Gewaehrleistung je Rechtsordnung.
10. Datenschutzverweis.
11. Aenderungen und Re-Consent.
12. Kontakt / Streitbeilegung soweit landesspezifisch erforderlich.

## Integrationsregeln fuer Folge-PRs

- Legal-Drafts immer in separaten PRs von Code-Aenderungen.
- Android-String-Erweiterungen nur zusammen mit Build-/Resource-Check.
- Backend-Policy-Versionen nur zusammen mit Tests fuer Consent-Gate und Re-Consent.
- Keine Laenderfreigabe ohne Country Readiness Packet.
- Kein produktives Label wie `approved`, solange kein Legal Review dokumentiert ist.

## Abgrenzung zu PR #152

Nicht uebernommen werden:

- Firestore-Rules-/Index-Rueckbau.
- Security-/Validation-/Resilience-Rueckbau.
- Abschwaechung der ESLint-Regeln.
- Pauschale Entfernung von Monetarisierungsfunktionen.
- Ungepruefte Legal-Texte als finaler Rechtsstand.
