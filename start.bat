@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo MiniMaster Betriebszentrale - Start
echo.

rem Python finden: erst .venv, dann Systeminstallation
set "PY=python"
if exist ".venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"

rem Python-Version pruefen (mind. 3.8 erforderlich)
"%PY%" -c "import sys; sys.exit(0 if sys.version_info >= (3,8) else 1)" >nul 2>nul
if errorlevel 1 (
    echo [FEHLER] Python 3.8 oder hoeher wird benoetigt.
    "%PY%" --version 2>&1
    pause
    exit /b 1
)

rem ── Pre-Flight ──────────────────────────────────────────────────
rem Mit --skip-preflight kann uebersprungen werden. Pflichtfehler werden
rem nur als Warnung ausgegeben, der Start wird nicht hart abgebrochen.
if /I "%1"=="--preflight" (
    "%PY%" "%~dp0scripts\preflight.py"
    exit /b %ERRORLEVEL%
)
if /I "%1"=="--skip-preflight" goto skip_preflight
echo --- Pre-Flight ---
"%PY%" "%~dp0scripts\preflight.py"
if errorlevel 1 (
    echo.
    echo [WARN] Pre-Flight meldet Pflicht-Fehler. Start trotzdem fortsetzen?
    set "_CONT="
    set /p _CONT=Fortfahren? [y/N]:
    if /I not "!_CONT!"=="y" if /I not "!_CONT!"=="yes" if /I not "!_CONT!"=="j" if /I not "!_CONT!"=="ja" (
        echo Abgebrochen.
        endlocal
        exit /b 1
    )
)
echo.
:skip_preflight

rem Pruefen ob Port 8765 bereits belegt ist
netstat -an 2>nul | findstr /C:":8765 " >nul
if not errorlevel 1 (
    echo [INFO] Port 8765 ist bereits belegt - moeglichweise laeuft der Server schon.
    echo        Das Admin-Panel wird direkt geoeffnet.
    goto open_panel
)

rem Optional: Firebase-/Secret-Konfiguration vor dem Start eintragen
echo.
echo Moechten Sie Firebase- und Secret-Konfiguration jetzt per Eingabeaufforderung
echo eintragen?
echo.
echo   - Firebase-Web-Konfig (API-Key, Project-ID, ...)  -^> .env + firebase-config.js
echo   - Optionale Secrets (GEMINI_API_KEY, OPENAI_API_KEY, ...) -^> .env
echo   - Pflicht-Dateien (google-services.json, serviceAccountKey.json)
echo       Tipp: Datei aus dem Explorer in dieses Fenster ziehen, um den
echo       vollstaendigen Pfad einzufuegen. Vorschlaege aus Downloads/ werden
echo       automatisch angeboten.
echo.
echo (Druecken Sie ENTER ohne Eingabe, um direkt das Admin-Panel zu oeffnen.
echo  Das Admin-Panel hat dieselben Felder + Datei-Upload unter "Uebertragen".)
set "_RUN_CONFIG_CLI="
set /p _RUN_CONFIG_CLI=Konfiguration jetzt eintragen? [j/N]:
if /I "%_RUN_CONFIG_CLI%"=="j" goto run_config_cli
if /I "%_RUN_CONFIG_CLI%"=="ja" goto run_config_cli
if /I "%_RUN_CONFIG_CLI%"=="y" goto run_config_cli
if /I "%_RUN_CONFIG_CLI%"=="yes" goto run_config_cli
goto skip_config_cli

:run_config_cli
echo.
echo Starte Konfigurations-Assistent...
"%PY%" -m scripts.config_transfer_cli
echo.

:skip_config_cli

rem Python-Admin-Server im Hintergrund starten (minimiertes Fenster)
echo Starte Python-Admin-Server auf http://127.0.0.1:8765 ...
start "MiniMaster-Admin" /MIN "%PY%" -m python_admin.app

rem Auf Server-Bereitschaft warten (max. 20 Sekunden, 1-Sekunden-Intervall)
set _READY=0
set _TRIES=0
:wait_loop
timeout /t 1 /nobreak >nul
set /a _TRIES+=1
curl -sf "http://127.0.0.1:8765/api/runtime-info" >nul 2>nul
if not errorlevel 1 (
    set _READY=1
    goto wait_done
)
if !_TRIES! lss 20 goto wait_loop

:wait_done
if "!_READY!"=="0" (
    echo [WARNUNG] Server antwortet nach 20 Sekunden nicht.
    echo           Der Browser wird trotzdem geoeffnet - moeglichweise startet der Server noch.
    echo           Pruefen Sie das Konsolenfenster "MiniMaster-Admin" auf Fehlermeldungen.
)

