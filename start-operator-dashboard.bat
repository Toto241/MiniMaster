@echo off
setlocal

REM MiniMaster operator dashboard launcher

cd /d "%~dp0"

echo ============================================================
echo Starting MiniMaster Operator Dashboard
echo ============================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
  echo Python was not found in PATH.
  pause
  exit /b 1
)

start "MiniMaster Operator Dashboard" cmd /k python python_admin\app.py

timeout /t 3 >nul

start http://127.0.0.1:8765/admin-panel/simple.html

echo.
echo Operator dashboard started.
echo.
pause
