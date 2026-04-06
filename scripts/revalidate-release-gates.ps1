param(
    [string]$Repo = "Toto241/MiniMaster",
    [string]$OutputFile = "docs/CI_REVALIDATION_LATEST.md",
    [int]$HistoryLimit = 10,
    [switch]$RerunLatestFailed
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-CommandAvailable {
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

    $raw = & gh run list --repo $RepoName --workflow $Workflow --limit $Limit --json databaseId,headSha,status,conclusion,createdAt,updatedAt,displayTitle 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        $message = ($raw | Out-String).Trim()
        if (-not [string]::IsNullOrWhiteSpace($message)) {
            Write-Warning "Could not load workflow runs for '$Workflow': $message"
        } else {
            Write-Warning "Could not load workflow runs for '$Workflow' (gh exit code $exitCode)."
        }
        return @()
    }

    $json = ($raw | Out-String).Trim()
    if (-not $json) {
        return @()
    }

    try {
        $parsed = $json | ConvertFrom-Json
    } catch {
        Write-Warning "Could not parse workflow runs for '$Workflow' as JSON: $($_.Exception.Message)"
        return @()
    }

    if ($parsed -is [System.Array]) {
        return @($parsed)
    }
    return @($parsed)
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
    return ($Runs | Where-Object { $_ -and $_.PSObject.Properties["conclusion"] -and $_.conclusion -eq "success" } | Select-Object -First 1)
}

function Test-BillingBlocker {
    param([object[]]$Annotations)

    if (-not $Annotations) {
        return $false
    }

    $hit = $Annotations | Where-Object {
        $_.message -match "payments have failed|spending limit needs to be increased|Billing & plans"
    }
    return [bool]$hit
}

function Test-CodeScanningBlocker {
    param([object[]]$Annotations)

    if (-not $Annotations) {
        return $false
    }

    $hit = $Annotations | Where-Object {
        $_.message -match "Code scanning is not enabled|security-events: read permission|CodeQL Action API endpoints"
    }
    return [bool]$hit
}

function Invoke-RerunIfRequested {
    param(
        [string]$WorkflowName,
        [object[]]$Runs,
        [string]$RepoName,
        [bool]$ShouldRerun
    )

    if (-not $ShouldRerun) {
        return
    }

    $latest = $Runs | Select-Object -First 1
    if (-not $latest) {
        Write-Host "No runs available to rerun for workflow '$WorkflowName'."
        return
    }

    if (-not $latest.PSObject.Properties["conclusion"] -or -not $latest.PSObject.Properties["databaseId"]) {
        Write-Host "Latest run payload for '$WorkflowName' is incomplete; rerun skipped."
        return
    }

    if ($latest.conclusion -ne "failure") {
        Write-Host "Latest run for '$WorkflowName' is not failed; rerun skipped."
        return
    }

    try {
        gh run rerun $latest.databaseId --repo $RepoName | Out-Null
        Write-Host "Requested rerun for '$WorkflowName' run $($latest.databaseId)."
    } catch {
        Write-Host "Could not request rerun for '$WorkflowName': $($_.Exception.Message)"
    }
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

    if (-not $latest.PSObject.Properties["databaseId"]) {
        $lines += ""
        $lines += "Latest run payload is incomplete; GitHub CLI did not return the expected fields."
        return $lines
    }

    $runUrl = "https://github.com/$RepoName/actions/runs/$($latest.databaseId)"
    $status = if ([string]::IsNullOrWhiteSpace([string]$latest.status)) { "unknown" } else { [string]$latest.status }
    $conclusion = if ([string]::IsNullOrWhiteSpace([string]$latest.conclusion)) { "pending" } else { [string]$latest.conclusion }

    $lines += ""
    $lines += "- Latest run: [$($latest.databaseId)]($runUrl)"
    $lines += "- Latest status: $status / $conclusion"
    $lines += "- Head SHA: $($latest.headSha)"
    $lines += "- Updated at: $($latest.updatedAt)"

    if ($latestSuccess) {
        $successUrl = "https://github.com/$RepoName/actions/runs/$($latestSuccess.databaseId)"
        $lines += "- Latest success: [$($latestSuccess.databaseId)]($successUrl)"
    } else {
        $lines += "- Latest success: none in inspected history"
    }

    if ($status -ne "completed") {
        $lines += ""
        $lines += "Run is not completed yet; annotations are not available."
        $lines += ""
        $lines += "Billing blocker detected: pending"
        $lines += "Repository code scanning blocker detected: pending"
        return $lines
    }

    $annotations = Get-AnnotationsForRun -RunId $latest.databaseId -RepoName $RepoName
    if ($annotations.Count -gt 0) {
        $lines += ""
        $lines += "### Latest Failure Annotations"
        foreach ($ann in $annotations) {
            $lines += "- [$($ann.jobName)] $($ann.message)"
        }
    }

    $billingHit = Test-BillingBlocker -Annotations $annotations
    if ($billingHit) {
        $lines += ""
        $lines += "Billing blocker detected: yes"
    } else {
        $lines += ""
        $lines += "Billing blocker detected: no"
    }

    $codeScanningHit = Test-CodeScanningBlocker -Annotations $annotations
    if ($codeScanningHit) {
        $lines += "Repository code scanning blocker detected: yes"
    } else {
        $lines += "Repository code scanning blocker detected: no"
    }

    return $lines
}

