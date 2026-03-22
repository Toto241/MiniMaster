<#
.SYNOPSIS
    Vollautomatischer USB-Testlauf für die MiniMaster Android-Apps.

.DESCRIPTION
    Führt den vollständigen Debug-Testlauf über ADB durch:
      1. Gerät prüfen (adb devices)
      2. Challenge anfordern (DEBUG_GET_CHALLENGE)
      3. HMAC-Token generieren (generate-debug-token.ps1)
      4. Debug-Session aktivieren (DEBUG_ACTIVATE)
      5. Instrumented Tests ausführen (connectedDebugAndroidTest)
      6. Debug-Session deaktivieren (DEBUG_DEACTIVATE)
      7. XML-Testergebnisse parsen
      8. Ampelausgabe (PASS / FAIL + Übersicht)

    Voraussetzungen:
      - ADB im PATH oder ANDROID_HOME gesetzt
      - USB-Debugging auf dem Gerät aktiviert
      - Secrets in local.properties gesetzt (debug.session.secret.master / .child)
      - Java und Gradle verfügbar

.PARAMETER AppId
    Target app: "master" (Eltern-App) oder "child" (Kinder-App).

.PARAMETER AdbSerial
    Geräte-Serial für ADB (z.B. "emulator-5554" oder "R58M12345"). "auto" = erstes Gerät.

.PARAMETER SkipActivation
    Überspringt Challenge/Aktivierung (z.B. wenn Session schon aktiv ist).

.PARAMETER TestFilter
    Optionaler Gradle-Testfilter, z.B. "com.minimaster.masterapp.MasterAppE2ETest".

.PARAMETER Suite
    Testsuite: "default" (alle Tests des Moduls) oder "commissioning" (vordefinierte Commissioning-Klassen).

.EXAMPLE
    pwsh -File scripts/run-usb-tests.ps1 -AppId master
    pwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial R58M12345
    pwsh -File scripts/run-usb-tests.ps1 -AppId master -SkipActivation
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("master", "child")]
    [string]$AppId,

    [Parameter(Mandatory = $false)]
    [string]$AdbSerial = "auto",

    [Parameter(Mandatory = $false)]
    [switch]$SkipActivation,

    [Parameter(Mandatory = $false)]
    [string]$TestFilter = "",

    [Parameter(Mandatory = $false)]
    [ValidateSet("default", "commissioning")]
    [string]$Suite = "default"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Helpers ───────────────────────────────────────────────────────────────────
