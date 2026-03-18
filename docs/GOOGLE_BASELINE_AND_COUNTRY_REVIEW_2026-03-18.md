# Google Baseline plus Country Legal Review (Target Markets)

Stand: 2026-03-18

## Ziel

Dieses Dokument operationalisiert den Ansatz:

1. Google-Regeln als Mindestbasis fuer die Store-Zulassung nutzen.
2. Danach pro Zielmarkt eine juristische Country-Review durchfuehren.

Hinweis: Dieses Dokument ist eine technische/organisatorische Vorlage und ersetzt keine anwaltliche Beratung.

## 1) Google-Regeln als Mindestbasis (Store-Zulassung)

Google/Play-Vorgaben sind ein globales Minimum, aber kein Ersatz fuer lokales Recht. Fuer MiniMaster gelten mindestens folgende Baselines:

1. Google Play Developer Program Policies (inkl. Families, User Data, Device/Network Abuse).
2. Data safety Angaben muessen korrekt, vollstaendig und konsistent zu App-Verhalten, Privacy Policy und Store Listing sein.
3. Accessibility API Nutzung nur fuer legitime, klar kommunizierte Kernfunktion; keine verdeckte Ueberwachung.
4. Sensitive Permissions nur wenn zwingend noetig; Disclosure im App-Flow und in Store-Texten.
5. Child-directed/Families Anforderungen einhalten (insbesondere bei Kinderdiensten).
6. Abo- und Preis-Transparenz gemaess Play Billing Vorgaben.

Go/No-Go Baseline Gate vor Country Review:

- Play Policy Self-Check abgeschlossen.
- Data Safety Formular gegen reale Datennutzung verifiziert.
- Store Listing, In-App Disclosure, Privacy Policy konsistent.
- Accessibility und Permission-Begruendung dokumentiert.

## 2) Country-Review je Zielmarkt

### Marktset fuer MiniMaster (priorisiert)

1. EU/EWR (Start mit DE, FR, ES, IT, NL, PL, SE, DK, FI, NO)
2. UK
3. USA
4. Kanada
5. Brasilien
6. Mexiko
7. Indien
8. Indonesien
9. Japan
10. Suedkorea
11. Tuerkei
12. UAE / KSA (MENA Prioritaet)
13. Suedafrika

### Review-Matrix

| Zielmarkt | Google-Baseline vorliegend | Juristische Country-Review Schwerpunkte | Pflichtartefakte | Status |
| --- | --- | --- | --- | --- |
| EU/EWR | Ja, Pflicht | DSGVO Rechtsgrundlagen, Kindereinwilligungsalter je Land, Verbraucherrecht (Preis, Laufzeit, Kuendigung), Datentransfer (SCC/TIA), ePrivacy/TTDSG-nahe Anforderungen | Lokale AGB, lokale Privacy Notice, Consent-Text je Sprache, DSAR-Nachweise | Offen |
| UK | Ja, Pflicht | UK GDPR, DPA 2018, Age Appropriate Design Code, UK-Transfermechanismen | UK Terms/Privacy, UK Consent-Wording, Transfer-Doku | Offen |
| USA | Ja, Pflicht | COPPA (<13), state privacy laws (z. B. CPRA), auto-renewal Regeln je State | US Terms/Privacy, state mapping memo, parental consent flow note | Offen |
| Kanada | Ja, Pflicht | PIPEDA + Provinzrecht, Einwilligung und Zweckbindung | CA Terms/Privacy, DSAR- und Loeschprozess | Offen |
| Brasilien | Ja, Pflicht | LGPD, Transparenz, Datenrechte, regulatorische Anforderungen ANPD | BR-PT Terms/Privacy, Consent- und DSAR-Nachweis | Offen |
| Mexiko | Ja, Pflicht | Datenschutz- und Verbraucherrecht fuer digitale Services | ES-MX Terms/Privacy, Abo-Disclosure Check | Offen |
| Indien | Ja, Pflicht | DPDP Act, Consent-/Notice-Framework, ggf. sektorale Vorgaben | IN Terms/Privacy, Consent-Layer, Datenflussdoku | Offen |
| Indonesien | Ja, Pflicht | PDP Law, lokales Verbraucher-/Datenschutzrecht | ID Terms/Privacy, Re-Consent und DSAR-Ablauf | Offen |
| Japan | Ja, Pflicht | APPI, internationale Uebermittlung, Transparenzpflichten | JA Terms/Privacy, Transfer- und Rights-Doku | Offen |
| Suedkorea | Ja, Pflicht | PIPA, strenge Consent-/Notice-Anforderungen | KO Terms/Privacy, Incident- und Rights-Prozess | Offen |
| Tuerkei | Ja, Pflicht | KVKK, Datentransfer und Informationspflichten | TR Terms/Privacy, Consent-Protokollierung | Offen |
| UAE / KSA | Ja, Pflicht | Lokale Datenschutzgesetze, Vertragssprache (AR/EN), Consumer Law | AR/EN Terms/Privacy, lokale Rechtsfreigabe | Offen |
| Suedafrika | Ja, Pflicht | POPIA, Processing Grounds, Rechte und Security | EN Terms/Privacy, DSAR-Runbook | Offen |

## 3) Standard-Arbeitspaket pro Land

1. Legal Intake: Gesetze, Altersgrenzen, Abo-/Consumerrecht, Datentransferregeln.
2. Dokumente: AGB + Privacy in Landessprache mit lokaler Juristenfreigabe.
3. Produkt: Country/Lokale-spezifische Ausspielung (Version-ID und Effective-Date).
4. Consent: Explizite Zustimmung mit revisionssicherem Audit-Log.
5. Test: DSAR, Loeschung, Re-Consent bei wesentlichen Aenderungen.
6. Go-Live: Juristische Sign-off + Engineering/Support Checkliste abgehakt.

## 4) Store-Baseline und Country-Law zusammendenken

Minimalprinzip:

- Ohne Play-Konformitaet: kein Rollout.
- Mit Play-Konformitaet, aber ohne Country-Review: kein Rollout.
- Rollout nur bei beidem: Play-Minimum + lokale Rechtsfreigabe.

## 5) Verantwortlichkeiten

1. Product/Compliance: Marktpriorisierung, Risk Register, Freigaben.
2. Legal Counsel lokal: Country Review und finale Vertrags-/Privacy-Fassungen.
3. Engineering: Versionierung, Ausspielung, Consent Logging, Re-Consent Enforcement.
4. Support/Operations: DSAR SLA, Incident/Breach Runbook, Nachweisfaehigkeit.

## 6) Re-Review Takt

1. Vor jedem neuen Lander-Rollout.
2. Bei wesentlichen Produkt- oder Datenflussaenderungen.
3. Mindestens jaehrlich pro aktivem Markt.
