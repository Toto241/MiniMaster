# Repository Folder Implementation Plan

Stand: 2026-05-11
Branch: `plan/repository-folder-implementation-audit`

## Zweck

Dieses Dokument bündelt die bisherige ordnerweise Repository-Durchsicht in einen konkreten Umsetzungsplan. Ziel ist, das Repository nicht nur punktuell zu verbessern, sondern jeden Hauptbereich systematisch auf Aktualität, Buildbarkeit, Testabdeckung, Dokumentation, Release-Fähigkeit und operative Bedienbarkeit zu prüfen.

## Bereits geprüfte Bereiche

### Root

Geprüfte Dateien:

- `README.md`
- `package.json`
- `tsconfig.json`
- `firebase.json`
- `settings.gradle`
- `build.gradle`
- `firestore.rules`
- `storage.rules`
- `index.ts`
- `firebase.ts`

Befund:

- Root beschreibt das Projekt als aktiv gepflegten Prototyp mit produktionsorientierter Härtung.
- Node-Ziel ist `>=22`.
- TypeScript ist streng konfiguriert.
- Firebase Hosting enthält Ziele für `web-control`, `admin-panel`, `parent-panel`, `child-panel`.
- Android-Root enthält `masterApp` und `childApp`.
- Firestore- und Storage-Regeln sind stark serverseitig kontrolliert.
- Backend wird über `index.ts` als Barrel-Export für Cloud Functions organisiert.

Auffälligkeiten:

- README auf `main` enthält noch nicht die neuen Android-Matrix-/Release-Evidence-Skripte aus PR #175.
- `firebase.json` rewritet `admin-panel` auf `/index.html`, während PR #176 primär `simple.html` modernisiert.
- `build.gradle` enthält Zukunfts-/Platzhalterkommentare wie `Updated December 2025`.
- `firestore.rules` enthält redundante Sperrung der alten `families`-Struktur.
- Viele Gradle `force`-Regeln sollten mit Dependency Insight validiert werden.

## Hauptordner und Arbeitsplan

### 1. Root / Projektsteuerung

Ziel:

Root-Dateien müssen den realen Projektstand abbilden und alle aktiven QA-/Release-/Admin-Flows korrekt referenzieren.

Aufgaben:

- README nach Merge von PR #175 und PR #176 aktualisieren.
- Neue npm-Skripte für Android-Matrix und Release-Evidence dokumentieren.
- `firebase.json` prüfen: Soll `admin-panel` auf `index.html` oder die neue `simple.html`-Operator-Konsole zeigen?
- Gradle-Kommentare neutralisieren, sofern sie Zukunfts-/Platzhalterdaten enthalten.
- Redundante Firestore-Regelblöcke bereinigen.
- Optional expliziten Storage-Catch-All hinzufügen.

Priorität: P1

### 2. Backend Root / `src/`

Ziel:

Cloud Functions müssen sicher, testbar, rollenbasiert und releasefähig bleiben.

Bekannte Module aus `index.ts`:

- `src/auth`
- `src/pairing`
- `src/device`
- `src/controllers/decisioning`
- `src/device-sync`
- `src/tasks`
- `src/subscription`
- `src/support`
- `src/legal`
- `src/triggers`
- `src/admin`
- `src/operator-setup`
- `src/external-integrations`
- `src/pricing-config`
- `src/b2b-licensing`
- `src/affiliate`
- `src/cutover-monitor`
- `src/validation`
- `src/resilience`
- `src/rate-limiter`
- `src/error-handler`

Aufgaben:

- Jeden exportierten Modulpfad einzeln abrufen und auf tote Exporte, fehlende Tests, Legacy-Auth-Reste und Rollenlogik prüfen.
- Legacy `secretKey`/IMEI-Cutover gegen `docs/LEGACY_AUTH_INVENTORY.md` und `docs/AUTH_MIGRATION_PLAN.md` abgleichen.
- Callable Functions gegen Firestore Rules validieren: Was darf Client direkt, was nur Admin SDK?
- Reset-/Recovery-Endpunkte gegen Flags und Admin-Recovery-Token prüfen.
- Support-/Debug-Flows gegen Datenschutz- und Audit-Anforderungen prüfen.
- B2B-/Affiliate-/Pricing-Module auf tatsächliche Produktreife prüfen.

Priorität: P0/P1

### 3. `admin-panel/`

Ziel:

Admin-Panel und Start-Panel müssen als aktuelle Operator-Konsole nutzbar sein.

Bereits umgesetzt in PR #176:

