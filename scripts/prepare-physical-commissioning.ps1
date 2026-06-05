#Requires -Version 5.1
<#
.SYNOPSIS
  Prueft Voraussetzungen fuer physisches Dual-Device-Commissioning.
#>
[CmdletBinding()]
param(
    [string]$MasterSerial = "",
    [string]$ChildSerial = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

Write-Step "ADB Geraete"
$adb = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adb) {
    Write-Warning "adb nicht im PATH. Android SDK Platform-Tools installieren."
} else {
    adb devices -l
}

Write-Step "Backend-Commissioning Evidence"
npm run commissioning:evidence:collect

Write-Step "Security Evidence"
npm run security:evidence:collect

Write-Step "Code Scanning"
$settingsUrl = "https://github.com/Toto241/MiniMaster/settings/security_analysis"
Write-Host $settingsUrl
try {
    gh api repos/Toto241/MiniMaster/code-scanning/default-setup 2>$null | Out-Host
    Write-Host "Code Scanning: aktiv" -ForegroundColor Green
} catch {
    Write-Warning "Code Scanning noch nicht aktiv (Issue #158). Settings oeffnen."
}

if ($MasterSerial -and $ChildSerial) {
    Write-Step "Dual-Device-Lauf starten"
    & "$RepoRoot\scripts\run-dual-device-commissioning.ps1" `
        -MasterSerial $MasterSerial -ChildSerial $ChildSerial
} else {
    Write-Host "`nNaechster Schritt (2 Geraete per USB):" -ForegroundColor Yellow
    Write-Host "  adb devices -l"
    Write-Host "  pwsh ./scripts/prepare-physical-commissioning.ps1 -MasterSerial <ID> -ChildSerial <ID>"
    Write-Host "Checkliste: docs/PHYSICAL_COMMISSIONING_CHECKLIST.md"
}
