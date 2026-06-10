# MiniMaster Operator Dashboard

Web-Dashboard fuer Betreiber/Admins.

Das Panel kann jetzt auch als Python-Webanwendung ueber `python_admin/app.py` betrieben werden. Dabei bleibt die bestehende Oberfläche erhalten, direkte CLI-/PowerShell-Ausführung erfolgt dann ueber die Python-API statt nur ueber Electron.

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
- Befehlszentrale mit USB-Debug/Commissioning-Kommandos inkl. APK-Installations-Schnittstelle (`run-usb-tests.ps1 -InstallApk`, Dual-Runner)
- **Lightweight Admin Panel** (`simple.html`): Modulare ES-Module-Ansicht mit Support- & Debug-Panel, eigenem `style.css` und PWA-Icons
- **Support-Panel** (`support.js`): Support-Zugriff gewaehren/entziehen, Debug-Zugriff und Analyse mit Debug-Daten ueber Backend-APIs
- **Debug-Panel** (`debug.js`): Laufzeit-Status, Modul-Liste und JSON-Snapshot mit Links zu Setup/QA im Voll-Dashboard
- **Session-Manager** (`modules/core/session-manager.js`): Idle-Timeout (15 Min), 8h-Session-Limit, Re-Auth für T3/T4-Aktionen, Admin-PIN für T4
- **Firebase-Konfigurationsmodul** (`firebase-config.js`): Zentrale, umgebungsbasierte Firebase-Konfiguration fuer neue Module

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

Dann `http://localhost:8080/admin-panel/` aufrufen.

## Troubleshooting

- Login erfolgreich, aber "Access Denied": Admin-Claim fehlt oder Token nicht erneuert.
- Firebase init Fehler: Platzhalter in `firebaseConfig` wurden nicht ersetzt.
- Keine Daten sichtbar: Firestore Rules/Collections oder Berechtigungen pruefen.
- P0-Cockpit aktualisiert sich nicht: Browser-Cache leeren und sicherstellen, dass Aktionen erfolgreich durchlaufen (nur erfolgreiche Flows auto-markieren).

## QA-Register-Regeln

- `Release-Blocker` bedeutet: Der Eintrag ist fuer einen Go-Live fachlich relevant und braucht einen aktuellen bestaetigten PASS.
- `PASS, aber veraltet` gilt in der Operator-Sicht nicht als sauberer Freigabestatus. Veraltete Nachweise muessen vor einer Freigabe erneuert werden.
- `Unsupported` bedeutet: Ein Repo-Test ist inventarisiert, aber aktuell keiner ausfuehrbaren Suite oder keinem automatischen Startweg zugeordnet.
- iOS-XCTest-Dateien werden im QA-Register ebenfalls inventarisiert. Ohne macOS-/Xcode-Suite erscheinen sie derzeit bewusst als offene Automationsluecke statt unsichtbar zu bleiben.
- `Offene Nachweise` umfasst fehlende, fehlgeschlagene oder veraltete Evidenz fuer manuelle bzw. dokumentierte Checks.
- Das QA-Register ist die fuehrende Quelle fuer Commissioning-Freigaben, dokumentierte Nachweise und die operative Go-Live-Sicht im Admin-Panel.

## Python-Webanwendung

```bash
python3 python_admin/app.py
```

Dann `http://127.0.0.1:8765/admin-panel/` aufrufen. In diesem Modus lassen sich die bisherigen freigegebenen CLI- und PowerShell-Kommandos direkt aus der Befehlszentrale starten.

## Lightweight Admin Panel

Eine schlanke, modulare Alternative zum vollstaendigen Dashboard befindet sich unter:

```
http://localhost:8080/admin-panel/simple.html
```

Die Light-Version nutzt ES Modules (`app-simple.js`, `support.js`, `debug.js`) und ein eigenes Stylesheet (`style.css`).
Sie eignet sich fuer schnelle Support- und Debug-Aufgaben ohne Laden des gesamten Dashboards.
