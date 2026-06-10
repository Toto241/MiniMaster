#Requires -Version 5.1
<#
.SYNOPSIS
  Aktiviert GitHub Pages (Actions), deployed die Privacy-Policy und prueft die URL.

.DESCRIPTION
  Ersetzt manuelle Schritte aus docs/ENABLE_GITHUB_PAGES.md fuer MiniMaster.

.EXAMPLE
  pwsh ./scripts/setup-github-pages.ps1
#>
[CmdletBinding()]
param(
    [string] $Owner = "Toto241",
    [string] $Repo = "MiniMaster",
    [string] $PrivacyUrl = "https://toto241.github.io/MiniMaster/privacy/",
    [string] $Branch = "main",
    [switch] $SkipWorkflow,
    [string] $LegalConfigJson = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Ensure-GhAuth {
    Write-Step "GitHub CLI pruefen"
    $null = Get-Command gh -ErrorAction Stop
    gh auth status 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "gh nicht eingeloggt. Bitte: gh auth login" }
}

function Enable-PagesWorkflow {
    Write-Step "GitHub Pages aktivieren (build_type=workflow)"
    $endpoint = "repos/$Owner/$Repo/pages"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    $existing = gh api $endpoint 2>&1
    if ($LASTEXITCODE -eq 0 -and ($existing -match '"build_type"\s*:\s*"workflow"')) {
        Write-Host "Pages bereits aktiv (workflow)."
        $ErrorActionPreference = $prevEap
        return
    }

    $null = gh api -X POST $endpoint `
        -f build_type=workflow `
        -f "source[branch]=$Branch" `
        -f "source[path]=/" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $null = gh api -X PUT $endpoint `
            -f build_type=workflow `
            -f "source[branch]=$Branch" `
            -f "source[path]=/" 2>&1
        if ($LASTEXITCODE -ne 0) {
            $ErrorActionPreference = $prevEap
            throw "Pages konnte nicht konfiguriert werden (POST/PUT fehlgeschlagen)."
        }
        Write-Host "Pages-Site aktualisiert (PUT)."
    } else {
        Write-Host "Pages-Site erstellt (POST)."
    }

    $info = gh api $endpoint 2>&1
    Write-Host "Pages-Status: $info"
    $ErrorActionPreference = $prevEap
}

function Set-PrivacyVariable {
    Write-Step "Repository-Variable PRIVACY_POLICY_URL setzen"
    gh variable set PRIVACY_POLICY_URL --repo "$Owner/$Repo" --body $PrivacyUrl 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Variable konnte nicht gesetzt werden." }
}

function Apply-LegalPlaceholders {
    if (-not $LegalConfigJson) { return }
    Write-Step "Legal-Platzhalter aus $LegalConfigJson"
    if (-not (Test-Path $LegalConfigJson)) {
        throw "LegalConfigJson nicht gefunden: $LegalConfigJson"
    }
    $map = Get-Content $LegalConfigJson -Raw -Encoding UTF8 | ConvertFrom-Json
    $files = @(
        "docs/PRIVACY_POLICY_DE.md",
        "docs/PRIVACY_POLICY.md",
        "docs/PRIVACY_POLICY_EN_US.md",
        "docs/PRIVACY_POLICY_EN_UK.md"
    )
    foreach ($rel in $files) {
        $path = Join-Path $RepoRoot $rel
        if (-not (Test-Path $path)) { continue }
        $text = Get-Content $path -Raw -Encoding UTF8
        foreach ($prop in $map.PSObject.Properties) {
            $key = "[{0}]" -f $prop.Name
            $text = $text.Replace($key, [string]$prop.Value)
        }
        Set-Content -Path $path -Value $text -Encoding UTF8 -NoNewline
        Write-Host "Aktualisiert: $rel"
    }
}

function Build-PrivacyHtml {
    Write-Step "Privacy-HTML lokal bauen"
    python scripts/render_privacy_policy.py --build
    if ($LASTEXITCODE -ne 0) { throw "render_privacy_policy --build fehlgeschlagen." }
    python scripts/render_privacy_policy.py --list-placeholders 2>&1 | ForEach-Object {
        if ($_ -match '^\[') {
            Write-Warning "Offener Platzhalter: $_"
        }
    }
}

function Invoke-PrivacyWorkflow {
    Write-Step "Workflow 'Privacy-Policy Pages' starten"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $null = gh workflow run "Privacy-Policy Pages" --repo "$Owner/$Repo" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $ErrorActionPreference = $prevEap
        throw "Workflow-Start fehlgeschlagen (Workflow auf main gepusht?)."
    }
    Start-Sleep -Seconds 5
    $runId = gh run list --repo "$Owner/$Repo" --workflow "pages.yml" --limit 1 --json databaseId --jq ".[0].databaseId" 2>&1
    if (-not $runId -or $runId -match "error|failed") {
        $runId = gh run list --repo "$Owner/$Repo" --limit 5 --json databaseId,displayTitle --jq '.[] | select(.displayTitle|test("Privacy|Pages")) | .databaseId' 2>&1 | Select-Object -First 1
    }
    if (-not $runId) {
        $ErrorActionPreference = $prevEap
        throw "Run-ID nicht gefunden."
    }
    Write-Host "Run-ID: $runId - warte auf Abschluss ..."
    gh run watch $runId --repo "$Owner/$Repo" --exit-status 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) {
        $ErrorActionPreference = $prevEap
        throw "Pages-Workflow fehlgeschlagen."
    }
    $ErrorActionPreference = $prevEap
}

function Test-PrivacyUrl {
    Write-Step "Privacy-URL pruefen ($PrivacyUrl)"
    $max = 12
    for ($i = 1; $i -le $max; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri $PrivacyUrl -Method Head -UseBasicParsing -TimeoutSec 30
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
                Write-Host "OK HTTP $($resp.StatusCode)" -ForegroundColor Green
                return
            }
        } catch {
            Write-Host "Versuch $i/$max : $($_.Exception.Message)"
        }
        Start-Sleep -Seconds 10
    }
    throw "Privacy-URL nach $max Versuchen nicht erreichbar."
}

Ensure-GhAuth
Enable-PagesWorkflow
Set-PrivacyVariable
Apply-LegalPlaceholders
Build-PrivacyHtml

if (-not $SkipWorkflow) {
    Invoke-PrivacyWorkflow
    Test-PrivacyUrl
} else {
    Write-Host "SkipWorkflow: Deploy uebersprungen." -ForegroundColor Yellow
}

Write-Host "`nFertig. Privacy-URL (Play Console): $PrivacyUrl" -ForegroundColor Green
Write-Host "Produktions-Domain spaeter: https://minimaster.app/privacy" -ForegroundColor DarkGray
