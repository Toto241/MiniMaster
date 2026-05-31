# Enables GitHub Code Scanning for this repository and triggers a fresh CodeQL run.
#
# Usage:
#   pwsh ./scripts/enable-code-scanning.ps1
#   pwsh ./scripts/enable-code-scanning.ps1 -TriggerWorkflow
#
# Note: Code Scanning must be enabled once in GitHub Settings for private repos.
# This script verifies status, prints the exact URL, and optionally triggers CodeQL.
param(
    [string]$Repo = "Toto241/MiniMaster",
    [switch]$TriggerWorkflow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

Write-Step "Checking GitHub authentication"
gh auth status | Out-Host

Write-Step "Checking Code Scanning status"
$settingsUrl = "https://github.com/$Repo/settings/security_analysis"
Write-Host "Settings URL: $settingsUrl"

try {
    gh api "repos/$Repo/code-scanning/default-setup" | Out-Host
    Write-Host "Code Scanning appears enabled." -ForegroundColor Green
    $enabled = $true
} catch {
    Write-Host "Code Scanning is NOT enabled yet (HTTP 403 expected until Settings are updated)." -ForegroundColor Yellow
    Write-Host "Manual step required:"
    Write-Host "  1. Open $settingsUrl"
    Write-Host "  2. Enable 'Code scanning' / 'CodeQL analysis'"
    Write-Host "  3. Re-run: pwsh ./scripts/enable-code-scanning.ps1 -TriggerWorkflow"
    $enabled = $false
}

if ($TriggerWorkflow) {
    Write-Step "Triggering CodeQL Security Analysis workflow"
    gh workflow run "CodeQL Security Analysis" --repo $Repo --ref main
    Start-Sleep -Seconds 5
    gh run list --repo $Repo --workflow "CodeQL Security Analysis" --limit 3 | Out-Host
}

Write-Step "Collecting local security evidence (repo-side substitute until Code Scanning is enabled)"
npm run security:evidence:collect

if ($enabled) {
    Write-Host ""
    Write-Host "Next: npm run ci:revalidate" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Code Scanning still requires manual enablement in GitHub Settings." -ForegroundColor Yellow
}
