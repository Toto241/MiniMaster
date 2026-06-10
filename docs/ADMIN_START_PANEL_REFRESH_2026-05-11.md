# Admin-Panel und Start-Panel: aktueller Zielstand

Stand: 2026-05-11
Branch: `fix/admin-start-panel-refresh`

## Ziel

Admin-Panel und Start-Panel werden als einheitliche Operator-Oberfläche verstanden. Das Start-Panel dient als kompakter Einstiegspunkt, das Admin-Panel als vollständiger Arbeitsbereich für Betrieb, QA, Release, Support, Datenschutz und Setup.

Die Überarbeitung verfolgt drei Ziele:

1. Veraltete oder verstreute Einstiegspunkte werden konsolidiert.
2. QA-, Release- und Startstatus werden unmittelbar sichtbar.
3. Handlungen werden nach Dringlichkeit, Rolle und Freigaberelevanz priorisiert.

## Neuer Navigationsaufbau

### 1. Start

Zweck: Sofortige Lageübersicht nach dem Öffnen der Anwendung.

Enthält:

- Systemstatus
- Firebase-/Backend-Status
- Android-QA-Status
- Release-Evidence-Status
- offene P0/P1-Blocker
- letzte CI-/QA-Ergebnisse
- empfohlene nächste Aktion
- Schnellstart für häufige Operator-Flows

Primäre Aktionen:

- `Release-Workspace öffnen`
- `QA-Matrix prüfen`
- `Readiness validieren`
- `Commissioning starten`
- `Fehlerdiagnose öffnen`

### 2. Qualitätssicherung & Tests

Zweck: Führender Arbeitsbereich für QA, Android-Matrix, Evidence und Testausführung.

Enthält:

- Android-10-bis-16-Matrix
- Parent-/Child-Dual-Device-Szenarien
- Smoke-/Standard-/Full-Profile
- Evidence-Manifeste
- manuelle Nachweise
- unsupported Tests
- veraltete Nachweise
- Retry-/Rerun-Steuerung
- Testhistorie

Primäre Aktionen:

- `Matrixplan erzeugen`
- `Smoke-Matrix ausführen`
- `Evidence validieren`
- `Release-Evidence exportieren`
- `Letzte Fehler erneut ausführen`

### 3. Release & Readiness

Zweck: Go-Live- und Audit-Sicht.

Enthält:

- P0/P1-Release-Gates
- Actions-/CI-Status
- Code-Scanning-Status
- Legacy-Auth-Cutover
- Firebase-/App-Check-/Secrets-Status
- Play-Console-/Store-Readiness
- Legal-/Consent-Status
- Exportpakete

Primäre Aktionen:

- `Release-Evidence exportieren`
- `Readiness-Gate ausführen`
- `P0/P1-Blocker anzeigen`
- `Sign-off vorbereiten`

### 4. Einrichtung & Commissioning

Zweck: Lokale Einrichtung und Geräte-Inbetriebnahme.

Enthält:

- Firebase-Konfiguration
- Admin-Claim-Prüfung
- Debug-Token
- USB-/ADB-Prüfung
- Dual-Device-Commissioning
- Host-Voraussetzungen
- lokale Runner-Kommandos

Primäre Aktionen:

- `Setup prüfen`
- `Debug-Token generieren`
- `USB-Test starten`
- `Dual-Device-Commissioning starten`

### 5. Betrieb & Support

Zweck: Tagesbetrieb und Supportfälle.

Enthält:

- Nutzer-/Abo-Übersicht
- Support-Zugriffe
- Tickets
- Debug-Freigaben
- Audit- und DSAR-Exports
- Operations-Fehler

Primäre Aktionen:

- `Supportzugriff gewähren`
- `Debugdaten analysieren`
- `Audit exportieren`
- `DSAR exportieren`

### 6. Recht & Datenschutz

Zweck: Rechtliche und datenschutzbezogene Freigaben.

Enthält:

- Datenschutzerklärung
- Nutzungsbedingungen
- Consent-Versionen
- Re-Consent-Flows
- Store-Pflichtangaben
- Export-/Nachweisstatus

Primäre Aktionen:

- `Policy laden`
- `Policy veröffentlichen`
- `Re-Consent vorbereiten`
- `Legal-Sign-off dokumentieren`

