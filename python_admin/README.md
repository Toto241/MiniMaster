# MiniMaster Python Admin

Python-Webanwendung fuer das bestehende Admin-Panel.

## Funktionen

- liefert das bisherige `admin-panel/` direkt ueber Python aus
- stellt eine sichere JSON-API fuer direkte CLI-/PowerShell-Ausfuehrung bereit
- fuehrt die bisherigen PowerShell-Runner (`run-usb-tests.ps1`, `run-dual-device-commissioning.ps1`, `generate-debug-token.ps1`, `revalidate-release-gates.ps1`) direkt ueber `pwsh` aus, solange sie ueber das Admin-Panel angefordert werden
- stellt eine Commissioning-Orchestrierung bereit, um Tests direkt aus dem Setup-Tab zu starten, auszuwerten und zu protokollieren

## Start

```bash
python3 python_admin/app.py
```

Danach ist das Dashboard unter `http://127.0.0.1:8765/admin-panel/` verfuegbar.

## Sicherheit

Die API akzeptiert nur explizit freigegebene Programme:

- `adb`
- `bash`
- `firebase`
- `node`
- `npm`
- `npx`
- `powershell` / `pwsh`
- `python` / `python3`
- `gradlew.bat` / `./gradlew`

Mehrzeilige Befehle werden zeilenweise validiert und nacheinander ausgefuehrt.

## Commissioning API

- `GET /api/commissioning/catalog`
  - liefert den Python-seitig definierten Testfallkatalog fuer den Bereich `Einrichtung & Assistent`
  - gruppiert automatische Checks, manuelle Nachweise, dokumentierte Testplaene und lokale Gate-Kommandos

- `POST /api/commissioning/run`
  - startet einen Automationslauf fuer offene Inbetriebnahme-Punkte
  - bewertet Runtime-/Play-Store-/Attestation-Status
  - fuehrt optional lokale Gate-Kommandos aus (`npm run validate:readiness`, `npm run ci:revalidate`)
  - mit `options.rerunLatestFailed=true` werden nur die im letzten Lauf fehlgeschlagenen Gate-Kommandos erneut gestartet; fuer `ci:revalidate` wird dabei automatisch `npm run ci:revalidate:rerun` verwendet
  - schreibt jedes Ergebnis als JSON-Zeile in `python_admin/logs/commissioning_runs.jsonl`

- `GET /api/commissioning/history?limit=10`
  - liefert die letzten protokollierten Laeufe (neueste zuerst)

- `POST /api/commissioning/evidence`
  - speichert einen manuellen Nachweis fuer einen einzelnen Testfall
  - erwartet `testId`, `status`, `operator` sowie optional `evidenceRef`, `notes`, `documentationChecked`
  - schreibt jeden Nachweis als JSON-Zeile in `python_admin/logs/commissioning_evidence.jsonl`

- `GET /api/commissioning/evidence?limit=80`
  - liefert die letzten protokollierten Nachweise (neueste zuerst)
  - enthaelt zusaetzlich `latestByTestId`, damit die UI pro Testfall den letzten Nachweisstatus direkt darstellen kann

- `GET /api/qa/catalog`
  - liefert den kanonischen QA-Katalog als Seed-Struktur fuer Android-Matrix, Suite-Inventar, Repo-Test-Inventar und priorisierten Automatisierungs-Backlog
  - kombiniert den versionierten Katalog aus `qa/catalog/` mit der bestehenden Suite- und Registersicht

- `GET /api/qa/android-matrix`
  - liefert die standardisierte Android-10-bis-16-Testmatrix mit API-Levels und Coverage-Tiers

- `GET /api/qa/device-profiles`
  - liefert standardisierte Einzelgeraet- und Zwei-Geraete-Profile fuer Emulator- und QA-Hosts

- `GET /api/qa/dual-device-scenarios`
  - liefert priorisierte Zwei-Geraete-Szenarien mit Rollen, Fehlerfaellen und Suite-Hinweisen

- `GET /api/qa/emulators`
  - liefert den Status der lokalen Android-SDK-/Emulator-Umgebung, vorhandene AVDs, laufende Emulatoren, aktive Reservierungen und den aus dem QA-Katalog abgeleiteten Matrixplan

- `GET /api/qa/emulators/running`
  - liefert nur die aktuell ueber ADB sichtbaren laufenden Emulatoren

- `GET /api/qa/emulators/reservations`
  - liefert aktive Emulator-Reservierungen fuer Matrix- und Zwei-Geraete-Laeufe

- `POST /api/qa/emulators/reservations`
  - reserviert ein standardisiertes Profil fuer eine Android-Version mit Owner, Zweck und TTL

- `POST /api/qa/emulators/start`
  - startet eine vorhandene AVD im lokalen Emulator-Labor headless aus dem Python-Operator heraus

- `POST /api/qa/emulators/stop`
  - beendet einen laufenden Emulator ueber `adb emu kill`

- `POST /api/qa/emulators/release`
  - gibt eine vorhandene Emulator-Reservierung wieder frei

## QA-Register-Semantik

- `blockingForRelease` markiert Eintraege, die fachlich fuer einen Go-Live relevant sind.
- `staleEvidence` wird fuer manuelle oder dokumentierte Checks gesetzt, wenn der letzte Nachweis aelter als das definierte Stale-Fenster ist.
- In der Operator-Sicht gilt ein Release-Blocker nur dann als sauber geschlossen, wenn ein aktueller PASS vorliegt. Ein veralteter PASS-Nachweis wird daher weiter als offener Handlungsbedarf behandelt.
- `Unsupported / Not Yet Mapped` kennzeichnet inventarisierte Repo-Tests ohne Zuordnung zu einer direkt ausfuehrbaren Suite. Diese Eintraege sind bewusst sichtbar, um Automationsluecken nicht zu verdecken.
- Fuer iOS-XCTest-Dateien aus `iosMasterApp/Tests` und `iosChildApp/Tests` existieren jetzt explizite externe QA-Suites (`ios-xctest-parent`, `ios-xctest-child`). Diese werden auf Windows bewusst nicht lokal gestartet, sondern nach externem macOS-/Xcode-Lauf per Evidenz im QA-Register protokolliert.

Timeout fuer Kommandoausfuehrungen kann mit `MINIMASTER_COMMAND_TIMEOUT_SEC` konfiguriert werden (Standard: `1800` Sekunden).
