param(
    [string]$Repo = "Toto241/MiniMaster",
    [string]$OutputFile = "docs/CI_REVALIDATION_LATEST.md",
    [int]$HistoryLimit = 10
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
    param([string]$Name)
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' is not available in PATH."
    }
}

function Get-Runs {
    param(
        [string]$Workflow,
        [string]$RepoName,
        [int]$Limit
    )

    $raw = gh run list --repo $RepoName --workflow $Workflow --limit $Limit --json databaseId,headSha,status,conclusion,createdAt,updatedAt,displayTitle
    if (-not $raw) {
        return @()
    }
    return ($raw | ConvertFrom-Json)
}

function Get-AnnotationsForRun {
    param(
        [long]$RunId,
        [string]$RepoName
    )

    $annotations = @()
    $run = gh run view $RunId --repo $RepoName --json jobs | ConvertFrom-Json
    if (-not $run.jobs) {
        return $annotations
    }

    foreach ($job in $run.jobs) {
        try {
            $jobAnnotations = gh api "repos/$RepoName/check-runs/$($job.databaseId)/annotations" | ConvertFrom-Json
            foreach ($ann in $jobAnnotations) {
                $annotations += [PSCustomObject]@{
                    jobName = $job.name
                    message = $ann.message
                }
            }
        } catch {
            $annotations += [PSCustomObject]@{
                jobName = $job.name
                message = "Could not load annotations: $($_.Exception.Message)"
            }
        }
    }

    return $annotations
}

function Select-LatestSuccess {
    param([object[]]$Runs)
    return ($Runs | Where-Object { $_.conclusion -eq "success" } | Select-Object -First 1)
}

function New-RunSection {
    param(
        [string]$WorkflowName,
        [object[]]$Runs,
        [string]$RepoName
    )

    $latest = $Runs | Select-Object -First 1
    $latestSuccess = Select-LatestSuccess -Runs $Runs

    $lines = @()
    $lines += "## $WorkflowName"

    if (-not $latest) {
        $lines += ""
        $lines += "No runs found."
        return $lines
    }

    $runUrl = "https://github.com/$RepoName/actions/runs/$($latest.databaseId)"
    $lines += ""
    $lines += "- Latest run: [$($latest.databaseId)]($runUrl)"
    $lines += "- Latest status: $($latest.status) / $($latest.conclusion)"
    $lines += "- Head SHA: $($latest.headSha)"
    $lines += "- Updated at: $($latest.updatedAt)"

    if ($latestSuccess) {
        $successUrl = "https://github.com/$RepoName/actions/runs/$($latestSuccess.databaseId)"
        $lines += "- Latest success: [$($latestSuccess.databaseId)]($successUrl)"
    } else {
        $lines += "- Latest success: none in inspected history"
    }

    $annotations = Get-AnnotationsForRun -RunId $latest.databaseId -RepoName $RepoName
    if ($annotations.Count -gt 0) {
        $lines += ""
        $lines += "### Latest Failure Annotations"
        foreach ($ann in $annotations) {
            $lines += "- [$($ann.jobName)] $($ann.message)"
        }
    }

    $billingHit = $annotations | Where-Object { $_.message -match "payments have failed|spending limit needs to be increased|Billing & plans" }
    if ($billingHit) {
        $lines += ""
        $lines += "Billing blocker detected: yes"
    } else {
        $lines += ""
        $lines += "Billing blocker detected: no"
    }

    return $lines
}

Require-Command -Name "gh"

$codeqlRuns = Get-Runs -Workflow "CodeQL Security Analysis" -RepoName $Repo -Limit $HistoryLimit
$androidRuns = Get-Runs -Workflow "Android CI" -RepoName $Repo -Limit $HistoryLimit

$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$report = @()
$report += "# CI Revalidation Report"
$report += ""
$report += "Generated: $now"
$report += "Repository: $Repo"
$report += ""
$report += (New-RunSection -WorkflowName "CodeQL Security Analysis" -Runs $codeqlRuns -RepoName $Repo)
$report += ""
$report += (New-RunSection -WorkflowName "Android CI" -Runs $androidRuns -RepoName $Repo)

$dir = Split-Path -Parent $OutputFile
if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$report | Set-Content -Path $OutputFile -Encoding UTF8
Write-Host "Report written to $OutputFile"