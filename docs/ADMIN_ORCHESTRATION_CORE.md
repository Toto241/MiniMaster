# Admin Orchestration Core

## Zweck

Der Python-Operator erweitert den bestehenden QA- und Admin-Leitstand um einen zentralen Job-Lifecycle. Testläufe, Agentenanalysen und Emulator-Aktionen werden darüber einheitlich eingereiht, ausgeführt, protokolliert und im Admin-Panel sichtbar gemacht.

## Kernmodule

- `python_admin/app.py`
  Zentrales In-Memory-Job-System mit Queue, Worker, Job-Historie, Agent-Core und Release-Workspace-Aggregation.
- `admin-panel/app.js`
  Release-Workspace mit Job-Register, Fehlerzentrum, Copy-Funktion und Agenten-Start aus dem UI.
- `admin-panel/modules/tabs/qa-release-workspace.js`
  ViewModel für Release-Workspace-Metriken, Jobs, Fehler und Agent-Core-Daten.
- `scripts/emulator_manager.py`
  Emulator-Reservierungen, AVD-Verwaltung und Labor-Übersicht.
- `scripts/qa-emulator-automation.ps1`
  Windows-Operationsskript für Emulator-Start, Stopp, APK-Installation, Status und Log-Sammlung.

## Zentrale Datenmodelle

### Job

- `jobId`
- `type`: `test | agent | emulator | system`
- `status`: `pending | queued | running | success | failed | retry | cancelled`
- `priority`
- `label`
- `payload`
- `result`
- `createdAt`
- `startedAt`
- `finishedAt`
- `retryCount`
- `maxRetries`
- `logs`
- `error`

### Fehlerobjekt

Fehler werden aus fehlgeschlagenen Jobs und offenen Self-Healing-Befunden abgeleitet.

- `errorId`
- `sourceType`
- `sourceId`
- `title`
- `message`
- `stacktrace`
- `timestamp`
- `severity`
- `context`
- `relatedJobId`

### Agent-Core

Deterministische Kernrollen:

- `analyzer`
- `validator`
- `synthesizer`

Agentenläufe werden als `agent`-Jobs ausgeführt. Das Resultat enthält:

- `summary`
- `findings`
- `evidence`
- `risks`
- `recommendations`
- `confidence`
- `agentRuns`

## Ablauf

1. UI oder HTTP-API erzeugt einen Job.
2. Der Job wird in die In-Memory-Queue eingereiht und in `python_admin/logs/job_runs.jsonl` protokolliert.
3. Der Worker verarbeitet den Job seriell.
4. Bestehende Runner für Suite-, USB-, Dual-Device- oder Emulator-Flows bleiben erhalten und werden über den Job-Lifecycle aufgerufen.
5. Fehlgeschlagene Jobs erzeugen zentrale Fehlerobjekte.
6. Das Admin-Panel zeigt Jobs, Queue, Fehler und Agentenstatus im QA Release Workspace.
7. Fehler können kompakt oder im Debug-Format kopiert und direkt zur Agenten-Analyse eingereiht werden.

## Relevante Endpunkte

- `GET /api/qa/release-workspace`
- `GET /api/jobs`
- `GET /api/jobs/{jobId}`
- `GET /api/jobs/errors`
- `GET /api/agents/status`
- `POST /api/jobs/retry`
- `POST /api/jobs/cancel`
- `POST /api/agents/run`
- bestehende Suite- und Emulator-Endpunkte bleiben erhalten und erzeugen nun Jobs

## Windows-Emulator-Skript

Beispiele:

```powershell
pwsh -File scripts/qa-emulator-automation.ps1 -Action status
pwsh -File scripts/qa-emulator-automation.ps1 -Action start -AvdName Pixel_8_API_34_QA -Headless
pwsh -File scripts/qa-emulator-automation.ps1 -Action install -Serial emulator-5554 -ApkPath .\masterApp\build\outputs\apk\debug\masterApp-debug.apk
pwsh -File scripts/qa-emulator-automation.ps1 -Action collect-logs -Serial emulator-5554
pwsh -File scripts/qa-emulator-automation.ps1 -Action stop -Serial emulator-5554
```

## Grenzen der aktuellen Ausbaustufe

- Queue und Job-Store sind pro Python-Operator-Prozess in Memory plus JSONL-Historie.
- Kein verteilter Worker und keine harte Persistenz über mehrere Operator-Instanzen.
- Agent-Core ist deterministisch und lokal; keine echte LLM-Anbindung in diesem Pfad.
- Emulator-Jobs werden asynchron eingereiht; Statusänderungen sind im Release-Workspace und Job-Register sichtbar, nicht als synchroner HTTP-Blocker.
