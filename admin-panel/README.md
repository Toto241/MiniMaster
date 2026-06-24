# MiniMaster Betreiber-Dashboard

Web-Dashboard fuer Betreiber (Admin/Support).

Das Panel kann statisch ausgeliefert oder als Python-Webanwendung ueber `python_admin/app.py` betrieben werden. Die Lightweight-Ansicht `simple.html` wurde als aktuelle Betreiber-Konsole neu strukturiert und dient als Start-/Admin-Panel fuer QA, Release, Commissioning, Support und Datenschutz.

## Aktueller Panel-Aufbau

Die ueberarbeitete Betreiber-Konsole nutzt folgende Hauptbereiche:

- **Start**: zentrale Lageuebersicht fuer Systemzustand, Release-Lage, QA-Lage und CI-/Workflow-Lage
- **Qualitaetssicherung & Tests**: Android-10-bis-16-Matrix, Smoke-/Standard-/Full-Profile, Evidence, Unsupported-Tests und Rerun-Flows
- **Release & Readiness**: P0-/P1-Blocker, Legacy-Auth-Cutover, App-Check-/Secrets-/Store-/Legal-Status und Release-Evidence
- **Einrichtung & Commissioning**: Firebase-Konfiguration, Admin-Claims, USB/ADB, Debug-Token und Dual-Device-Commissioning
- **Betrieb & Support**: Supportzugriff, Debug-Freigaben, Fehleranalyse, DSAR und Audit-Exports
- **Recht & Datenschutz**: Policies, Consent-Versionen, Re-Consent und Store-Pflichtangaben
- **Befehlszentrale**: Einstiegspunkt fuer freigegebene lokale Betreiber-Kommandos

## Funktionen

- KPI Uebersicht (Users, Tasks, Tickets, Errors)
- User- und Subscription-Verwaltung
- Support-Ticket-Management
- Compliance-Exports (DSAR, Audit)
- Cloud Setup & Assistant Tab (Health Checks, Checkliste, Setup-Report)
- Recht & Datenschutz Tab mit Legal-Policy-Management (laden, veröffentlichen, Re-Consent)
- Google Play Store Readiness Modul (Pflicht-Checks, Status, JSON-Export)
- P0 Blocker Cockpit (Go-Live): Security/Play/Commissioning/Operations-Blocker mit Evidenz, Export und Reset
- Automatisches Markieren von P0-Checks bei erfolgreichen Support-/Compliance-Aktionen und Readiness-Signalen
- QA-Register mit Risiko-Fokus: Frischegrad der Nachweise, offene Release-Blocker, Unsupported-Test-Mappings und Schnellfilter direkt im Bereich Qualitaetssicherung
- Android-10-bis-16-QA-Matrix als fuehrende Test- und Evidence-Struktur
- Release-Evidence-Struktur fuer Matrixplan, Matrix-Summary, Validation-Summary und exportierte Manifestpakete
- Befehlszentrale mit USB-Debug/Commissioning-Kommandos inkl. APK-Installations-Schnittstelle (`run-usb-tests.ps1 -InstallApk`, Dual-Runner)
- **Lightweight Betreiber-Dashboard** (`simple.html`): moderne Start-/Admin-Konsole mit strukturierten Betreiber-Karten, eigenem `style.css` und PWA-Icons
- **Support-Panel** (`support.js`): Support-Zugriff gewaehren/entziehen, Debug-Zugriff und Analyse mit Debug-Daten ueber Backend-APIs
- **Debug-Panel** (`debug.js`): Laufzeit-Status, Modul-Liste und JSON-Snapshot mit Links zu Setup/QA im Voll-Dashboard
- **Session-Manager** (`modules/core/session-manager.js`): Idle-Timeout (15 Min), 8h-Session-Limit, Re-Auth für T3/T4-Aktionen, Admin-PIN für T4
- **Firebase-Konfigurationsmodul** (`firebase-config.js`): Zentrale, umgebungsbasierte Firebase-Konfiguration fuer neue Module

## Start-Panel-Logik

Das Start-Panel zeigt maximal die wichtigsten Betreiber-Karten:

1. Systemzustand
2. Release-Lage
3. QA-Lage
4. CI-/Workflow-Lage

Jede Karte hat genau eine Primaeraktion. P0-/P1-Blocker werden vor Komfort- oder Informationsaufgaben priorisiert.

## Setup

