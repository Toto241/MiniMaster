# Installs a NEW Firebase Admin service-account key into the places that need it,
# without ever printing the key material. Validates the file first so a wrong,
# template, or revoked/leaked key is rejected loudly.
#
# Usage:
#   # Local break-glass only (scripts/setup-admin.js, python_admin readiness):
#   pwsh ./scripts/install-firebase-key.ps1 -KeyPath C:\path\to\new-key.json
#
#   # Also push it to the GitHub Actions deploy secret (FIREBASE_SERVICE_ACCOUNT_KEY):
#   pwsh ./scripts/install-firebase-key.ps1 -KeyPath C:\path\to\new-key.json -SetCiSecret
#
# Download the key from: GCP Console -> IAM & Admin -> Service Accounts ->
# firebase-adminsdk-fbsvc@minimaster-28fbd -> Keys -> Add key -> Create new key (JSON).
param(
    [Parameter(Mandatory = $true)][string]$KeyPath,
    [switch]$SetCiSecret,
    [string]$Repo = "Toto241/MiniMaster",
    # Empty = resolve from .firebaserc default project (single source of truth);
    # pass explicitly only to override. Falls back to minimaster-28fbd.
    [string]$ExpectedProject = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Key id of the credential that leaked into public git history and was revoked.
# Installing it again would re-introduce a dead, compromised key — refuse it.
$RevokedKeyIdPrefix = "7e76f1c1d4"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}
function Fail([string]$Message) {
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$destPath = Join-Path $repoRoot "serviceAccountKey.json"

# Single source of truth for the project id: .firebaserc default. Forking the
# repo to another project only requires editing .firebaserc, not this script.
if (-not $ExpectedProject) {
    try {
        $rc = Get-Content (Join-Path $repoRoot ".firebaserc") -Raw | ConvertFrom-Json
        if ($rc.projects.default) { $ExpectedProject = [string]$rc.projects.default }
    } catch { }
    if (-not $ExpectedProject) { $ExpectedProject = "minimaster-28fbd" }
}

Write-Step "Validating key file: $KeyPath"
if (-not (Test-Path -LiteralPath $KeyPath)) { Fail "File not found: $KeyPath" }

try {
    $key = Get-Content -LiteralPath $KeyPath -Raw | ConvertFrom-Json
} catch {
    Fail "Not valid JSON: $($_.Exception.Message)"
}

if ($key.private_key_id -eq "REPLACE_ME" -or $key.project_id -eq "REPLACE_WITH_YOUR_PROJECT_ID") {
    Fail "This is the unfilled template, not a real key. Download a new key from the GCP Console first."
}
if ($key.type -ne "service_account" -or -not $key.private_key -or -not $key.client_email) {
    Fail "Not a complete service-account key (missing type/private_key/client_email)."
}
if ([string]$key.private_key_id -and ([string]$key.private_key_id).StartsWith($RevokedKeyIdPrefix)) {
    Fail "This is the REVOKED, leaked key (id $RevokedKeyIdPrefix...). Use a freshly generated key."
}
if ($key.project_id -ne $ExpectedProject) {
    Fail "Key belongs to project '$($key.project_id)', expected '$ExpectedProject'. Wrong key — aborting."
}

$keyIdShort = ([string]$key.private_key_id).Substring(0, [Math]::Min(10, ([string]$key.private_key_id).Length))
Write-Host "OK: service_account for $($key.project_id), key id $keyIdShort..." -ForegroundColor Green

Write-Step "Installing local serviceAccountKey.json (git-ignored)"
Copy-Item -LiteralPath $KeyPath -Destination $destPath -Force
Write-Host "Wrote $destPath"

Write-Step "Running secret-leak guard (must stay green)"
Push-Location $repoRoot
try {
    & npm run --silent guard:secrets | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail "guard:secrets failed — the key may have become tracked. Check .gitignore." }
} finally {
    Pop-Location
}

if ($SetCiSecret) {
    Write-Step "Setting GitHub Actions secret FIREBASE_SERVICE_ACCOUNT_KEY on $Repo"
    gh auth status | Out-Host
    # Pipe via stdin so the key never appears in the process command line / args.
    Get-Content -LiteralPath $KeyPath -Raw | gh secret set FIREBASE_SERVICE_ACCOUNT_KEY --repo $Repo
    if ($LASTEXITCODE -ne 0) { Fail "gh secret set failed." }
    Write-Host "CI secret updated." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Skipped CI secret. To update the deploy secret too, re-run with -SetCiSecret" -ForegroundColor Yellow
}

Write-Step "Done"
Write-Host "Next steps:"
Write-Host "  - Production Cloud Functions use Application Default Credentials (no file needed)."
Write-Host "  - Verify deploy: GitHub -> Actions -> run the deploy workflow (or push to main)."
Write-Host "  - Confirm the OLD key id $RevokedKeyIdPrefix... is deleted in the GCP Console."
Write-Host "  - Keep $destPath OUT of git (already covered by .gitignore)."
