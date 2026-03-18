# Legal Versioning, Country Rollout and Re-Consent Spec

Stand: 2026-03-18

## Ziel

Technische Spezifikation fuer:

1. Versionierte AGB/Privacy-Dokumente.
2. Country- und Locale-spezifische Ausspielung.
3. Erzwungenes Re-Consent bei wesentlichen Aenderungen.

## 1) Datenmodell (Backend, Firestore)

Wichtig: Bestehende Flat-Collection-Strategie beibehalten (kein families-Pfad).

### Neue Collection: legalPolicies

Dokument-ID Vorschlag:

- `terms_<country>_<locale>_<version>`
- `privacy_<country>_<locale>_<version>`

Felder:

1. `policyType`: `terms` oder `privacy`
2. `country`: ISO-3166-1 alpha-2 (z. B. `DE`, `US`, `BR`)
3. `locale`: BCP-47 (z. B. `de-DE`, `en-US`, `pt-BR`)
4. `version`: String (z. B. `2026.03.18-1`)
5. `effectiveAt`: Timestamp
6. `isMajorChange`: boolean
7. `contentUrl`: URL zur finalen Fassung
8. `checksum`: Hash zur Integritaetspruefung
9. `createdAt`, `updatedAt`
10. `status`: `draft` | `approved` | `active` | `retired`

### Neue Collection: masterLegalConsents

Dokument-ID Vorschlag: `<masterImei>_<country>_<locale>`

Felder:

1. `masterImei`
2. `country`
3. `locale`
4. `acceptedTermsVersion`
5. `acceptedPrivacyVersion`
6. `termsAcceptedAt`
7. `privacyAcceptedAt`
8. `consentSource`: `master_app` | `web_control` | `support_flow`
9. `appVersion`
10. `ipRegion` (optional, falls vorhanden)
11. `requiresReconsent`: boolean
12. `updatedAt`

## 2) Runtime-Regeln

1. Beim Login/Start wird die aktive Policy-Version fuer `country+locale` geladen.
2. Wenn `acceptedTermsVersion` oder `acceptedPrivacyVersion` fehlt oder kleiner als aktiv:
   - Zugriff auf Kernfunktionen blockieren.
   - Re-Consent-Screen erzwingen.
3. Bei `isMajorChange=true` immer explizites Re-Consent.
4. Bei minor Updates kann Anzeige ohne Blockade erfolgen (produktpolitische Entscheidung).

## 3) Ausspielung pro Land/Lokale

Aufloesungsreihenfolge:

1. Exaktes Match: `country+locale`
2. Fallback: `country+language`
3. Fallback: globale Standardfassung (z. B. `US/en-US`) nur wenn rechtlich freigegeben

Beispiele:

1. Nutzer `country=BR`, `locale=pt-BR` -> BR/PT-BR Dokumente
2. Nutzer `country=BR`, `locale=en-US` -> BR/EN fallback falls vorhanden, sonst Block + Hinweis

## 4) API/Function-Erweiterungen (Vorschlag)

Neue Callables:

1. `getActiveLegalPolicies(country, locale)`
2. `recordLegalConsent(masterImei, country, locale, termsVersion, privacyVersion, consentSource)`
3. `needsLegalReconsent(masterImei, country, locale)`

Admin-Funktionen:

1. `publishLegalPolicy(policyType, country, locale, version, isMajorChange, effectiveAt, contentUrl)`
2. `markReconsentRequired(policyType, country, locale, version)`

## 5) App-Integration (MasterApp zuerst)

1. Nach Sprachwahl und vor Dashboard: `needsLegalReconsent` pruefen.
2. Falls erforderlich: Legal-Screen mit
   - Link AGB
   - Link Privacy
   - Checkbox/Explizit-Button fuer Zustimmung
3. Nach Zustimmung: `recordLegalConsent` aufrufen und Freigabe setzen.
4. Bei Fehler/Offline: Retry + read-only Info, aber keine Produktivnutzung ohne Consent.

## 6) Audit und Nachweise

Jedes Consent-Event in Audit-Logs erfassen:

1. `eventType=legal_consent`
2. `masterImei`
3. `country`, `locale`
4. `termsVersion`, `privacyVersion`
5. `timestamp`
6. `appVersion`

## 7) Wesentliche Aenderung (Major Change) Definition

Major Change (Re-Consent zwingend) wenn mindestens eines gilt:

1. Neue Datenkategorie oder neuer Verarbeitungszweck.
2. Neue Empfaengerkategorie/Transferland.
3. Wesentliche Aenderung bei Preisen, Laufzeit, Kuendigungsregeln.
4. Aenderung mit Nachteil fuer Verbraucherrechte.

## 8) Testfaelle (MVP)

1. Erstzustimmung bei neuer Registrierung.
2. Minor Update ohne harte Blockade (wenn so konfiguriert).
3. Major Update erzwingt Re-Consent und blockiert Dashboard.
4. Country-Wechsel (z. B. DE -> US) laedt passende Dokumente und fordert ggf. neue Zustimmung.
5. Audit-Log-Eintrag fuer jedes Consent-Ereignis vorhanden.

## 9) Rollout-Reihenfolge

1. Backend Datenmodell + Callables.
2. MasterApp Consent-Gate.
3. Web-Control Consent-Gate.
4. ChildApp nur Hinweis (vertragliche Zustimmung bleibt beim Parent/Master).
5. Monitoring und SLA fuer Consent-Fehler.

## 10) DSAR / Loeschung

Bei Account-Loeschung oder DSAR-Export muessen die nachfolgenden Collections einbezogen werden:

1. `masterLegalConsents`
2. `supportTickets`
3. `supportAccessGrants`
4. `audit_logs` (sofern rechtlich zulaessig bzw. nach definierter Ausnahmebehandlung)
5. `error_logs` und `performance_metrics`, wenn sie nutzerbezogene Kennungen enthalten

Damit ist sichergestellt, dass Compliance-Daten nicht ausserhalb des eigentlichen Master-Profils zurueckbleiben.
