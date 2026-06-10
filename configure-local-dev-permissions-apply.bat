@echo off
setlocal

REM Local development permission helper - apply mode
REM Run this file as administrator for full functionality.

pushd "%~dp0" || exit /b 1

echo ============================================================
echo Local Development Permission Configuration
echo ============================================================
echo.
echo This script can:
echo.
echo  - Configure PowerShell execution policy
echo  - Add Windows Defender exclusions
echo  - Configure GitHub CLI Git integration
echo  - Create VS Code workspace settings
echo  - Optionally disable Controlled Folder Access
echo.

choice /M "Continue and apply changes"
if errorlevel 2 (
  popd
  exit /b 0
)

set SCRIPT_ARGS=-Apply -WorkspaceRoot . -AddDefenderExclusions -ConfigureGitHubCli -ConfigureVSCodeSettings

choice /M "Disable Windows Defender Controlled Folder Access"
if errorlevel 1 set SCRIPT_ARGS=%SCRIPT_ARGS% -DisableControlledFolderAccess

where pwsh >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-local-dev-permissions.ps1" %SCRIPT_ARGS%
  goto :done
)

where powershell >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\configure-local-dev-permissions.ps1" %SCRIPT_ARGS%
  goto :done
)

echo Neither pwsh nor powershell was found.
popd
exit /b 1

:done
echo.
echo Configuration completed.
popd
pause
