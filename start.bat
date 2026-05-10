@echo off
setlocal
cd /d "%~dp0"

echo MiniMaster Betriebszentrale - Start
echo.

rem Python finden: erst .venv, dann Systeminstallation
set "PY=python"
if exist ".venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"

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

rem Kurz warten, damit der Server hochfahren kann
timeout /t 2 /nobreak > nul

rem Admin-Panel ueber den Python-Server oeffnen
echo Oeffne Admin-Panel...
start "" "http://127.0.0.1:8765/admin-panel/"

endlocal