1. Firebase-Konfiguration über das Bootstrap-Formular im Dashboard speichern (lokal in `operatorFirebaseConfigOverride`).
2. Sicherstellen, dass der Benutzer in Firebase Auth existiert und den Claim `role: "admin"` besitzt.
3. Hosting bereitstellen oder lokal statisch ausliefern.

## Admin-User anlegen

Mit lokalem `serviceAccountKey.json` im Projektroot:

```bash
node scripts/setup-admin.js <email> <passwort>
```

## Lokal starten

Das Panel kann weiterhin statisch mit einem beliebigen HTTP-Server gestartet werden, z. B.:

```bash
python -m http.server 8080
```

Dann `http://localhost:8080/admin-panel/operator-dashboard-light_NEW.html` aufrufen.

## Python-Webanwendung

```bash
python3 python_admin/app.py
```

Dann `http://127.0.0.1:8765/admin-panel/operator-dashboard-light_NEW.html` aufrufen. In diesem Modus lassen sich die bisherigen freigegebenen CLI- und PowerShell-Kommandos direkt aus der Befehlszentrale starten.

## QA-Register-Regeln

- `Release-Blocker` bedeutet: Der Eintrag ist fuer einen Go-Live fachlich relevant und braucht einen aktuellen bestaetigten PASS.
- `PASS, aber veraltet` gilt in der Betreiber-Sicht nicht als sauberer Freigabestatus. Veraltete Nachweise muessen vor einer Freigabe erneuert werden.
- `Unsupported` bedeutet: Ein Repo-Test ist inventarisiert, aber aktuell keiner ausfuehrbaren Suite oder keinem automatischen Startweg zugeordnet.
- iOS-XCTest-Dateien werden im QA-Register ebenfalls inventarisiert. Ohne macOS-/Xcode-Suite erscheinen sie derzeit bewusst als offene Automationsluecke statt unsichtbar zu bleiben.
- `Offene Nachweise` umfasst fehlende, fehlgeschlagene oder veraltete Evidenz fuer manuelle bzw. dokumentierte Checks.
- Dry-Run-Evidence gilt als Plan-/Strukturpruefung, nicht als echter Device-Pass.
- Das QA-Register ist die fuehrende Quelle fuer Commissioning-Freigaben, dokumentierte Nachweise und die operative Go-Live-Sicht im Admin-Panel.

## Troubleshooting

- Login erfolgreich, aber "Access Denied": Admin-Claim fehlt oder Token nicht erneuert.
- Firebase init Fehler: Platzhalter in `firebaseConfig` wurden nicht ersetzt.
- Keine Daten sichtbar: Firestore Rules/Collections oder Berechtigungen pruefen.
- P0-Cockpit aktualisiert sich nicht: Browser-Cache leeren und sicherstellen, dass Aktionen erfolgreich durchlaufen (nur erfolgreiche Flows auto-markieren).
- QA-Matrix leer: pruefen, ob `qa/catalog/android-10-16-release-matrix.json` vorhanden ist und die Python-API unter `/api/qa/catalog` erreichbar ist.

## Lightweight Betreiber-Dashboard

Eine schlanke, modulare Alternative zum vollstaendigen Dashboard befindet sich unter:

```text
http://localhost:8080/admin-panel/operator-dashboard-light_NEW.html
```

Die Light-Version nutzt ES Modules (`app-simple.js`, `support.js`, `debug.js`) und ein eigenes Stylesheet (`style.css`). Sie eignet sich fuer schnelle Betreiber-, QA-, Release-, Support- und Debug-Aufgaben ohne Laden des gesamten Dashboards.

## Klare Dateinamen (neu)

- `operator-dashboard-full_NEW.html`: Vollstaendiges Betreiber-Dashboard (neuer Standard)
- `operator-dashboard-light_NEW.html`: Schlankes Dashboard fuer schnelle Betreiber-Flows
- `operator-setup-wizard_NEW.html`: Einrichtungs-/Wizard-Ansicht
- `operator-audit-logs_NEW.html`: Audit- und Log-Ansicht

## Legacy-Dateinamen (weiterhin erreichbar)

- `index.html` → Weiterleitung auf `operator-dashboard-full_NEW.html`
- `simple.html` → Weiterleitung auf `operator-dashboard-light_NEW.html`
- `wizard.html` → Weiterleitung auf `operator-setup-wizard_NEW.html`
- `logs.html` → Weiterleitung auf `operator-audit-logs_NEW.html`
