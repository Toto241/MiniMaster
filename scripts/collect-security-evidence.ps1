# Collects repo-side security evidence when GitHub Code Scanning is unavailable.
#
# Writes:
#   build/security-evidence/latest-summary.json
#   build/security-evidence/latest-report.md
#
# Usage:
#   pwsh ./scripts/collect-security-evidence.ps1
param(
    [string]$OutputDir = "build/security-evidence"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$results = [ordered]@{
    generatedAt = $timestamp
    repo = "Toto241/MiniMaster"
    checks = @()
}

function Add-CheckResult {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Detail
    )
    $script:results.checks += [ordered]@{
        name = $Name
        status = $Status
        detail = $Detail
    }
}

Write-Host "Running legacy auth freeze guard..." -ForegroundColor Cyan
node scripts/legacy-auth-freeze-guard.js --fail-on-new
Add-CheckResult "legacy-auth-freeze-guard" "pass" "No new secretKey/IMEI auth paths outside whitelist"

Write-Host "Running security-focused Jest suites..." -ForegroundColor Cyan
$securityTests = @(
    "test/web-panels-bootstrap-auth.test.ts",
    "test/ios-authservice-contract.test.ts",
    "test/register-authenticated-master.test.ts",
    "test/pair-authenticated-child.test.ts",
    "test/legacy-auth-telemetry-source.test.ts",
    "test/deploy-workflow-legacy-auth-default.test.ts",
    "test/auth-migration-phase2-completion.test.ts"
)
npm run test:ci -- --runInBand $securityTests
Add-CheckResult "security-jest-suites" "pass" ($securityTests -join ", ")

Write-Host "Running PR152 guard..." -ForegroundColor Cyan
npm run guard:pr152
Add-CheckResult "guard-pr152" "pass" "PR152 selective integration guard"

$passCount = ($results.checks | Where-Object { $_.status -eq "pass" }).Count
$summary = [ordered]@{
    generatedAt = $timestamp
    overall = if ($passCount -eq $results.checks.Count) { "pass" } else { "fail" }
    passCount = $passCount
    totalCount = $results.checks.Count
    checks = $results.checks
    note = "Local repo-side security evidence. Does not replace GitHub Code Scanning SARIF upload."
}

$summaryPath = Join-Path $OutputDir "latest-summary.json"
$reportPath = Join-Path $OutputDir "latest-report.md"
$summary | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 $summaryPath

$reportLines = @(
    "# Security Evidence (Local)",
    "",
    "**Generated:** $timestamp",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |"
)
foreach ($check in $results.checks) {
    $reportLines += "| $($check.name) | $($check.status) | $($check.detail) |"
}
$reportLines += ""
$reportLines += "_Note: Enable GitHub Code Scanning at Settings → Code security for authoritative CodeQL evidence._"
$reportLines -join "`n" | Set-Content -Encoding utf8 $reportPath

Write-Host ""
Write-Host "Security evidence written:" -ForegroundColor Green
Write-Host "  $summaryPath"
Write-Host "  $reportPath"
