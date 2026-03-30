# install-swift-msvc-deps.ps1
# Installiert die fehlenden MSVC C++-Bibliotheken, die Swift on Windows zum Linken benötigt.
# AUSFÜHRUNG: Als Administrator starten (Rechtsklick → Als Administrator ausführen)
#
# Für VS Code Nutzer wichtig:
# - Du brauchst NICHT die Visual-Studio-IDE, aber die Microsoft C++ Build Tools.
# - Das Skript nutzt eine vorhandene VS/Build-Tools-Instanz oder installiert Build Tools via winget.
#
# Was installiert wird:
#   • Microsoft.VisualStudio.Workload.NativeDesktop (Desktop-Entwicklung mit C++)
#   • Microsoft.VisualStudio.Component.VC.Tools.x86.x64 (MSVC v143 Buildtools)
#   • Microsoft.VisualStudio.Component.Windows11SDK.26100 (Windows 11 SDK)
#
# Das behebt: lld-link: error: could not open 'msvcrt.lib' / 'oldnames.lib' / 'msvcprt.lib'

param(
    [switch]$DryRun,
    [switch]$UseWingetFallback
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptVersion = '2026-03-30.3'
Write-Host "install-swift-msvc-deps.ps1 Version: $scriptVersion"

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-IsAdministrator)) {
    Write-Warning 'Nicht als Administrator gestartet. Fordere UAC-Elevation an...'
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'))
    if ($DryRun) { $argList += '-DryRun' }
    Start-Process -FilePath 'pwsh' -ArgumentList $argList -Verb RunAs | Out-Null
    Write-Host 'UAC-Dialog geöffnet. Das Skript läuft nach Bestätigung im erhöhten Fenster weiter.'
    exit 0
}

$installer = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vs_installer.exe'
$vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
$workloadId = 'Microsoft.VisualStudio.Workload.NativeDesktop'
$componentVcTools = 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64'
$componentWinSdk = 'Microsoft.VisualStudio.Component.Windows11SDK.26100'
$buildToolsBootstrapperUrl = 'https://aka.ms/vs/17/release/vs_BuildTools.exe'

if (-not (Test-Path $installer)) {
    Write-Error "vs_installer.exe nicht gefunden unter: $installer"
    exit 1
}

if (-not (Test-Path $vswhere)) {
    Write-Error "vswhere.exe nicht gefunden unter: $vswhere"
    exit 1
}

$instances = & $vswhere -all -products * -format json | ConvertFrom-Json
$completeInstance = $instances | Where-Object { $_.isComplete -eq $true -and $_.installationPath } | Select-Object -First 1
$incompleteInstance = $instances | Where-Object { $_.isComplete -ne $true -and $_.installationPath } | Select-Object -First 1

function Convert-ExitCodeToHex {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Code
    )

    $u = [uint32]($Code -band 0xFFFFFFFF)
    return ('0x{0:X8}' -f $u)
}

function Invoke-VsModify {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallPath
    )

    Write-Host "Starte MSVC C++ Desktop-Workload Installation..."
    Write-Host "Installer : $installer"
    Write-Host "VS-Pfad   : $InstallPath"
    Write-Host "(Das kann 5-20 Minuten dauern, abhängig von der Internetgeschwindigkeit)"
    Write-Host ""

    if ($DryRun) {
        Write-Host "DRY RUN: Würde vorhandene Instanz modifizieren und Workload/Komponenten hinzufügen."
        return 0
    }

    $argList = @(
        'modify',
        '--installPath', $InstallPath,
        '--add', $workloadId,
        '--add', $componentVcTools,
        '--add', $componentWinSdk,
        '--quiet',
        '--norestart',
        '--force'
    )

    $proc = Start-Process -FilePath $installer -ArgumentList $argList -NoNewWindow -PassThru -Wait
    return $proc.ExitCode
}

function Invoke-BuildToolsInstallViaWinget {
    if (-not $UseWingetFallback) {
        Write-Host "Winget-Fallback deaktiviert (Standard)."
        return 1
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Error "winget nicht gefunden. Installiere entweder App Installer oder Visual Studio Build Tools manuell."
        exit 1
    }

    Write-Host "Keine nutzbare vollständige VS/Build-Tools-Instanz gefunden."
    Write-Host "Installiere jetzt Visual Studio 2022 Build Tools über winget..."
    Write-Host ""

    if ($DryRun) {
        Write-Host "DRY RUN: Würde Build Tools via winget installieren."
        return 0
    }

    $override = @(
        '--wait',
        '--quiet',
        '--norestart',
        '--add', $workloadId,
        '--add', $componentVcTools,
        '--add', $componentWinSdk
    ) -join ' '

    # WICHTIG: --override muss als EIN Argument übergeben werden, sonst parsed winget die enthaltenen Flags selbst.
    & winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --silent --accept-source-agreements --accept-package-agreements --override "$override"
    return $LASTEXITCODE
}

