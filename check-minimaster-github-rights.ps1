param(
    [string]$RepositoryFullName = "Toto241/MiniMaster"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info($msg) {
    Write-Host "[INFO] $msg" -ForegroundColor Cyan
}

function Write-Ok($msg) {
    Write-Host "[OK]   $msg" -ForegroundColor Green
}

function Write-WarnMsg($msg) {
    Write-Host "[WARN] $msg" -ForegroundColor Yellow
}

function Write-Fail($msg) {
    Write-Host "[FAIL] $msg" -ForegroundColor Red
}

function Assert-GhInstalled {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        throw "GitHub CLI (gh) ist nicht installiert. Installiere zuerst GitHub CLI: https://cli.github.com/"
    }
    Write-Ok "GitHub CLI gefunden: $($gh.Source)"
}

function Assert-GhAuth {
    try {
        $authStatus = gh auth status 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "GitHub CLI ist nicht angemeldet."
        }
        Write-Ok "GitHub CLI ist angemeldet."
    }
    catch {
        throw "GitHub CLI ist nicht angemeldet. Führe 'gh auth login' aus."
    }
}

function Get-GitHubLogin {
    $login = gh api user --jq .login 2>$null
    if (-not $login) {
        throw "GitHub-Benutzername konnte nicht ermittelt werden."
    }
    return $login.Trim()
}

function Get-RepoInfo {
    param(
        [string]$Repo
    )
    $repoJson = gh api "repos/$Repo" 2>$null
    if (-not $repoJson) {
        throw "Repository '$Repo' konnte nicht geladen werden. Entweder ist es nicht sichtbar oder die Rechte reichen nicht."
    }
    return $repoJson | ConvertFrom-Json
}

function Get-CollaboratorPermission {
    param(
        [string]$Repo,
        [string]$Username
    )

    try {
        $permJson = gh api "repos/$Repo/collaborators/$Username/permission" 2>$null
        if (-not $permJson) {
            return $null
        }
        return $permJson | ConvertFrom-Json
    }
    catch {
        return $null
    }
}

function Explain-Permission {
    param(
        [string]$Permission
    )

    switch ($Permission) {
        "admin" {
            return @{
                WritePossible = $true
                PullRequestLikely = $true
                Message = "Admin-Rechte vorhanden. Direktes Schreiben, Branches und PRs sollten möglich sein."
            }
        }
        "maintain" {
            return @{
                WritePossible = $true
                PullRequestLikely = $true
                Message = "Maintain-Rechte vorhanden. Branches, Änderungen und PRs sollten in der Regel möglich sein."
            }
        }
        "write" {
            return @{
                WritePossible = $true
                PullRequestLikely = $true
                Message = "Write-Rechte vorhanden. Änderungen im Repo und PR-Workflow sollten möglich sein."
            }
        }
        "triage" {
            return @{
                WritePossible = $false
                PullRequestLikely = $true
                Message = "Nur Triage-Rechte. Issues/PRs verwalten meist möglich, aber keine Dateiänderungen pushen."
            }
        }
        "read" {
            return @{
                WritePossible = $false
                PullRequestLikely = $false
                Message = "Nur Leserechte. Dateiänderungen, Branch-Erstellung und PR aus eigenem Repo-Kontext reichen wahrscheinlich nicht aus."
            }
        }
        default {
            return @{
                WritePossible = $false
                PullRequestLikely = $false
                Message = "Unbekannte oder nicht direkt auswertbare Berechtigung."
            }
        }
    }
}

try {
    Write-Info "Prüfe Voraussetzungen..."
    Assert-GhInstalled
    Assert-GhAuth

    $login = Get-GitHubLogin
    Write-Ok "Angemeldeter GitHub-Benutzer: $login"

    Write-Info "Lade Repository-Informationen für $RepositoryFullName ..."
    $repo = Get-RepoInfo -Repo $RepositoryFullName
    Write-Ok "Repository gefunden: $($repo.full_name)"
    Write-Host "       Standard-Branch: $($repo.default_branch)"
    Write-Host "       Privat: $($repo.private)"
    Write-Host "       Owner: $($repo.owner.login)"

    Write-Info "Prüfe effektive Berechtigung von '$login' auf '$RepositoryFullName' ..."
    $perm = Get-CollaboratorPermission -Repo $RepositoryFullName -Username $login

    if ($null -eq $perm) {
        Write-WarnMsg "Die effektive Kollaborator-Berechtigung konnte nicht direkt abgefragt werden."
        Write-WarnMsg "Das passiert oft bei eingeschränkten Tokens, App-Installationen oder wenn nur Leserechte vorliegen."
        Write-Host ""
        Write-Host "Was eingerichtet werden sollte:" -ForegroundColor White
        Write-Host "  1. Repository contents: Read and write"
        Write-Host "  2. Pull requests: Read and write"
        Write-Host "  3. Die GitHub-App/Integration muss auf Toto241/MiniMaster mit Schreibrechten installiert sein"
        exit 0
    }

    $permissionName = $perm.permission
    Write-Ok "Effektive Berechtigung: $permissionName"

    $result = Explain-Permission -Permission $permissionName

    if ($result.WritePossible) {
        Write-Ok $result.Message
    }
    else {
        Write-Fail $result.Message
    }

    Write-Host ""
    Write-Host "Bewertung:" -ForegroundColor White
    Write-Host "  Schreiben ins Repo möglich: $($result.WritePossible)"
    Write-Host "  PR-Workflow wahrscheinlich möglich: $($result.PullRequestLikely)"

    Write-Host ""
    Write-Host "Empfohlene Rechte für vollständige Integration:" -ForegroundColor White
    Write-Host "  - Contents: Read and write"
    Write-Host "  - Pull requests: Read and write"
    Write-Host "  - Optional: Issues: Read and write"

    if (-not $result.WritePossible) {
        Write-Host ""
        Write-Host "Was konkret geändert werden muss:" -ForegroundColor Yellow
        Write-Host "  - Dem Benutzer oder der GitHub-App Schreibrechte auf $RepositoryFullName geben"
        Write-Host "  - Oder die GitHub-App mit 'Contents: Read and write' neu installieren/autorisieren"
        Write-Host "  - Für sicheren Workflow zusätzlich PR-Rechte aktivieren"
    }

    Write-Host ""
    Write-Ok "Prüfung abgeschlossen."
}
catch {
    Write-Fail $_.Exception.Message
    exit 1
}