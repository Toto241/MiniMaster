# Autonomous Repository Implementation Backlog

Stand: 2026-05-11
Branch: `plan/repository-folder-implementation-audit`

## Ziel

Dieses Backlog übersetzt die ordnerweise Repository-Durchsicht in konkrete, priorisierte Umsetzungspakete. Es dient als Arbeitsgrundlage für die weitere autonome Bearbeitung ohne zusätzliche Rückfragen.

## P0: Release-, CI- und Security-Gates stabilisieren

### Problem

Der aktuelle Repository-Zustand enthält mehrere releasekritische Gates, deren Status nicht eindeutig genug ist:

- CodeQL / Code Scanning schlägt in PRs fehl.
- Android-Matrix-/Release-Evidence-Automation befindet sich in PR #175, ist aber noch nicht final auf `main`.
- Dry-Run-Evidence darf nicht als echte Device-Evidence gewertet werden.
- Workflow-Logs/Artifacts sind über den Connector teilweise nicht vollständig abrufbar.

### Umsetzung

1. CodeQL-Workflow analysieren.
2. Java/Kotlin- und JavaScript/TypeScript-Analyse getrennt betrachten.
3. Falls Fehler repositorykonfigurationsbedingt sind, als externen Blocker dokumentieren.
4. Branch-Protection mit real verfügbaren Checks abgleichen.
5. Release-Evidence-Workflow nach Merge von PR #175 in `validate:readiness` oder in eine eigene Gate-Kette einbinden.
6. Artifact-Pfade konsolidieren:
   - `build/qa-artifacts/android-release-matrix/plan.json`
   - `build/qa-artifacts/android-release-matrix/latest-summary.json`
   - `build/qa-artifacts/android-release-matrix/validation-summary.json`
   - `build/release-evidence/**/manifest.json`
7. In README/Runbook klar kennzeichnen:
   - Dry-Run = Struktur-/Planprüfung
   - Device-Pass = echte Emulator-/Geräteausführung

### Akzeptanzkriterien

- UI-/Dokumentations-PRs werden nicht unnötig durch irrelevante Security-Scanner blockiert.
- Security-Gate-Status ist im Repository nachvollziehbar.
- Release-Evidence-Paket ist maschinenlesbar und dokumentiert.
- Es gibt keinen Text mehr, der Dry-Run-Evidence als echte Geräteabdeckung ausgibt.

## P0: Android Master-/Child-App Release-Matrix operationalisieren

### Problem

Die Apps `masterApp` und `childApp` sind Kernbestandteile des Produkts. Die README beschreibt Tests und Android-10-bis-16-Validierung, aber echte Dual-Device-Evidence ist noch nicht vollständig operationalisiert.

### Umsetzung

1. `masterApp` inventarisieren:
   - `build.gradle`
   - `AndroidManifest.xml`
   - Compose-Screens
   - ViewModels
   - Firebase-/FCM-/Auth-Integration
   - Tests
2. `childApp` inventarisieren:
   - `build.gradle`
   - `AndroidManifest.xml`
   - Accessibility Service
   - Command-/Policy-Sync
   - Task-Proof-Upload
   - Tamper-/Heartbeat-Flows
   - Tests
3. Android-Versionen 10 bis 16 in Matrixprofile übersetzen:
   - smoke
   - standard
   - full
4. Dual-Device-Szenarien definieren:
   - Pairing Parent -> Child
   - Lock/Unlock
   - App Blocking
   - Usage Rules
   - Task Create/Complete/Approve/Reject
   - Photo Proof Upload
   - Tamper Event
   - Reboot/Offline Recovery
5. Emulator-/ADB-Voraussetzungen in `python_admin` und `scripts/` abbilden.

### Akzeptanzkriterien

- Jede kritische App-Funktion ist einem Matrixszenario zugeordnet.
- Dry-Run und echte Device-Ausführung sind technisch und dokumentarisch getrennt.
- QA-Panel kann Status aus Matrix-/Evidence-Dateien ableiten.

## P1: Admin-/Start-Panel mit Live-Operator-API verbinden

### Problem

PR #176 modernisiert die Operator-Konsole strukturell und visuell, aber viele Inhalte sind noch statisch.

### Umsetzung

1. `simple.html` als führende Lightweight-Konsole bestätigen oder Hosting-Rewrite anpassen.
2. `app-simple.js` mit echten API-Endpunkten verbinden:
   - `/api/qa/catalog`
   - `/api/qa/android-matrix`
   - `/api/qa/release-workspace`
   - `/api/qa/emulators`
   - `/api/commissioning/catalog`
   - `/api/commissioning/history`
   - `/api/commissioning/evidence`
3. Statusmodell implementieren:
   - `pass`
   - `warn`
   - `fail`
   - `blocked`
   - `missing`
   - `stale`
   - `manual_required`
   - `not_configured`
   - `not_run`
4. Primäraktionen an sichere Backend-/Python-API-Handler binden.
5. Fehlerzustände sichtbar machen:
   - API nicht erreichbar
   - Evidence fehlt
   - Emulator fehlt
   - Command nicht erlaubt
   - Status veraltet
6. Accessibility verbessern:
   - Fokuszustände
   - `aria-live`
   - Tastaturbedienung
   - klare Buttonlabels

### Akzeptanzkriterien