Test-CommandAvailable -Name "gh"

$codeqlRuns = Get-Runs -Workflow "CodeQL Security Analysis" -RepoName $Repo -Limit $HistoryLimit
$androidRuns = Get-Runs -Workflow "Android CI" -RepoName $Repo -Limit $HistoryLimit

Invoke-RerunIfRequested -WorkflowName "CodeQL Security Analysis" -Runs $codeqlRuns -RepoName $Repo -ShouldRerun:$RerunLatestFailed
Invoke-RerunIfRequested -WorkflowName "Android CI" -Runs $androidRuns -RepoName $Repo -ShouldRerun:$RerunLatestFailed

if ($RerunLatestFailed) {
    Start-Sleep -Seconds 2
    $codeqlRuns = Get-Runs -Workflow "CodeQL Security Analysis" -RepoName $Repo -Limit $HistoryLimit
    $androidRuns = Get-Runs -Workflow "Android CI" -RepoName $Repo -Limit $HistoryLimit
}

$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"
$report = @()
$report += "# CI Revalidation Report"
$report += ""
$report += "Generated: $now"
$report += "Repository: $Repo"
$report += "Rerun requested for latest failures: $($RerunLatestFailed.IsPresent.ToString().ToLowerInvariant())"
$report += ""
$report += (New-RunSection -WorkflowName "CodeQL Security Analysis" -Runs $codeqlRuns -RepoName $Repo)
$report += ""
$report += (New-RunSection -WorkflowName "Android CI" -Runs $androidRuns -RepoName $Repo)

$codeqlAnnotations = @()
$androidAnnotations = @()
if ($codeqlRuns.Count -gt 0) {
    if ($codeqlRuns[0].status -eq "completed") {
        $codeqlAnnotations = Get-AnnotationsForRun -RunId ($codeqlRuns[0].databaseId) -RepoName $Repo
    }
}
if ($androidRuns.Count -gt 0) {
    if ($androidRuns[0].status -eq "completed") {
        $androidAnnotations = Get-AnnotationsForRun -RunId ($androidRuns[0].databaseId) -RepoName $Repo
    }
}

$hasBillingBlocker = (Test-BillingBlocker -Annotations $codeqlAnnotations) -or (Test-BillingBlocker -Annotations $androidAnnotations)
$hasCodeScanningBlocker = Test-CodeScanningBlocker -Annotations $codeqlAnnotations
$hasPendingRun = ($codeqlRuns.Count -gt 0 -and $codeqlRuns[0].status -ne "completed") -or ($androidRuns.Count -gt 0 -and $androidRuns[0].status -ne "completed")

$report += ""
$report += "## Recommendation"
if ($hasPendingRun) {
    $report += "- At least one tracked workflow run is still pending; wait for completion before drawing final release conclusions from this report."
    $report += "- Re-run this script after the pending workflow completes to refresh blocker classification."
} elseif ($hasBillingBlocker) {
    $report += "- Immediate action: Resolve GitHub Actions billing/spending-limit issue in account settings."
    $report += "- Then rerun this script with -RerunLatestFailed to request reruns and regenerate evidence."
} elseif ($hasCodeScanningBlocker) {
    $report += "- Enable GitHub code scanning in the repository settings before treating CodeQL as a releasable gate."
    $report += "- After enabling it, rerun the workflow and regenerate this report to verify the remaining build-level issues."
} else {
    $report += "- No billing blocker detected in latest run annotations."
    $report += "- Continue with code/workflow-level troubleshooting if runs still fail."
}

$dir = Split-Path -Parent $OutputFile
if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

$report | Set-Content -Path $OutputFile -Encoding UTF8
Write-Host "Report written to $OutputFile"
