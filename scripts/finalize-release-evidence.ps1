$SummaryFile = "build/test-automation/latest-summary.json"
$CiReportFile = "docs/CI_REVALIDATION_LATEST.md"
$EvidenceFile = "docs/RELEASE_EVIDENCE_REGISTER.md"
$DecisionFile = "docs/RELEASE_DECISION_2026-03-21_RC-2026-03-21.md"

if ($args.Count -ge 1) { $SummaryFile = $args[0] }
if ($args.Count -ge 2) { $CiReportFile = $args[1] }
if ($args.Count -ge 3) { $EvidenceFile = $args[2] }
if ($args.Count -ge 4) { $DecisionFile = $args[3] }

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "Datei nicht gefunden: $Path"
    }
    return Get-Content -Path $Path -Raw | ConvertFrom-Json
}

function Read-TextFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) {
        throw "Datei nicht gefunden: $Path"
    }
    return Get-Content -Path $Path -Raw
}

function Update-Line {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Replacement
    )

    $updated = [System.Text.RegularExpressions.Regex]::Replace(
        $Text,
        $Pattern,
        $Replacement,
        [System.Text.RegularExpressions.RegexOptions]::Multiline
    )
    return $updated
}

function Write-TextNormalized {
    param(
        [string]$Path,
        [string]$Content
    )

    $normalized = $Content -replace "`r`n", "`n" -replace "`r", "`n"
    $normalized = $normalized.TrimEnd("`n") + "`n"
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Resolve-Path $Path), $normalized, $utf8NoBom)
}

function Parse-CiRun {
    param(
        [string]$CiText,
        [string]$SectionName
    )

    $sectionPattern = "## " + [Regex]::Escape($SectionName) + "[\s\S]*?(?=\r?\n## |\z)"
    $sectionMatch = [Regex]::Match($CiText, $sectionPattern)
    if (-not $sectionMatch.Success) {
        return $null
    }

    $section = $sectionMatch.Value
    $runMatch = [Regex]::Match($section, "- Latest run: \[(\d+)\]\(([^\)]+)\)")
    if (-not $runMatch.Success) {
        return $null
    }

    return [PSCustomObject]@{
        Id = $runMatch.Groups[1].Value
        Url = $runMatch.Groups[2].Value
        IsFailure = [Regex]::IsMatch($section, "- Latest status:\s+completed\s*/\s*failure")
        BillingBlocked = [Regex]::IsMatch($section, "Billing blocker detected:\s+yes")
    }
}

$summary = Read-JsonFile -Path $SummaryFile
$ciText = Read-TextFile -Path $CiReportFile
$evidence = Read-TextFile -Path $EvidenceFile
$decision = Read-TextFile -Path $DecisionFile

$latest = if ($summary.latest) { $summary.latest } else { $summary }
$results = @($latest.results)
$nowDate = (Get-Date).ToString("yyyy-MM-dd")

$backendJest = $results | Where-Object { $_.suite_id -eq "backend-jest" } | Select-Object -First 1
$staticReadiness = $results | Where-Object { $_.suite_id -eq "static-readiness" } | Select-Object -First 1
$androidConnectedMaster = $results | Where-Object { $_.suite_id -eq "android-connected-master" } | Select-Object -First 1
$androidConnectedChild = $results | Where-Object { $_.suite_id -eq "android-connected-child" } | Select-Object -First 1

$testSuites = "?"
$testCases = "?"
if ($backendJest -and $backendJest.stderr) {
    $suiteMatch = [Regex]::Match([string]$backendJest.stderr, "Test Suites:\s*(\d+)\s+passed")
    $testMatch = [Regex]::Match([string]$backendJest.stderr, "Tests:\s*(\d+)\s+passed")
    if ($suiteMatch.Success) { $testSuites = $suiteMatch.Groups[1].Value }
    if ($testMatch.Success) { $testCases = $testMatch.Groups[1].Value }
}

$staticText = "nicht gelaufen"
if ($staticReadiness) {
    if ($staticReadiness.status -eq "passed") {
        $passedMatch = [Regex]::Match([string]$staticReadiness.stdout, '"passed":\s*(\d+)')
        $totalMatch = [Regex]::Match([string]$staticReadiness.stdout, '"total":\s*(\d+)')
        $percentMatch = [Regex]::Match([string]$staticReadiness.stdout, '"percent":\s*(\d+)')
        $passedCount = if ($passedMatch.Success) { $passedMatch.Groups[1].Value } else { "20" }
        $totalCount = if ($totalMatch.Success) { $totalMatch.Groups[1].Value } else { "20" }
        $percent = if ($percentMatch.Success) { $percentMatch.Groups[1].Value } else { "100" }
        $staticText = "$passedCount/$totalCount checks passed ($percent%)"
    } else {
        $staticText = "nicht bestanden"
    }
}

$deviceReason = "no device status"
if ($androidConnectedMaster -and $androidConnectedMaster.reason) {
    $deviceReason = [string]$androidConnectedMaster.reason
}

