@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PY=python"
if exist ".venv\Scripts\python.exe" set "PY=%~dp0.venv\Scripts\python.exe"

if /I "%~1"=="--doctor" goto doctor
if /I "%~1"=="doctor" goto doctor
if /I "%~1"=="--preflight" goto preflight
if /I "%~1"=="preflight" goto preflight
if /I "%~1"=="--start" goto start_panel
if /I "%~1"=="start" goto start_panel
if /I "%~1"=="--help" goto usage
if /I "%~1"=="help" goto usage

echo MiniMaster Setup
echo.
"%PY%" "%~dp0scripts\setup_init.py"
exit /b %ERRORLEVEL%

:doctor
echo MiniMaster Release Doctor
echo.
"%PY%" "%~dp0scripts\release_doctor.py"
exit /b %ERRORLEVEL%

:preflight
"%PY%" "%~dp0scripts\preflight.py"
exit /b %ERRORLEVEL%

:start_panel
call "%~dp0start.bat"
exit /b %ERRORLEVEL%

:usage
echo Usage:
echo   Setup.bat              Run local setup wizard
echo   Setup.bat --doctor     Generate build\release-doctor\latest.json/.md
echo   Setup.bat --preflight  Run setup preflight checks
echo   Setup.bat --start      Start the Admin Panel
exit /b 0
