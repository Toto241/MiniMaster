# install-swift-msvc-deps.ps1
# Installiert die fehlenden MSVC C++-Bibliotheken, die Swift on Windows zum Linken benötigt.
# AUSFÜHRUNG: Als Administrator starten (Rechtsklick → Als Administrator ausführen)
#
# Was installiert wird:
#   • Microsoft.VisualStudio.Workload.NativeDesktop (Desktop-Entwicklung mit C++)
#   • Microsoft.VisualStudio.Component.VC.Tools.x86.x64 (MSVC v143 Buildtools)
#   • Microsoft.VisualStudio.Component.Windows11SDK.26100 (Windows 11 SDK)
#
# Das behebt: lld-link: error: could not open 'msvcrt.lib' / 'oldnames.lib' / 'msvcprt.lib'

#Requires -RunAsAdministrator

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$installer = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vs_installer.exe'
$installPath = 'C:\Program Files\Microsoft Visual Studio\2022\Community'

if (-not (Test-Path $installer)) {
    Write-Error "vs_installer.exe nicht gefunden unter: $installer"
    exit 1
}

if (-not (Test-Path $installPath)) {
    Write-Error "Visual Studio 2022 Community nicht gefunden unter: $installPath"
    exit 1
}

Write-Host "Starte MSVC C++ Desktop-Workload Installation..."
Write-Host "Installer : $installer"
Write-Host "VS-Pfad   : $installPath"
Write-Host "(Das kann 5-20 Minuten dauern, abhängig von der Internetgeschwindigkeit)"
Write-Host ""

$argList = @(
    'modify',
    '--installPath', $installPath,
    '--add', 'Microsoft.VisualStudio.Workload.NativeDesktop',
    '--add', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.26100',
    '--quiet',
    '--norestart',
    '--force'
)

$proc = Start-Process -FilePath $installer -ArgumentList $argList -NoNewWindow -PassThru -Wait
$exitCode = $proc.ExitCode

if ($exitCode -eq 0) {
    Write-Host ""
    Write-Host "Installation erfolgreich (Exit Code 0)."

    # Prüfen ob msvcrt.lib jetzt vorhanden
    $vctools = "$installPath\VC\Tools\MSVC"
    $ver = (Get-ChildItem $vctools | Sort-Object Name -Descending | Select-Object -First 1).Name
    $lib = "$vctools\$ver\lib\x64\msvcrt.lib"
    if (Test-Path $lib) {
        Write-Host "Verifikation: msvcrt.lib gefunden unter $lib"
    } else {
        Write-Warning "msvcrt.lib noch nicht gefunden. Evtl. Neustart nötig oder andere MSVC-Version aktiv."
    }
} elseif ($exitCode -eq 3010) {
    Write-Host "Installation erfolgreich, Neustart erforderlich (Exit Code 3010)."
    Write-Host "Bitte Windows neu starten, dann Swift erneut testen."
} else {
    Write-Warning "Installation beendet mit Exit Code $exitCode"
    Write-Host "Logs prüfen unter: ${env:TEMP}\dd_setup_*.log"
    exit $exitCode
}

Write-Host ""
Write-Host "Nächster Swift-Test:"
Write-Host "  cd D:\Tools\MiniMaster\iosMasterApp"
Write-Host "  C:\Users\torst\AppData\Local\Programs\Swift\Toolchains\6.3.0+Asserts\usr\bin\swift.exe package describe"