## Start-Panel: Kartenmodell

Das Start-Panel soll nicht alle Details zeigen, sondern den Operator führen.

### Karten

1. **Systemzustand**
   - Backend erreichbar
   - Firebase konfiguriert
   - Admin-Claim gültig
   - lokale Tools erkannt

2. **Release-Lage**
   - P0 offen
   - P1 offen
   - letzte Readiness-Ausführung
   - aktueller Go-/No-Go-Status

3. **QA-Lage**
   - Android-Matrix-Status
   - letzte Smoke-Ausführung
   - Evidence gültig/veraltet
   - unsupported Tests

4. **CI-/Workflow-Lage**
   - letzter CI-Status
   - Release-Evidence-Workflow
   - CodeQL/Code-Scanning
   - Firestore Rules CI

5. **Empfohlene nächste Aktion**
   - deterministisch aus Blockern ableiten
   - P0 vor P1
   - fehlende Evidence vor Komfortfunktionen

## Admin-Panel: Reiterbereinigung

### Behalten und stärken

- Start
- Qualitätssicherung & Tests
- Release & Readiness
- Einrichtung & Commissioning
- Betrieb & Support
- Recht & Datenschutz
- Befehlszentrale

### Zusammenführen

- verstreute QA-Informationen in `Qualitätssicherung & Tests`
- Go-Live-Informationen in `Release & Readiness`
- lokale Toolprüfungen in `Einrichtung & Commissioning`
- Support-/Debug-Aktionen in `Betrieb & Support`

### Entfernen oder herabstufen

- doppelte Statusanzeigen
- nicht mehr unterstützte Teststarter ohne Mapping
- reine Platzhalter ohne konkrete Aktion
- veraltete Hinweise ohne Bezug zu aktuellem QA-Katalog

## Statuslogik

### Statuswerte

- `pass`
- `warn`
- `fail`
- `blocked`
- `missing`
- `stale`
- `manual_required`
- `not_configured`
- `not_run`

### Priorität

1. P0 Release-Blocker
2. P1 Release-Blocker
3. veraltete Evidence
4. fehlende Automationszuordnung
5. Komfort-/UX-Aufgaben

## Datenquellen

Das überarbeitete Panel soll bestehende Endpunkte bevorzugen:

- `/api/qa/catalog`
- `/api/qa/android-matrix`
- `/api/qa/release-workspace`
- `/api/qa/emulators`
- `/api/commissioning/catalog`
- `/api/commissioning/history`
- `/api/commissioning/evidence`

Zusätzlich sollen die neuen Release-Evidence-Dateien berücksichtigt werden:

- `qa/catalog/android-10-16-release-matrix.json`
- `build/qa-artifacts/android-release-matrix/plan.json`
- `build/qa-artifacts/android-release-matrix/latest-summary.json`
- `build/qa-artifacts/android-release-matrix/validation-summary.json`
- `build/release-evidence/**/manifest.json`

## UX-Regeln

- Start-Panel zeigt maximal fünf Hauptkarten.
- Jede Karte hat genau eine Primäraktion.
- P0/P1-Blocker werden vor Info-Karten angezeigt.
- Manuelle Nachweise müssen direkt aus der QA-/Release-Sicht erfassbar sein.
- Veraltete PASS-Nachweise werden nicht als releasefähig dargestellt.
- Unsupported Tests bleiben sichtbar, werden aber klar als Automationslücke markiert.
- Dry-Run-Evidence wird als Plan-/Strukturprüfung markiert, nicht als echter Device-Pass.

## Definition of Done

- Start-Panel zeigt aktuellen System-, QA-, CI- und Release-Status.
- Admin-Panel bündelt QA, Release, Commissioning, Support und Legal logisch.
- Android-10-bis-16-Matrix ist in der QA-Sicht sichtbar.
- Release-Evidence-Status ist in Start und Release sichtbar.
- Veraltete und fehlende Nachweise werden als offene Punkte angezeigt.
- Nicht mehr unterstützte oder nicht gemappte Tests sind nicht versteckt, sondern klar gekennzeichnet.
- Alle primären Operator-Aktionen sind über das Panel erreichbar.
