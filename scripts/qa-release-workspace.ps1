[CmdletBinding()]
param(
    [ValidateSet("Summary", "Compact", "GitHub", "AI", "Debug")]
    [string]$Format = "Summary",
    [string]$BaseUrl = "http://127.0.0.1:8765",
    [string]$BlockerId,
    [string]$OutFile
)

$ErrorActionPreference = "Stop"

function Write-WorkspaceLog {
    param(
        [string]$Severity,
        [string]$Module,
        [string]$Action,
        [string]$Message
    )

    $timestamp = (Get-Date).ToString("s")
    Write-Host "[$timestamp][$Severity][$Module][$Action] $Message"
}

function Get-WorkspacePayload {
    $uri = "$BaseUrl/api/qa/release-workspace"
    Write-WorkspaceLog -Severity "INFO" -Module "qa-release-workspace" -Action "fetch" -Message "Lade $uri"
    return Invoke-RestMethod -Uri $uri -Method Get -Headers @{ Accept = "application/json" }
}

function Get-SelectedBlocker {
    param([object]$Payload)

    $blockers = @($Payload.blockers)
    if (-not $blockers -or $blockers.Count -eq 0) {
        throw "Keine Release-Blocker in der Workspace-Payload vorhanden."
    }

    if ([string]::IsNullOrWhiteSpace($BlockerId)) {
        return $blockers[0]
    }

    $selected = $blockers | Where-Object { $_.id -eq $BlockerId } | Select-Object -First 1
    if (-not $selected) {
        throw "Blocker '$BlockerId' wurde nicht gefunden."
    }
    return $selected
}

function Build-ClipboardPayload {
    param(
        [object]$Blocker,
        [string]$RequestedFormat
    )

    switch ($RequestedFormat) {
        "Compact" {
            return @(
                "Titel: $($Blocker.title)",
                "Status: $($Blocker.status)",
                "Severity: $($Blocker.severity)",
                "Suite: $($Blocker.suiteRef)",
                "Details: $($Blocker.details)",
                "Dokumentation: $($Blocker.documentation)"
            ) -join "`n"
        }
        "GitHub" {
            return @(
                "## $($Blocker.title)",
                "",
                "- Status: $($Blocker.status)",
                "- Severity: $($Blocker.severity)",
                "- Suite: $($Blocker.suiteRef)",
                "",
                "### Details",
                "$($Blocker.details)",
                "",
                "### Dokumentation",
                "$($Blocker.documentation)"
            ) -join "`n"
        }
        "AI" {
            return @(
                "Analysiere folgenden MiniMaster Release-Blocker.",
                "Titel: $($Blocker.title)",
                "Status: $($Blocker.status)",
                "Severity: $($Blocker.severity)",
                "Suite: $($Blocker.suiteRef)",
                "Details: $($Blocker.details)",
                "Dokumentation: $($Blocker.documentation)"
            ) -join "`n"
        }
        "Debug" {
            return ($Blocker | ConvertTo-Json -Depth 8)
        }
        default {
            return ($Blocker | ConvertTo-Json -Depth 8)
        }
    }
}

$payload = Get-WorkspacePayload

if ($Format -eq "Summary") {
    $summary = [pscustomobject]@{
        generatedAt = $payload.generatedAt
        blockingCount = $payload.summary.blockingCount
        staleEvidenceCount = $payload.summary.staleEvidenceCount
        runningJobs = $payload.summary.runningJobs
        activeEmulators = $payload.summary.activeEmulators
        systemHealth = $payload.summary.systemHealth
    }

    $json = $summary | ConvertTo-Json -Depth 6
    if ($OutFile) {
        $json | Set-Content -Path $OutFile -Encoding UTF8
        Write-WorkspaceLog -Severity "INFO" -Module "qa-release-workspace" -Action "write" -Message "Summary nach $OutFile geschrieben"
    } else {
        $json
    }
    exit 0
}

$blocker = Get-SelectedBlocker -Payload $payload
$clipboardPayload = Build-ClipboardPayload -Blocker $blocker -RequestedFormat $Format

if ($OutFile) {
    $clipboardPayload | Set-Content -Path $OutFile -Encoding UTF8
    Write-WorkspaceLog -Severity "INFO" -Module "qa-release-workspace" -Action "write" -Message "Format $Format nach $OutFile geschrieben"
} else {
    $clipboardPayload
}

exit 0
