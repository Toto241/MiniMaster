# MiniMaster Python Admin

Python-Webanwendung fuer das bestehende Admin-Panel.

## Funktionen

- liefert das bisherige `admin-panel/` direkt ueber Python aus
- stellt eine sichere JSON-API fuer direkte CLI-/PowerShell-Ausfuehrung bereit
- fuehrt die bisherigen PowerShell-Runner (`run-usb-tests.ps1`, `run-dual-device-commissioning.ps1`, `generate-debug-token.ps1`, `revalidate-release-gates.ps1`) direkt ueber `pwsh` aus, solange sie ueber das Admin-Panel angefordert werden

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