function Write-Step([string]$msg) { Write-Host "`n▶  $msg" -ForegroundColor Cyan }
function Write-Ok([string]$msg)   { Write-Host "✔  $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "✘  $msg" -ForegroundColor Red }
function Write-Info([string]$msg) { Write-Host "   $msg" -ForegroundColor Gray }

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir
$gradleCmd = if ($IsWindows -or $env:OS -like "*Windows*") { ".\gradlew.bat" } else { "./gradlew" }

$appModule  = if ($AppId -eq "master") { ":masterApp" } else { ":childApp" }
$appPackage = if ($AppId -eq "master") { "com.minimaster.masterapp" } else { "com.google.pairing" }

$challengeTag = if ($AppId -eq "master") { "MINIMASTER_DEBUG_CHALLENGE" } else { "MINIMASTER_DEBUG_CHALLENGE_CHILD" }
$activateAction   = "$appPackage.DEBUG_ACTIVATE"
$deactivateAction = "$appPackage.DEBUG_DEACTIVATE"

$xmlResultsDir = Join-Path $repoRoot "$($AppId)App\build\outputs\androidTest-results\connected"

# ── Step 1: Gerät prüfen ──────────────────────────────────────────────────────
Write-Step "Schritt 1/7: ADB-Gerät prüfen"
$devices = & adb devices | Where-Object { $_ -match "\bdevice\b" -and $_ -notmatch "List of" }
if (-not $devices) {
    Write-Fail "Kein ADB-Gerät gefunden. USB-Kabel und USB-Debugging prüfen."
    exit 1
}

if ($AdbSerial -eq "auto") {
    # Use first available device
    $firstLine = $devices | Select-Object -First 1
    $script:adbTarget = ($firstLine -split "\s+")[0]
    Write-Ok "Gerät automatisch gewählt: $($script:adbTarget)"
} else {
    $script:adbTarget = $AdbSerial
    Write-Ok "Gerät: $script:adbTarget"
}

# ── Step 2-4: Challenge → Token → Aktivierung ────────────────────────────────
if (-not $SkipActivation) {
    Write-Step "Schritt 2/7: Challenge anfordern ($AppId)"
    & adb -s $script:adbTarget shell am broadcast -a "$appPackage.DEBUG_GET_CHALLENGE" | Out-Null
    Start-Sleep -Milliseconds 500

    # Read challenge from logcat (newest entry)
    $logLines = & adb -s $script:adbTarget logcat -s $challengeTag -d -T 1 2>&1
    $challengeLine = $logLines | Where-Object { $_ -match "CHALLENGE:" } | Select-Object -Last 1
    if (-not $challengeLine) {
        Write-Fail "Challenge nicht aus Logcat lesbar. Ist das Secret in local.properties gesetzt und die App installiert?"
        exit 1
    }
    $challenge = ($challengeLine -split "CHALLENGE:")[1].Trim()
    Write-Ok "Challenge: $challenge"

    Write-Step "Schritt 3/7: HMAC-Token generieren"
    $tokenOutput = & pwsh -File "$scriptDir\generate-debug-token.ps1" -AppId $AppId -Challenge $challenge 2>&1
    $token = ($tokenOutput | Where-Object { $_ -match "^[0-9a-f]{64}$" } | Select-Object -Last 1).Trim()
    if (-not $token) {
        Write-Fail "Token-Generierung fehlgeschlagen. Ausgabe:"
        $tokenOutput | ForEach-Object { Write-Info $_ }
        exit 1
    }
    Write-Ok "Token generiert."

    Write-Step "Schritt 4/7: Debug-Session aktivieren"
    & adb -s $script:adbTarget shell am broadcast -a $activateAction -e response $token | Out-Null
    Start-Sleep -Milliseconds 300
    $activationLog = & adb -s $script:adbTarget logcat -s "MINIMASTER_DEBUG$(if ($AppId -eq 'child') { '_CHILD' } else { '' })" -d -T 1 2>&1
    if ($activationLog -match "Session activated") {
        Write-Ok "Debug-Session aktiviert."
    } else {
        Write-Fail "Aktivierung fehlgeschlagen (Token ungültig oder vorherige Session ausgelaufen?)."
        Write-Info "Logcat: $activationLog"
        exit 1
    }
} else {
    Write-Info "Schritte 2-4 übersprungen (-SkipActivation)."
    $script:adbTarget = if ($AdbSerial -eq "auto") { $null } else { $AdbSerial }
}

# ── Step 5: Instrumented Tests ────────────────────────────────────────────────
Write-Step "Schritt 5/7: Instrumented Tests ausführen ($appModule)"

$testFiltersToRun = @()
if ($TestFilter) {
    $testFiltersToRun = @($TestFilter)
} elseif ($Suite -eq "commissioning") {
    if ($AppId -eq "master") {
        $testFiltersToRun = @(
            "com.minimaster.masterapp.MasterAppE2ETest",
            "com.minimaster.masterapp.CommissioningMasterPhase1UiTest",
            "com.minimaster.masterapp.CommissioningMasterUiFlowTest"
        )
    } else {
        $testFiltersToRun = @(
            "com.google.pairing.PairingScreenUITest",
            "com.google.pairing.DeepLinkE2ETest",
            "com.google.pairing.CommissioningChildUiFlowTest"
        )
    }
}

if (Test-Path $xmlResultsDir) {
    Remove-Item -Path $xmlResultsDir -Recurse -Force
}

$gradleExit = 0
$previousAndroidSerial = $env:ANDROID_SERIAL
$env:ANDROID_SERIAL = $script:adbTarget

Push-Location $repoRoot
try {
    if ($testFiltersToRun.Count -eq 0) {
        $gradleParams = @("${appModule}:connectedDebugAndroidTest")
        & $gradleCmd @gradleParams
        $gradleExit = $LASTEXITCODE
    } else {
        foreach ($filter in $testFiltersToRun) {
            Write-Info "Führe Testklasse aus: $filter"
            $gradleParams = @(
                "${appModule}:connectedDebugAndroidTest",
                "-Pandroid.testInstrumentationRunnerArguments.class=$filter"
            )
            & $gradleCmd @gradleParams
            if ($LASTEXITCODE -ne 0) {
                $gradleExit = $LASTEXITCODE
                break
            }
        }
    }
} finally {
    $env:ANDROID_SERIAL = $previousAndroidSerial
    Pop-Location
}

# ── Step 6: Session deaktivieren ──────────────────────────────────────────────
Write-Step "Schritt 6/7: Debug-Session deaktivieren"
& adb -s $script:adbTarget shell am broadcast -a $deactivateAction | Out-Null
Write-Ok "Session deaktiviert."

# ── Step 7: Ergebnisse parsen ─────────────────────────────────────────────────
Write-Step "Schritt 7/7: Testergebnisse auswerten"

$totalTests = 0
$failedTests = 0
$skippedTests = 0
$testDetails = @()

if (Test-Path $xmlResultsDir) {
    Get-ChildItem -Path $xmlResultsDir -Recurse -Filter "*.xml" | ForEach-Object {
        [xml]$xml = Get-Content $_.FullName
        $suites = @($xml.SelectNodes("//testsuite"))
        foreach ($suite in $suites) {
            $totalTests   += [int]($suite.tests   -as [int])
            $failedTests  += [int]($suite.failures -as [int]) + [int]($suite.errors -as [int])
            $skippedTests += [int]($suite.skipped  -as [int])

            $suite.SelectNodes(".//testcase") | ForEach-Object {
                $tc = $_
                $name   = "$($tc.classname).$($tc.name)"
                $failed = $tc.SelectNodes(".//failure | .//error").Count -gt 0
                if ($failed) {
                    $msg = $tc.SelectNodes(".//failure | .//error") | Select-Object -First 1 | ForEach-Object { $_.InnerText.Trim() -split "`n" | Select-Object -First 2 | Join-String -Separator " " }
                    $testDetails += [PSCustomObject]@{ Name = $name; Status = "FAIL"; Message = $msg }
                }
            }
        }
    }
} else {
    Write-Info "XML-Ergebnisverzeichnis nicht gefunden: $xmlResultsDir"
}

# ── Ampelausgabe ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "══════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "  TEST-ERGEBNISSE: $($AppId.ToUpper())-APP" -ForegroundColor White
Write-Host "══════════════════════════════════════════════" -ForegroundColor DarkGray

if ($totalTests -eq 0 -and $gradleExit -ne 0) {
    Write-Host "  🔴  BUILD/TEST FEHLER (keine XML-Ergebnisse)" -ForegroundColor Red
    Write-Host "  Gradle-Exit-Code: $gradleExit" -ForegroundColor Red
} elseif ($failedTests -gt 0 -or $gradleExit -ne 0) {
    Write-Host "  🔴  FEHLGESCHLAGEN" -ForegroundColor Red
    Write-Host "  Gesamt:        $totalTests" -ForegroundColor White
    Write-Host "  Fehlgeschlagen:$failedTests" -ForegroundColor Red
    Write-Host "  Übersprungen:  $skippedTests" -ForegroundColor Yellow
    if ($testDetails.Count -gt 0) {
        Write-Host ""
        Write-Host "  Fehler:" -ForegroundColor Red
        $testDetails | ForEach-Object {
            Write-Host "    ✘ $($_.Name)" -ForegroundColor Red
            if ($_.Message) { Write-Host "      $($_.Message)" -ForegroundColor DarkRed }
        }
    }
} else {
    Write-Host "  🟢  BESTANDEN" -ForegroundColor Green
    Write-Host "  Gesamt:       $totalTests" -ForegroundColor White
    Write-Host "  Bestanden:    $($totalTests - $failedTests - $skippedTests)" -ForegroundColor Green
    Write-Host "  Übersprungen: $skippedTests" -ForegroundColor Yellow
}

Write-Host "══════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host ""

exit $gradleExit
