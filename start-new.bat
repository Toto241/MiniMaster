@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem MiniMaster Windows starter for the corrected Admin-Panel / QA automation flow.
rem This file intentionally does not create or use a parallel Admin Panel UI.
rem It starts from the existing repository root and offers the current automation entry points.

cd /d "%~dp0"

echo.
echo ============================================================
echo   MiniMaster - Start New QA/Admin Automation
echo ============================================================
echo   Repository: %CD%
echo.

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm wurde nicht gefunden. Bitte Node.js 22 installieren und erneut starten.
    pause
    exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] python wurde nicht gefunden. Bitte Python installieren und erneut starten.
    pause
    exit /b 1
)

if not exist "package.json" (
    echo [ERROR] package.json wurde nicht gefunden. Diese Datei muss im Repository-Root liegen.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [INFO] node_modules fehlt. Fuehre npm install aus ...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install ist fehlgeschlagen.
        pause
        exit /b 1
    )
)

:menu
echo.
echo Was soll gestartet werden?
echo.
echo   [1] Admin-QA-Audit ausfuehren
echo   [2] Fertigungsstandsanalyse ausfuehren
echo   [3] Vollstaendige Readiness-Validierung ausfuehren
echo   [4] Zentrale Testautomation: Suites auflisten
echo   [5] Zentrale Testautomation: Inventar anzeigen
echo   [6] Desktop Operator/Admin-Panel starten
echo   [7] Backend-Tests starten
echo   [8] Android Host-Tests starten
echo   [9] Device-/Emulator-Tests starten
echo   [0] Beenden
echo.
set /p choice="Auswahl: "

if "%choice%"=="1" goto adminqa
if "%choice%"=="2" goto fertigung
if "%choice%"=="3" goto readiness
if "%choice%"=="4" goto list
if "%choice%"=="5" goto inventory
if "%choice%"=="6" goto desktop
if "%choice%"=="7" goto backend
if "%choice%"=="8" goto android
if "%choice%"=="9" goto device
if "%choice%"=="0" goto end

echo [WARN] Ungueltige Auswahl.
goto menu

:adminqa
echo.
echo [RUN] Admin-QA-Audit ...
call npm run analyze:admin-qa
goto done

:fertigung
echo.
echo [RUN] Fertigungsstandsanalyse ...
call npm run analyze:fertigungsstand
goto done

:readiness
echo.
echo [RUN] Vollstaendige Readiness-Validierung ...
call npm run validate:readiness
goto done

:list
echo.
echo [RUN] Test-Suites auflisten ...
python scripts\test_automation.py --list
goto done

:inventory
echo.
echo [RUN] Test-Inventar anzeigen ...
python scripts\test_automation.py --inventory
goto done

:desktop
echo.
echo [RUN] Desktop Operator/Admin-Panel starten ...
call npm run desktop-operator
goto done

:backend
echo.
echo [RUN] Backend-Testgruppe ...
python scripts\test_automation.py --group backend --continue-on-fail
goto done

:android
echo.
echo [RUN] Android Host-Testgruppe ...
python scripts\test_automation.py --group android --continue-on-fail
goto done

:device
echo.
echo [RUN] Device-/Emulator-Testgruppe ...
echo [HINWEIS] Dafuer muss ein Android-Emulator oder Geraet per adb verbunden sein.
python scripts\test_automation.py --group device --continue-on-fail
goto done

:done
set rc=%ERRORLEVEL%
echo.
echo ------------------------------------------------------------
echo Vorgang beendet mit Exit-Code: %rc%
echo ------------------------------------------------------------
echo.
pause
goto menu

:end
echo Beendet.
endlocal
exit /b 0