function Invoke-BuildToolsInstallViaBootstrapper {
    Write-Host "Starte Fallback mit offiziellem Build-Tools-Bootstrapper..."
    Write-Host "Quelle: $buildToolsBootstrapperUrl"
    Write-Host ""

    if ($DryRun) {
        Write-Host "DRY RUN: Würde vs_BuildTools.exe laden und mit Workload-Parametern ausführen."
        return 0
    }

    $bootstrapperPath = Join-Path $env:TEMP 'vs_BuildTools.exe'
    Invoke-WebRequest -Uri $buildToolsBootstrapperUrl -OutFile $bootstrapperPath -UseBasicParsing

    $argList = @(
        '--quiet',
        '--wait',
        '--norestart',
        '--nocache',
        '--add', $workloadId,
        '--add', $componentVcTools,
        '--add', $componentWinSdk
    )

    $proc = Start-Process -FilePath $bootstrapperPath -ArgumentList $argList -NoNewWindow -PassThru -Wait
    return $proc.ExitCode
}

$installPath = $null
$exitCode = 1

if ($completeInstance) {
    $installPath = [string]$completeInstance.installationPath
    $exitCode = Invoke-VsModify -InstallPath $installPath
} elseif ($incompleteInstance) {
    $installPath = [string]$incompleteInstance.installationPath
    Write-Warning "Gefundene VS-Instanz ist unvollständig (abgebrochene Installation). Versuche Reparatur über modify..."
    $exitCode = Invoke-VsModify -InstallPath $installPath

    if ($exitCode -ne 0 -and $exitCode -ne 3010) {
        Write-Warning "modify für unvollständige Instanz fehlgeschlagen (Exit Code $exitCode)."
        $exitCode = Invoke-BuildToolsInstallViaBootstrapper
        $installPath = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
        if ($exitCode -ne 0 -and $exitCode -ne 3010) {
            Write-Warning "Bootstrapper fehlgeschlagen (Exit Code $exitCode / $(Convert-ExitCodeToHex -Code $exitCode))."
            $exitCode = Invoke-BuildToolsInstallViaWinget
        }
    }
} else {
    $exitCode = Invoke-BuildToolsInstallViaBootstrapper
    $installPath = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools'
    if ($exitCode -ne 0 -and $exitCode -ne 3010) {
        Write-Warning "Bootstrapper fehlgeschlagen (Exit Code $exitCode / $(Convert-ExitCodeToHex -Code $exitCode))."
        $exitCode = Invoke-BuildToolsInstallViaWinget
    }
}

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "Installation erfolgreich (Exit Code 0)."

    # Prüfen ob msvcrt.lib jetzt vorhanden (Community oder BuildTools)
    $candidateRoots = @(
        "$installPath\VC\Tools\MSVC",
        'C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Tools\MSVC',
        'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC'
    ) | Select-Object -Unique

    $foundLib = $null
    foreach ($root in $candidateRoots) {
        if (-not (Test-Path $root)) { continue }
        $ver = (Get-ChildItem $root | Sort-Object Name -Descending | Select-Object -First 1).Name
        if (-not $ver) { continue }
        $lib = "$root\$ver\lib\x64\msvcrt.lib"
        if (Test-Path $lib) {
            $foundLib = $lib
            break
        }
    }

    if ($foundLib) {
        Write-Host "Verifikation: msvcrt.lib gefunden unter $foundLib"
    } else {
        Write-Warning "msvcrt.lib noch nicht gefunden. Evtl. Neustart nötig oder Installation nicht vollständig."
    }
} elseif ($exitCode -eq 3010) {
    Write-Host "Installation erfolgreich, Neustart erforderlich (Exit Code 3010)."
    Write-Host "Bitte Windows neu starten, dann Swift erneut testen."
} else {
    Write-Warning "Installation beendet mit Exit Code $exitCode ($(Convert-ExitCodeToHex -Code $exitCode))"
    Write-Host "Logs prüfen unter: ${env:TEMP}\dd_setup_*.log"
    Write-Host "Winget-Logs: $env:LOCALAPPDATA\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\LocalState\DiagOutputDir"
    exit $exitCode
}

Write-Host ""
Write-Host "Nächster Swift-Test:"
Write-Host "  cd D:\Tools\MiniMaster\iosMasterApp"
Write-Host "  C:\Users\torst\AppData\Local\Programs\Swift\Toolchains\6.3.0+Asserts\usr\bin\swift-build.exe --package-path ."
