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

Timeout fuer Kommandoausfuehrungen kann mit `MINIMASTER_COMMAND_TIMEOUT_SEC` konfiguriert werden (Standard: `1800` Sekunden).
