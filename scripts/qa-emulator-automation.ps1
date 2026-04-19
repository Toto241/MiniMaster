param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('status', 'start', 'stop', 'install', 'collect-logs')]
    [string]$Action,

    [string]$AvdName,
    [string]$Serial,
    [string]$ApkPath,
    [string]$AndroidSdkRoot = $env:ANDROID_SDK_ROOT,
    [string]$LogDir = (Join-Path $PSScriptRoot '..\build\emulator-automation'),
    [int]$TimeoutSec = 240,
    [switch]$Headless,
    [switch]$WipeData,
    [switch]$NoSnapshot = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Log {
    param(
        [string]$Level,
        [string]$Message
    )
    $timestamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    Write-Host "[$timestamp][$Level] $Message"
}

function Resolve-AndroidSdkRoot {
    if ($AndroidSdkRoot -and (Test-Path $AndroidSdkRoot)) {
        return $AndroidSdkRoot
    }
    foreach ($candidate in @($env:ANDROID_HOME, "$env:LOCALAPPDATA\Android\Sdk")) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }
    throw 'Android SDK konnte nicht gefunden werden. Setze ANDROID_SDK_ROOT oder ANDROID_HOME.'
}

function Get-ToolPath {
    param(
        [string]$SdkRoot,
        [string[]]$Candidates
    )
    foreach ($candidate in $Candidates) {
        $toolPath = Join-Path $SdkRoot $candidate
        if (Test-Path $toolPath) {
            return $toolPath
        }
    }
    throw "Tool nicht gefunden: $($Candidates -join ', ')"
}

function Invoke-Adb {
    param(
        [string]$AdbPath,
        [string[]]$Arguments
    )
    & $AdbPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "adb $($Arguments -join ' ') fehlgeschlagen (ExitCode $LASTEXITCODE)."
    }
}

function Get-RunningEmulators {
    param([string]$AdbPath)
    $output = & $AdbPath devices -l 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "adb devices -l fehlgeschlagen: $output"
    }
    $devices = @()
    foreach ($line in ($output -split "`r?`n")) {
        if ($line -match '^(emulator-\d+)\s+(\S+)') {
            $devices += [PSCustomObject]@{
                Serial = $Matches[1]
                State = $Matches[2]
                Raw = $line.Trim()
            }
        }
    }
    return $devices
}

function Wait-ForEmulator {
    param(
        [string]$AdbPath,
        [string]$TargetSerial,
        [int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $running = Get-RunningEmulators -AdbPath $AdbPath
        if ($running | Where-Object { $_.Serial -eq $TargetSerial -and $_.State -eq 'device' }) {
            Write-Log 'INFO' "Emulator $TargetSerial ist bereit."
            return
        }
        Start-Sleep -Milliseconds 750
    }
    throw "Timeout: Emulator $TargetSerial wurde innerhalb von $TimeoutSeconds Sekunden nicht bereit."
}

$sdkRoot = Resolve-AndroidSdkRoot
$adbPath = Get-ToolPath -SdkRoot $sdkRoot -Candidates @('platform-tools\adb.exe')
$emulatorPath = Get-ToolPath -SdkRoot $sdkRoot -Candidates @('emulator\emulator.exe')

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

switch ($Action) {
    'status' {
        $running = Get-RunningEmulators -AdbPath $adbPath
        Write-Log 'INFO' ("Laufende Emulatoren: {0}" -f $running.Count)
        $running | ConvertTo-Json -Depth 4
    }
    'start' {
        if (-not $AvdName) {
            throw 'Für start ist -AvdName erforderlich.'
        }
        $arguments = @('-avd', $AvdName)
        if ($Headless) { $arguments += '-no-window' }
        if ($WipeData) { $arguments += '-wipe-data' }
        if ($NoSnapshot) { $arguments += '-no-snapshot' }
        Write-Log 'INFO' "Starte Emulator $AvdName"
        $process = Start-Process -FilePath $emulatorPath -ArgumentList $arguments -PassThru
        $targetSerial = if ($Serial) { $Serial } else { 'emulator-5554' }
        Wait-ForEmulator -AdbPath $adbPath -TargetSerial $targetSerial -TimeoutSeconds $TimeoutSec
        [PSCustomObject]@{
            started = $true
            avdName = $AvdName
            pid = $process.Id
            serial = $targetSerial
        } | ConvertTo-Json -Depth 4
    }
    'stop' {
        if (-not $Serial) {
            throw 'Für stop ist -Serial erforderlich.'
        }
        Write-Log 'INFO' "Beende Emulator $Serial"
        Invoke-Adb -AdbPath $adbPath -Arguments @('-s', $Serial, 'emu', 'kill')
        [PSCustomObject]@{ stopped = $true; serial = $Serial } | ConvertTo-Json -Depth 4
    }
    'install' {
        if (-not $Serial) {
            throw 'Für install ist -Serial erforderlich.'
        }
        if (-not $ApkPath -or -not (Test-Path $ApkPath)) {
            throw 'Für install ist ein gültiger -ApkPath erforderlich.'
        }
        Write-Log 'INFO' "Installiere APK $ApkPath auf $Serial"
        Invoke-Adb -AdbPath $adbPath -Arguments @('-s', $Serial, 'install', '-r', $ApkPath)
        [PSCustomObject]@{ installed = $true; serial = $Serial; apkPath = $ApkPath } | ConvertTo-Json -Depth 4
    }
    'collect-logs' {
        if (-not $Serial) {
            throw 'Für collect-logs ist -Serial erforderlich.'
        }
        $timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
        $outputPath = Join-Path $LogDir "logcat-$Serial-$timestamp.txt"
        Write-Log 'INFO' "Sammle Logcat nach $outputPath"
        $output = & $adbPath -s $Serial logcat -d 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "adb logcat -d fehlgeschlagen: $output"
        }
        Set-Content -Path $outputPath -Value $output -Encoding UTF8
        [PSCustomObject]@{ collected = $true; serial = $Serial; logFile = $outputPath } | ConvertTo-Json -Depth 4
    }
}