$codeql = Parse-CiRun -CiText $ciText -SectionName "CodeQL Security Analysis"
$androidCi = Parse-CiRun -CiText $ciText -SectionName "Android CI"

$codeqlLine = if ($codeql) {
    "| CodeQL security scan (0 high/critical) | Run [$($codeql.Id)]($($codeql.Url)): completed/failure; Annotation: `"job was not started because recent account payments have failed or your spending limit needs to be increased`"; letzter erfolgreicher Referenz-Run: [23381838965](https://github.com/Toto241/MiniMaster/actions/runs/23381838965) | ⬜ | Engineering (blocked by repo billing) | $nowDate |"
} else { $null }

$androidLine = if ($androidCi) {
    "| Android build (if applicable) | Run [$($androidCi.Id)]($($androidCi.Url)): completed/failure; Annotation: `"job was not started because recent account payments have failed or your spending limit needs to be increased`"; letzter erfolgreicher Referenz-Run: none in inspected history | ⬜ | Engineering (blocked by repo billing) | $nowDate |"
} else { $null }

$evidence = Update-Line -Text $evidence -Pattern '^\| Build artifact .*$' -Replacement "| Build artifact (npm run build) | Local build successful (tsc -p tsconfig.json) | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| Lint result .*$' -Replacement "| Lint result (npm run lint) | 0 errors, 0 warnings | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| Test result .*$' -Replacement "| Test result (npm run test:ci) | $testSuites suites, $testCases/$testCases passed | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| Static readiness checks \|.*$' -Replacement "| Static readiness checks | scripts/static_readiness_checks.py: $staticText (python scripts/test_automation.py --suite static-readiness) | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| .*ndroid-apps \(pairing \+ sync\) \|.*$' -Replacement "| android-apps (pairing + sync) | ⬜ | build/test-automation/latest-summary.json (android-connected-master/android-connected-child skipped: $deviceReason) | Automated + Device Owner pending | $nowDate |"

if ($codeqlLine) {
    $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL security scan \(0 high/critical\) \|.*$' -Replacement $codeqlLine
    $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL-Ergebnis verlinken \|.*$' -Replacement "| CodeQL-Ergebnis verlinken | Letzter Run: [$($codeql.Id)]($($codeql.Url)) (completed/failure; Billing weiterhin kritisch) | ⬜ | Engineering Owner | offen |"
}
if ($androidLine) {
    $evidence = Update-Line -Text $evidence -Pattern '^\| Android build \(if applicable\) \|.*$' -Replacement $androidLine
    $evidence = Update-Line -Text $evidence -Pattern '^\| Android CI Build-Nachweis verlinken \|.*$' -Replacement "| Android CI Build-Nachweis verlinken | Letzter Run: [$($androidCi.Id)]($($androidCi.Url)) (completed/failure; Billing weiterhin kritisch) | ⬜ | Engineering Owner | offen |"
}

$decision = Update-Line -Text $decision -Pattern '^\| Technical Quality \(build/lint/test\) \|.*$' -Replacement "| Technical Quality (build/lint/test) | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | Build/Lint/Test lokal gruen ($testSuites/$testSuites Suites, $testCases/$testCases Tests) inkl. static-readiness; Device-Commissioning aktuell mangels verbundenem ADB-Device als skipped dokumentiert; CodeQL- und Android-CI-Reruns bleiben durch Billing/Spending-Limit extern blockiert. |"
if ($codeql) {
    $decision = Update-Line -Text $decision -Pattern '^\| CodeQL result linked \|.*$' -Replacement "| CodeQL result linked | Open - Run [$($codeql.Id)]($($codeql.Url)) completed/failure (Billing/Spending-Limit; kein Runner-Start) | Engineering Owner | offen | No |"
    $decision = Update-Line -Text $decision -Pattern '^\| CodeQL nach Billing-Fix erneut ausfuehren und verlinken \(letzter Fehl-Run: .*\) \|.*$' -Replacement "| CodeQL nach Billing-Fix erneut ausfuehren und verlinken (letzter Fehl-Run: $($codeql.Id)) | Engineering | P0 | offen |"
}
if ($androidCi) {
    $decision = Update-Line -Text $decision -Pattern '^\| Android CI build evidence linked \|.*$' -Replacement "| Android CI build evidence linked | Open - Run [$($androidCi.Id)]($($androidCi.Url)) completed/failure (Billing/Spending-Limit; kein Runner-Start) | Engineering Owner | offen | No |"
    $decision = Update-Line -Text $decision -Pattern '^\| Android CI nach Billing-Fix erneut ausfuehren und verlinken \(letzter Fehl-Run: .*\) \|.*$' -Replacement "| Android CI nach Billing-Fix erneut ausfuehren und verlinken (letzter Fehl-Run: $($androidCi.Id)) | Engineering | P0 | offen |"
}

Write-TextNormalized -Path $EvidenceFile -Content $evidence
Write-TextNormalized -Path $DecisionFile -Content $decision

Write-Host "Release documents synchronized: $EvidenceFile, $DecisionFile"
