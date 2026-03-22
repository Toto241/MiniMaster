# Fuehrt den Commissioning-Testlauf automatisiert auf zwei Geraeten aus.
#
# Ablauf:
# 1) Master Commissioning-Suite
# 2) Child Commissioning-Suite
# 3) Zusammenfassung mit Gesamtstatus
#
# Beispiel:
# pwsh -File scripts/run-dual-device-commissioning.ps1 -MasterSerial R58M12345 -ChildSerial R3CN90ABC
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$MasterSerial,

    [Parameter(Mandatory = $true)]
    [string]$ChildSerial
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$singleRunner = Join-Path $scriptDir "run-usb-tests.ps1"

if (-not (Test-Path $singleRunner)) {
    throw "run-usb-tests.ps1 not found at $singleRunner"
}

Write-Host ""
Write-Host "==== MINI MASTER DUAL-DEVICE COMMISSIONING ====" -ForegroundColor Cyan
Write-Host "Master device: $MasterSerial" -ForegroundColor Gray
Write-Host "Child device:  $ChildSerial" -ForegroundColor Gray

Write-Host ""
Write-Host "[1/2] Master Commissioning-Suite" -ForegroundColor Cyan
& pwsh -File $singleRunner -AppId master -AdbSerial $MasterSerial -Suite commissioning
$masterExit = $LASTEXITCODE

Write-Host ""
Write-Host "[2/2] Child Commissioning-Suite" -ForegroundColor Cyan
& pwsh -File $singleRunner -AppId child -AdbSerial $ChildSerial -Suite commissioning
$childExit = $LASTEXITCODE

Write-Host ""
Write-Host "==== GESAMTERGEBNIS ====" -ForegroundColor White
if ($masterExit -eq 0 -and $childExit -eq 0) {
    Write-Host "PASS: Beide Commissioning-Suiten erfolgreich." -ForegroundColor Green
    exit 0
}

Write-Host "FAIL: Mindestens eine Commissioning-Suite fehlgeschlagen." -ForegroundColor Red
Write-Host "Master Exit: $masterExit" -ForegroundColor Red
Write-Host "Child Exit:  $childExit" -ForegroundColor Red
exit 1