rem ── Acceptance-Modi ───────────────────────────────────────────────
if /I "%1"=="--acceptance" goto run_acceptance
if /I "%1"=="--quick-check" goto run_quick_check
if /I "%1"=="--coverage" goto run_coverage
goto open_panel

:run_acceptance
echo.
echo [ABNAHME] Starte vollstaendigen Acceptance-Run ...
curl -sf -X POST -H "Content-Type: application/json" -d "{\"mode\":\"full\"}" "http://127.0.0.1:8765/api/acceptance/start" > "%TEMP%\mm_acceptance.json" 2>nul
if errorlevel 1 (
    echo [FEHLER] Acceptance-Start fehlgeschlagen.
    goto open_panel
)
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%TEMP%\mm_acceptance.json' | ConvertFrom-Json).runId"') do set "RUN_ID=%%a"
echo Run-ID: %RUN_ID%
:acc_wait_loop
timeout /t 5 /nobreak >nul
curl -sf "http://127.0.0.1:8765/api/acceptance/status/%RUN_ID%" > "%TEMP%\mm_status.json" 2>nul
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%TEMP%\mm_status.json' | ConvertFrom-Json).status"') do set "ACC_STATUS=%%a"
if "%ACC_STATUS%"=="running" goto acc_wait_loop
echo.
echo [ABNAHME] Run abgeschlossen: %ACC_STATUS%
curl -sf "http://127.0.0.1:8765/api/acceptance/report/%RUN_ID%" > "%TEMP%\mm_report.json" 2>nul
type "%TEMP%\mm_report.json"
start "" "http://127.0.0.1:8765/admin-panel/#acceptance-tab"
endlocal
exit /b 0

:run_quick_check
echo.
echo [QUICK] Starte Quick-Check (Lint + Core-Suites) ...
curl -sf -X POST -H "Content-Type: application/json" -d "{\"mode\":\"quick\"}" "http://127.0.0.1:8765/api/acceptance/start" > "%TEMP%\mm_quick.json" 2>nul
if errorlevel 1 (
    echo [FEHLER] Quick-Check Start fehlgeschlagen.
    goto open_panel
)
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%TEMP%\mm_quick.json' | ConvertFrom-Json).runId"') do set "RUN_ID=%%a"
:quick_wait_loop
timeout /t 3 /nobreak >nul
curl -sf "http://127.0.0.1:8765/api/acceptance/status/%RUN_ID%" > "%TEMP%\mm_status.json" 2>nul
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%TEMP%\mm_status.json' | ConvertFrom-Json).status"') do set "ACC_STATUS=%%a"
if "%ACC_STATUS%"=="running" goto quick_wait_loop
echo.
echo [QUICK] Abgeschlossen: %ACC_STATUS%
curl -sf "http://127.0.0.1:8765/api/acceptance/report/%RUN_ID%" > "%TEMP%\mm_report.json" 2>nul
powershell -NoProfile -Command "Get-Content '%TEMP%\mm_report.json' | ConvertFrom-Json | Select-Object -Property runId, status, results | Format-List"
endlocal
exit /b 0

:run_coverage
echo.
echo [COVERAGE] Starte Full-Run mit Coverage ...
curl -sf -X POST -H "Content-Type: application/json" -d "{\"mode\":\"full\",\"coverage\":true}" "http://127.0.0.1:8765/api/acceptance/start" > "%TEMP%\mm_cov.json" 2>nul
if errorlevel 1 (
    echo [FEHLER] Coverage-Run Start fehlgeschlagen.
    goto open_panel
)
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%TEMP%\mm_cov.json' | ConvertFrom-Json).runId"') do set "RUN_ID=%%a"
:cov_wait_loop
timeout /t 5 /nobreak >nul
curl -sf "http://127.0.0.1:8765/api/acceptance/status/%RUN_ID%" > "%TEMP%\mm_status.json" 2>nul
for /f "tokens=*" %%a in ('powershell -NoProfile -Command "(Get-Content '%TEMP%\mm_status.json' | ConvertFrom-Json).status"') do set "ACC_STATUS=%%a"
if "%ACC_STATUS%"=="running" goto cov_wait_loop
echo.
echo [COVERAGE] Abgeschlossen: %ACC_STATUS%
curl -sf "http://127.0.0.1:8765/api/acceptance/report/%RUN_ID%" > "%TEMP%\mm_report.json" 2>nul
powershell -NoProfile -Command "Get-Content '%TEMP%\mm_report.json' | ConvertFrom-Json | Select-Object -Property runId, status, results | Format-List"
start "" "http://127.0.0.1:8765/admin-panel/#acceptance-tab"
endlocal
exit /b 0

:open_panel
rem Admin-Panel ueber den Python-Server oeffnen
echo Oeffne Admin-Panel unter http://127.0.0.1:8765/admin-panel/ ...
start "" "http://127.0.0.1:8765/admin-panel/"

endlocal
