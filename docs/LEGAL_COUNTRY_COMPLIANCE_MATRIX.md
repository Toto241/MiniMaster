# Legal Country Compliance Matrix

## Zweck

Diese Matrix strukturiert die rechtlichen Themen, die pro Land vor Produktivstart bewertet und umgesetzt werden muessen.

Hinweis: Dieses Dokument ist eine technische/organisatorische Vorbereitung und ersetzt keine individuelle Rechtsberatung.

## Globale Mindestanforderungen (fuer alle Laender)

1. Rechtsgrundlagen fuer Datenverarbeitung dokumentieren.
2. Transparente Datenschutzhinweise in App und Website bereitstellen.
3. Elternrolle und Verantwortung klar regeln (kein heimliches Monitoring Dritter).
4. Altersgrenzen und Einwilligungslogik fuer Kinder/Jugendliche umsetzen.
5. Auftragsverarbeitung mit Unterauftragnehmern (z. B. Cloud-Anbieter) vertraglich absichern.
6. Loeschkonzept, Aufbewahrungsfristen und Datenportabilitaet bereitstellen.
7. Incident- und Data-Breach-Prozess mit Fristen etablieren.
8. Verbraucherrechte (Widerruf, Gewaehrleistung, Kuendigung) klar in AGB und UX ausweisen.

## Regionale Compliance-Prioritaeten

### EU / EWR (inkl. DACH)

- DSGVO: Art. 6 Rechtsgrundlagen, Art. 13/14 Informationspflichten, Art. 15-22 Betroffenenrechte.
- Kinderdaten: Altersgrenzen je Land fuer Einwilligung in Dienste der Informationsgesellschaft beachten.
- ePrivacy/TTDSG-Naehe: Tracking/Telemetry nur mit passender Rechtsgrundlage.
- Verbraucherschutz: Preisangaben, Laufzeiten, Auto-Renewal, Kuendigungsprozess transparent.
- Internationale Uebermittlung: SCCs + Transfer Impact Assessment fuer Drittstaaten.

### Vereinigtes Koenigreich (UK)

- UK GDPR + Data Protection Act 2018.
- UK Age Appropriate Design Code (AADC) bei Kinderdiensten beruecksichtigen.
- UK-spezifische Datenschutzhinweise und Datentransfermechanismen.

### USA

- Bundesstaatliche Datenschutzgesetze (z. B. CCPA/CPRA, VCDPA, CPA) nach Nutzerwohnsitz.
- COPPA bei Kindern unter 13 Jahren: verifizierbare elterliche Einwilligung, Datennutzung begrenzen.
- Auto-renewal Gesetze je Bundesstaat (Klarheit zu Laufzeit, Kuendigung, Reminder).

### Kanada

- PIPEDA + provinzielles Recht.
- Klare Zweckbindung, Einwilligung und Zugriffskonzepte.

### LATAM (z. B. Brasilien, Mexiko)

- Brasilien: LGPD (inkl. DPO/ANPD-Besonderheiten).
- Lokale Transparenzpflichten und Verbraucherrecht zu Abo-Modellen.

### MENA

- Landesspezifische Datenschutzgesetze sehr heterogen.
- Arabische Vertragssprache und zivilrechtliche Wirksamkeit lokaler Fassungen pruefen.

### APAC (z. B. Indien, Indonesien, Japan, Korea)

- Indien: DPDP Act.
- Japan: APPI.
- Korea: PIPA.
- Indonesien: PDP Law.
- Teilweise Datenlokalisierung oder sektorale Anforderungen moeglich.

## Pflichtpaket pro Land (Go-Live Gate)

1. Juristische Pruefung von AGB + Privacy Notice in Landessprache.
2. Alters-/Einwilligungslogik fuer Kinder und Elternrolle validiert.
3. Steuer-/Preis-/Abo-Compliance fuer In-App-Purchases validiert.
4. DSAR-Prozess (Auskunft, Loeschung, Berichtigung, Export) operativ getestet.
5. Incident-Response und Meldewege inkl. Fristen dokumentiert.
6. Vertraege mit Dienstleistern und Unterauftragnehmern freigegeben.
7. Datenflussdiagramm je Land/Region aktualisiert.

## Empfohlene Artefakte je Land

- Country Legal Brief
- Lokalisierte AGB-Fassung
- Lokalisierte Datenschutzerklaerung
- DPIA/PIA (falls erforderlich)
- Transfer Impact Assessment (bei Drittlandtransfer)
- Consent- und Logging-Nachweis

## Operationalisierung im Produkt

1. Geo-basierte Ausspielung von Rechtsdokumenten (Versionierung + Historie).
2. Versionierte Zustimmung (TermsVersion, PrivacyVersion, ConsentTimestamp).
3. Audit-Logs fuer Zustimmung, Widerruf, Support-Zugriffe.
4. In-App-Links zu AGB/Datenschutz in der gewaehlten Sprache.
5. Export-/Loeschfunktion fuer Master-Konto in selbem Support-Flow.
