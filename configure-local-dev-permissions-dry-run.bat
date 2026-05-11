@echo off
setlocal

REM MiniMaster local development permission helper - dry run
REM This file does not apply changes. It only shows what would be changed.

cd /d "%~dp0"

where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-local-dev-permissions.ps1" -WorkspaceRoot "%~dp0"
  goto :done
)

where powershell >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\configure-local-dev-permissions.ps1" -WorkspaceRoot "%~dp0"
  goto :done
)

echo Neither pwsh nor powershell was found.
exit /b 1

:done
echo.
echo Dry run completed. No changes were applied.
pause