- `simple.html` neue Hauptnavigation
- `app-simple.js` strukturierte Start-/QA-/Release-/Commissioning-/Support-/Legal-/Commands-Sichten
- `style.css` modernes Kartenlayout
- `README.md` aktualisiert
- `docs/ADMIN_START_PANEL_REFRESH_2026-05-11.md` ergänzt

Offene Aufgaben:

- Prüfen, ob `index.html` oder `simple.html` führender Einstiegspunkt sein soll.
- Live-Datenintegration an `/api/qa/catalog`, `/api/qa/release-workspace`, `/api/commissioning/*` anbinden.
- Primäraktionen mit echten Handlern verbinden.
- QA-/Release-Status nicht nur statisch beschreiben, sondern aus API-Payload ableiten.
- Accessibility prüfen: Fokuszustände, aria-labels, Tastaturbedienung.

Priorität: P1

### 4. `python_admin/`

Ziel:

Python-Operator-App soll Admin-Panel, QA-Katalog, Emulatorsteuerung und Commissioning zuverlässig ausliefern.

Aufgaben:

- `python_admin/app.py` vollständig prüfen.
- API-Endpunkte gegen README abgleichen.
- Command-Allowlist prüfen.
- Logs und Evidence-Dateien prüfen.
- Emulator-Reservierung, Start/Stop/Release und Matrixplan-Integration validieren.
- Sicherstellen, dass neue Admin-/Start-Panel-Sichten die vorhandenen Endpunkte nutzen können.

Priorität: P1

### 5. `scripts/`

Ziel:

Skripte sind zentrale Automatisierungs- und Release-Gates.

Bekannte Skriptgruppen:

- Testautomation
- Security Tests
- Release-Gate-Revalidierung
- Admin-QA-Audit
- Android-Checks
- Android-Matrix und Release-Evidence aus PR #175

Aufgaben:

- Skripte inventarisieren.
- Jedes Skript einem npm-/CI-/Panel-Flow zuordnen.
- Verwaiste Skripte markieren.
- Exit-Code-Verhalten vereinheitlichen.
- JSON-Ausgaben standardisieren.
- Windows-/PowerShell- und Linux-/CI-Kompatibilität prüfen.
- Neue Android-Matrix-Skripte nach Merge in `validate:readiness` oder eigene Release-Gate-Kette integrieren.

Priorität: P0/P1

### 6. `.github/workflows/`

Ziel:

CI soll eindeutige, reproduzierbare Gates liefern.

Bekannte Probleme:

- CodeQL schlägt wegen Repository-/Code-Scanning-Konfiguration fehl.
- Android-/Release-Evidence-Workflows liefern teils keine abrufbaren Logs im Connector.
- PR #175 enthält isolierten Release-Evidence-Workflow.

Aufgaben:

- Alle Workflows inventarisieren.
- Pflichtchecks gegen Branch Protection prüfen.
- CodeQL-Fehler als Repository-Konfigurationsblocker dokumentieren oder beheben.
- Android-Matrix nicht als echte Device-Abdeckung verkaufen, solange nur Dry-Run-Evidence existiert.
- Artifact Uploads und Diagnosepfade stabilisieren.

Priorität: P0

### 7. `masterApp/`

Ziel:

Eltern-App muss Pairing, Regeln, Aufgaben, Freigaben, Sprache und Push-Status stabil unterstützen.

Aufgaben:

- Gradle-Dateien prüfen.
- Manifest prüfen.
- Compose-Screens und ViewModels inventarisieren.
- Firebase-/FCM-/Auth-Integration prüfen.
- First-Start-Language-Flow prüfen.
- Tests gegen Android 10 bis 16 Matrix zuordnen.
- E2E-Flows für Pairing, Lock/Unlock, Task Approval und Push definieren.

Priorität: P0/P1

### 8. `childApp/`

Ziel:

Kind-App muss Regeln sicher empfangen, Accessibility Enforcement ausführen, Aufgaben einreichen und Manipulationen melden.

Aufgaben:

- Manifest/Permissions prüfen.
- Accessibility Service prüfen.
- FCM-/Command-Sync prüfen.
- Task-Proof-Upload prüfen.
- Offline-/Reboot-/Tamper-Szenarien prüfen.
- Android-10-bis-16-Kompatibilität prüfen.
- Datenschutzfreundliche Logging-/Upload-Grenzen validieren.

Priorität: P0

### 9. `web-control/`, `parent-panel/`, `child-panel/`

Ziel:

Web-/PWA-Panels müssen klar getrennte Rollen, sichere Firebase-Konfiguration und konsistente UX besitzen.

Aufgaben:

- Einstiegspunkte und Firebase-Konfiguration prüfen.
- CSP aus `firebase.json` gegen benötigte Ressourcen prüfen.
- Parent-/Child-Funktionen mit Android-App-Funktionen abgleichen.
- PWA-Manifeste und Icons prüfen.
- Veraltete Platzhalter entfernen.

