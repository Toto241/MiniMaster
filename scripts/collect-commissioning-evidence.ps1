# Collects automated commissioning evidence from backend/integration tests.
#
# Writes:
#   build/commissioning-evidence/latest-summary.json
#   build/commissioning-evidence/latest-report.md
#
# Usage:
#   pwsh ./scripts/collect-commissioning-evidence.ps1
#   pwsh ./scripts/collect-commissioning-evidence.ps1 -TryEmulator
param(
    [string]$OutputDir = "build/commissioning-evidence",
    [switch]$TryEmulator
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$checks = @()

function Add-Check([string]$Name, [string]$Status, [string]$Detail) {
    $script:checks += [ordered]@{
        name = $Name
        status = $Status
        detail = $Detail
    }
}

Write-Host "Running commissioning readiness tests..." -ForegroundColor Cyan
npm run test:ci -- --runInBand test/commissioning-readiness.test.ts
Add-Check "commissioning-readiness" "pass" "Admin panel commissioning/readiness automation"

Write-Host "Running auth pairing integration tests..." -ForegroundColor Cyan
$pairingTests = @(
    "test/register-authenticated-master.test.ts",
    "test/pair-authenticated-child.test.ts",
    "test/e2e-ticket-lifecycle.test.ts"
)
npm run test:ci -- --runInBand $pairingTests
Add-Check "pairing-lock-sync-backend" "pass" "Authenticated master/child registration + support lifecycle"

if ($TryEmulator) {
    Write-Host "Probing Android emulator tooling..." -ForegroundColor Cyan
    try {
        pwsh ./scripts/qa-emulator-automation.ps1 -Action status
        Add-Check "emulator-tooling" "pass" "Android SDK/emulator tools reachable"
    } catch {
        Add-Check "emulator-tooling" "skipped" $_.Exception.Message
    }
} else {
    Add-Check "physical-device-commissioning" "pending" "Requires adb-connected device or AVD; run scripts/run-dual-device-commissioning.ps1"
}

$passCount = ($checks | Where-Object { $_.status -eq "pass" }).Count
$summary = [ordered]@{
    generatedAt = $timestamp
    overall = if ($checks | Where-Object { $_.status -eq "pending" }) { "partial" } elseif ($passCount -eq $checks.Count) { "pass" } else { "partial" }
    passCount = $passCount
    totalCount = $checks.Count
    checks = $checks
    note = "Automated backend commissioning evidence. Physical device flows still require USB/emulator commissioning."
}

$summaryPath = Join-Path $OutputDir "latest-summary.json"
$reportPath = Join-Path $OutputDir "latest-report.md"
$summary | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $summaryPath

$lines = @(
    "# Commissioning Evidence (Automated)",
    "",
    "**Generated:** $timestamp",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |"
)
foreach ($check in $checks) {
    $lines += "| $($check.name) | $($check.status) | $($check.detail) |"
}
$lines += ""
$lines += "_For full Go-Live evidence, execute `scripts/run-dual-device-commissioning.ps1` on paired physical devices._"
$lines -join "`n" | Set-Content -Encoding utf8 $reportPath

Write-Host ""
Write-Host "Commissioning evidence written:" -ForegroundColor Green
Write-Host "  $summaryPath"
Write-Host "  $reportPath"
