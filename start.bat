@echo off
setlocal
cd /d "%~dp0"

echo MiniMaster Betriebszentrale – Start
echo.

rem Python finden: erst .venv, dann Systeminstallation
set "PY=python"
if exist ".venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"

rem Python-Admin-Server im Hintergrund starten (minimiertes Fenster)
echo Starte Python-Admin-Server auf http://127.0.0.1:8765 ...
start "MiniMaster-Admin" /MIN "%PY%" -m python_admin.app

rem Kurz warten, damit der Server hochfahren kann
timeout /t 2 /nobreak > nul

rem Admin-Panel über den Python-Server öffnen
echo Oeffne Admin-Panel...
start "" "http://127.0.0.1:8765/admin-panel/"

endlocal
