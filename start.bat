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
echo eintragen und in .env / admin-panel/firebase-config.js uebertragen?
echo (Druecken Sie ENTER ohne Eingabe, um direkt das Admin-Panel zu oeffnen.)
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

:open_panel
rem Admin-Panel ueber den Python-Server oeffnen
echo Oeffne Admin-Panel unter http://127.0.0.1:8765/admin-panel/ ...
start "" "http://127.0.0.1:8765/admin-panel/"

endlocal
