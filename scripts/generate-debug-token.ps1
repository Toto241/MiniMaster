<#
.SYNOPSIS
    Generates a HMAC-SHA256 debug session token for the MiniMaster USB debug interface.

.DESCRIPTION
    Reads the app-specific secret from local.properties, computes
    HMAC-SHA256(secret, challenge + suffix) and outputs the hex token.

    Prerequisite: the secret must be configured in local.properties:
        debug.session.secret.master=<strong-random-string>
        debug.session.secret.child=<strong-random-string>

.PARAMETER AppId
    Target app: "master" (Eltern-App) or "child" (Kinder-App).

.PARAMETER Challenge
    The nonce received from the app (read from logcat after DEBUG_GET_CHALLENGE).
    Not required when -GenSecret is used.

.PARAMETER GenSecret
    If set, generates a new cryptographically-strong 32-byte secret and prints it.
    Copy the value into local.properties.

.EXAMPLE
    # 1. Get challenge from logcat output:
    #    adb shell am broadcast -a com.minimaster.masterapp.DEBUG_GET_CHALLENGE
    #    adb logcat -s MINIMASTER_DEBUG_CHALLENGE -d -T 1
    #    > CHALLENGE:a1b2c3d4...
    #
    # 2. Generate token:
    pwsh -File scripts/generate-debug-token.ps1 -AppId master -Challenge a1b2c3d4...
    #
    # 3. Activate session:
    #    adb shell am broadcast -a com.minimaster.masterapp.DEBUG_ACTIVATE -e response <TOKEN>

    # Generate new secrets:
    pwsh -File scripts/generate-debug-token.ps1 -GenSecret
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("master", "child")]
    [string]$AppId,

    [Parameter(Mandatory = $false)]
    [string]$Challenge,

    [Parameter(Mandatory = $false)]
    [switch]$GenSecret
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Generate new secret ────────────────────────────────────────────────────────
if ($GenSecret) {
    $bytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $secret = ($bytes | ForEach-Object { '{0:x2}' -f $_ }) -join ''
    Write-Host ""
    Write-Host "Generated secret (64-char hex, 256 bit):" -ForegroundColor Cyan
    Write-Host $secret -ForegroundColor Green
    Write-Host ""
    Write-Host "Add to local.properties:" -ForegroundColor Yellow
    Write-Host "  debug.session.secret.master=$secret" -ForegroundColor Yellow
    Write-Host "  debug.session.secret.child=$secret   # use different values per app!" -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

# ── Validate required args ─────────────────────────────────────────────────────
if (-not $AppId) {
    Write-Error "Parameter -AppId is required (master or child) unless -GenSecret is used."
    exit 1
}
if (-not $Challenge) {
    Write-Error "Parameter -Challenge is required. Read it from logcat after DEBUG_GET_CHALLENGE."
    exit 1
}

# ── Locate local.properties ───────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot  = Split-Path -Parent $scriptDir
$localPropsPath = Join-Path $repoRoot "local.properties"

if (-not (Test-Path $localPropsPath)) {
    Write-Error "local.properties not found at: $localPropsPath"
    exit 1
}

# ── Read secret from local.properties ─────────────────────────────────────────
$secretKey = "debug.session.secret.$AppId"
$secretValue = $null

Get-Content $localPropsPath | ForEach-Object {
    $line = $_.Trim()
    if ($line -match "^$([regex]::Escape($secretKey))\s*=\s*(.+)$") {
        $secretValue = $Matches[1].Trim()
    }
}

if (-not $secretValue) {
    Write-Error "Key '$secretKey' not found in local.properties. Uncomment and set the secret first."
    exit 1
}

if ($secretValue -eq "REPLACE_WITH_STRONG_RANDOM_SECRET") {
    Write-Error "Secret is still the placeholder value. Run with -GenSecret to create a real secret."
    exit 1
}

# ── Compute HMAC-SHA256 ────────────────────────────────────────────────────────
$suffix = if ($AppId -eq "master") { "_ACTIVATE_MASTER" } else { "_ACTIVATE_CHILD" }
$data   = "$Challenge$suffix"

$keyBytes  = [System.Text.Encoding]::UTF8.GetBytes($secretValue)
$dataBytes = [System.Text.Encoding]::UTF8.GetBytes($data)

$hmac   = [System.Security.Cryptography.HMACSHA256]::new($keyBytes)
$hash   = $hmac.ComputeHash($dataBytes)
$token  = ($hash | ForEach-Object { '{0:x2}' -f $_ }) -join ''

Write-Host ""
Write-Host "Token for $AppId (HMAC-SHA256):" -ForegroundColor Cyan
Write-Host $token -ForegroundColor Green
Write-Host ""
Write-Host "Activate with:" -ForegroundColor Yellow

$action = if ($AppId -eq "master") {
    "com.minimaster.masterapp.DEBUG_ACTIVATE"
} else {
    "com.google.pairing.DEBUG_ACTIVATE"
}

Write-Host "  adb shell am broadcast -a $action -e response $token" -ForegroundColor Yellow
Write-Host ""
