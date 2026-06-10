@echo off
setlocal

REM Local development permission helper - dry run
REM This file does not apply changes. It only shows what would be changed.

pushd "%~dp0" || exit /b 1

where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-local-dev-permissions.ps1" -WorkspaceRoot "."
  goto :done
)

where powershell >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-local-dev-permissions.ps1" -WorkspaceRoot "."
  goto :done
)

echo Neither pwsh nor powershell was found.
popd
exit /b 1

:done
echo.
echo Dry run completed. No changes were applied.
popd
pause
