# QA Release Workspace

Der QA Release Workspace erweitert das bestehende Admin-Panel um eine fokussierte Release-Leitstandsansicht innerhalb des vorhandenen QA-Tabs.

## Ziel

- offene Release-Blocker aus dem bestehenden Testregister verdichtet sichtbar machen
- laufende Jobs, Self-Healing, Agenten-Synthese und Emulatorstatus in einer Arbeitsfläche zusammenführen
- Copy-/Issue-/AI-Formate ohne manuelles Zusammensuchen bereitstellen
- vorhandene Suite-, Evidence- und Emulator-Mechanik wiederverwenden statt neue Parallelpfade aufzubauen

## Datenquellen

- `GET /api/testing/register`
- `GET /api/suites/history`
- `GET /api/qa/emulators`
- `GET /api/qa/self-healing/status`
- `GET /api/qa/release-workspace`

## Technische Bausteine

- Frontend-Rendering: [admin-panel/app.js](admin-panel/app.js)
- Pure Helper: [admin-panel/modules/tabs/qa-release-workspace.js](admin-panel/modules/tabs/qa-release-workspace.js)
- Python-Aggregation: [python_admin/app.py](python_admin/app.py)
- PowerShell-Automation: [scripts/qa-release-workspace.ps1](scripts/qa-release-workspace.ps1)

## Agentenbild

Der Workspace zeigt ein deterministisches 5-Agenten-Bild auf Basis vorhandener Laufzeitdaten:

- `requirement-mapper`
- `validator`
- `analyzer`
- `gap-closer`
- `synthesizer`

Die Agenten laufen aktuell regelbasiert über vorhandene Register-, Queue-, Emulator- und Self-Healing-Daten. Es wird bewusst kein zweites Agenten-Backend aufgebaut.

## Operator-Flow

1. Workspace laden
2. Release-Blocker auswählen
3. nächste Aktion ausführen oder Blocker in Issue-/AI-/Debug-Format kopieren
4. nach Aktion Workspace neu laden

## PowerShell

Beispiele:

```powershell
pwsh -File scripts/qa-release-workspace.ps1 -Format Summary
pwsh -File scripts/qa-release-workspace.ps1 -Format GitHub -BlockerId ma-subscription-check
pwsh -File scripts/qa-release-workspace.ps1 -Format AI -OutFile build/test-automation/release-blocker-ai.txt
```