Priorität: P1/P2

### 10. `desktop/`

Ziel:

Electron Launcher soll die PC-Panels zuverlässig öffnen und nicht unnötig Angriffsfläche erzeugen.

Aufgaben:

- `desktop/main.js` und `desktop/package.json` prüfen.
- NodeIntegration/ContextIsolation/Sandbox prüfen.
- Startmodi `desktop-start` und `desktop-operator` testen.
- Lokale URLs und Fehlerzustände prüfen.

Priorität: P1

### 11. `docs/`

Ziel:

Dokumentation muss nicht nur umfangreich, sondern aktuell und widerspruchsfrei sein.

Aufgaben:

- Doppelte/alte Statusdokumente markieren.
- README-Key-Docs aktualisieren.
- QA-/Release-Dokumente aus PR #175/#176 einordnen.
- Legal-/Country-/Consent-Dokumente mit aktueller App-Funktionalität abgleichen.
- CI-Revalidation-Dokumente mit tatsächlichem GitHub-Status abgleichen.

Priorität: P1

### 12. `test/`

Ziel:

Tests müssen reale Release-Risiken abdecken und sauber in CI/Readiness eingebunden sein.

Aufgaben:

- Jest-Tests inventarisieren.
- Firestore-/Storage-Emulator-Tests prüfen.
- Security-Tests prüfen.
- Fehlende Tests je Backend-Modul ableiten.
- Unsupported-/Not-Mapped-Tests in QA-Register überführen.

Priorität: P0/P1

### 13. `qa/`

Ziel:

QA-Kataloge und Android-Matrix sind maschinenlesbare Quelle für Testplanung und Evidence.

Aufgaben:

- Katalogstruktur prüfen.
- Android-10-bis-16-Matrix aus PR #175 nach Merge als führend etablieren.
- Evidence-Schema stabilisieren.
- Matrixstatus in Admin-/Start-Panel einbinden.

Priorität: P1

### 14. iOS-Ordner, falls vorhanden

Bekannte Referenzen:

- `iosChildApp`
- `iosMasterApp`
- `iosSharedServices`

Aufgaben:

- Existenz und Reifegrad prüfen.
- Xcode-/macOS-Abhängigkeit dokumentieren.
- iOS-XCTest als externe Evidence-Suite behandeln.
- Nicht als lokal unter Windows ausführbar darstellen.

Priorität: P2

## Priorisierte Umsetzung

### Phase 1: Release-Blocker schließen

- CodeQL-/Code-Scanning-Blocker klären.
- PR #175 finalisieren oder korrekt als Foundation ohne echte Device-Evidence markieren.
- Android-Matrix-Skripte in Release-Gate-Dokumentation einbinden.
- Admin-/Start-Panel-PR #176 nach CodeQL-Klärung mergen.

### Phase 2: UI und Operator-API verbinden

- `simple.html`/`app-simple.js` mit echten Python-API-Endpunkten verbinden.
- Start-Panel dynamisch aus `/api/qa/release-workspace` befüllen.
- QA-Panel Android-Matrix und Evidence-Status anzeigen lassen.
- Befehlszentrale mit validierten, erlaubten Kommandos verbinden.

### Phase 3: Backend-/Rules-Konsistenzprüfung

- Alle `src/`-Module mit Firestore/Storage Rules abgleichen.
- Rollenmodell konsolidieren.
- Legacy-Auth-Cutover vollständig nachziehen.
- Reset-/Recovery-Flows absichern.

### Phase 4: Android-Device-Abdeckung

- Master-/Child-App Tests der Matrix zuordnen.
- Emulatorprofile für API 29 bis 36 operationalisieren.
- Dual-Device-Flows automatisieren.
- Dry-Run-Evidence von echter Device-Evidence klar trennen.

### Phase 5: Dokumentationsbereinigung

- README aktualisieren.
- alte Statusdokumente archivieren oder als historisch markieren.
- Release-Runbook und Operator-Runbook zusammenführen.

## Definition of Done

Ein Ordner gilt als vollständig abgearbeitet, wenn:

- alle relevanten Dateien inventarisiert sind,
- aktive Einstiegspunkte bekannt sind,
- Build-/Test-/CI-Bezug dokumentiert ist,
- Sicherheits- und Datenschutzbezug geprüft ist,
- veraltete oder doppelte Inhalte markiert sind,
- konkrete Folgeaufgaben mit Priorität vorliegen,
- der Ordner entweder releasefähig ist oder ein klarer Blocker dokumentiert wurde.