- Start-Panel zeigt echte System-/QA-/Release-Lage.
- QA-Panel liest reale Matrix-/Evidence-Dateien.
- Keine Schaltfläche suggeriert nicht implementierte Aktionen.
- Fehlerzustände sind sichtbar und operatorfreundlich.

## P1: Backend-/Rules-Konsistenzprüfung abschließen

### Problem

`index.ts` exportiert viele Cloud-Function-Module. Firestore/Storage Rules sind stark gesperrt. Es muss sichergestellt sein, dass Client-, Callable- und Admin-SDK-Flows konsistent sind.

### Umsetzung

1. Exportierte Module aus `index.ts` einzeln prüfen:
   - Auth
   - Pairing
   - Device
   - Tasks
   - Subscription
   - Support
   - Legal
   - Admin
   - Operator Setup
   - External Integrations
   - B2B
   - Affiliate
   - Validation
   - Resilience
   - Rate Limiter
   - Error Handler
2. Für jede Collection prüfen:
   - Wer darf lesen?
   - Wer darf schreiben?
   - Erfolgt Schreiben direkt, callable oder Admin SDK?
   - Gibt es Tests?
3. Support-/Debug-Zugriffe gesondert datenschutzrechtlich prüfen.
4. Reset-/Recovery-Funktionen gegen Environment Flags prüfen.
5. Legacy-Auth-Cutover gegen Inventar abgleichen.

### Akzeptanzkriterien

- Jedes Backend-Modul hat eine klare Rules-/Test-/Dokumentationszuordnung.
- Keine Cloud Function verlässt sich auf Client-Schreibrechte, die Rules blockieren.
- Support-/Debug-Zugriffe sind auditiert und befristet.

## P1: Python Operator API und Befehlszentrale härten

### Problem

Die Python-Operator-App soll lokale Kommandos, QA, Evidence und Commissioning bündeln. Dadurch ist sie sicherheitskritisch.

### Umsetzung

1. `python_admin/app.py` vollständig prüfen.
2. Command-Allowlist strikt halten.
3. Keine freien Shell-Kommandos aus UI-Parametern erlauben.
4. Evidence-/Log-Ausgaben standardisieren.
5. Emulator-/ADB-Status maschinenlesbar ausgeben.
6. Fehlercodes vereinheitlichen.
7. API-Vertrag dokumentieren.

### Akzeptanzkriterien

- UI kann API-Endpunkte verlässlich konsumieren.
- Befehlszentrale führt nur erlaubte Aktionen aus.
- Jede Aktion erzeugt nachvollziehbare Evidence oder Fehlermeldung.

## P1: Dokumentation konsolidieren

### Problem

Das Repository enthält viele Status-/Roadmap-/Review-Dokumente. Einige sind historisch, andere aktuell. Ohne Kennzeichnung besteht Verwechslungsgefahr.

### Umsetzung

1. Aktuelle führende Dokumente markieren:
   - README
   - Repository Folder Implementation Plan
   - Repository Implementation Backlog
   - Admin Start Panel Refresh
   - QA Release Gap Closure Plan
2. Historische Dokumente als historisch markieren.
3. README-Key-Docs aktuell halten.
4. Release-Runbook und Operator-Runbook konsolidieren.
5. Legal-/Country-Dokumente gegen technische Gates verlinken.

### Akzeptanzkriterien

- Neue Entwickler erkennen sofort den aktuellen Projektstand.
- Historische Reviews werden nicht mit aktuellen Freigaben verwechselt.
- Release- und Operator-Dokumentation widersprechen sich nicht.

## P2: Web-/Desktop-/PWA-Bereiche bereinigen

### Problem

Neben Android und Backend existieren mehrere Web-/Desktop-Bereiche, die UX- und Sicherheitsanforderungen erfüllen müssen.

### Umsetzung

1. `web-control` prüfen.
2. `parent-panel` und `child-panel` prüfen, sofern vorhanden.
3. Firebase-Konfigurationsplatzhalter und CSP-Kompatibilität prüfen.
4. PWA-Manifeste und Icons prüfen.
5. `desktop` prüfen:
   - Electron Main Process
   - Startmodi
   - Context Isolation
   - Node Integration
   - lokale URL-Fehlerzustände

### Akzeptanzkriterien

- Web-/PWA-Panels sind rollen- und funktionsklar getrennt.
- Desktop-Launcher öffnet nur erwartete lokale Panels.
- Keine unnötige Electron-Angriffsfläche.

## P2: iOS-Bereiche einordnen

### Problem

Das Repository referenziert iOS-Bereiche. Unter Windows/CI sind sie nicht ohne macOS/Xcode vollständig ausführbar.

### Umsetzung

1. Existenz von `iosChildApp`, `iosMasterApp`, `iosSharedServices` prüfen.
2. Reifegrad dokumentieren.
3. XCTest als externe Evidence-Suite behandeln.
4. Nicht als lokal ausführbaren Windows-Gate darstellen.

### Akzeptanzkriterien

- iOS-Status ist ehrlich dokumentiert.
- iOS-Tests blockieren Windows-/Android-Gates nicht unbegründet.

## Umsetzungsreihenfolge

1. P0: CI/CodeQL/Release-Gates
2. P0: Android Matrix operationalisieren
3. P1: Admin-/Start-Panel mit Live-Daten verbinden
4. P1: Backend-/Rules-Konsistenzprüfung
5. P1: Python Operator API härten
6. P1: Dokumentation konsolidieren
7. P2: Web/Desktop/PWA
8. P2: iOS-Einordnung
