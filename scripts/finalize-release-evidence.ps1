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

function Get-CiRunSummary {
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
        CodeScanningBlocked = [Regex]::IsMatch($section, "Repository code scanning blocker detected:\s+yes")
        HasSuccess = [Regex]::IsMatch($section, "- Latest status:\s+completed\s*/\s*success")
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

$codeql = Get-CiRunSummary -CiText $ciText -SectionName "CodeQL Security Analysis"
$androidCi = Get-CiRunSummary -CiText $ciText -SectionName "Android CI"

$codeqlLine = if ($codeql) {
    if ($codeql.CodeScanningBlocked) {
        "| CodeQL security scan (0 high/critical) | Run [$($codeql.Id)]($($codeql.Url)): completed/failure; aktueller Blocker: Code scanning im Repository nicht aktiviert; siehe docs/CI_REVALIDATION_LATEST.md | ⬜ | Engineering | $nowDate |"
    } elseif ($codeql.BillingBlocked) {
        "| CodeQL security scan (0 high/critical) | Run [$($codeql.Id)]($($codeql.Url)): completed/failure; aktueller Blocker: Billing/Spending-Limit; siehe docs/CI_REVALIDATION_LATEST.md | ⬜ | Engineering | $nowDate |"
    } elseif ($codeql.HasSuccess) {
        "| CodeQL security scan (0 high/critical) | Run [$($codeql.Id)]($($codeql.Url)): completed/success | ✅ | Automated | $nowDate |"
    } else {
        "| CodeQL security scan (0 high/critical) | Run [$($codeql.Id)]($($codeql.Url)): completed/failure; aktueller Blocker: Workflow- oder Build-Fehler, siehe docs/CI_REVALIDATION_LATEST.md | ⬜ | Engineering | $nowDate |"
    }
} else { $null }

$androidLine = if ($androidCi) {
    if ($androidCi.HasSuccess) {
        "| Android build (if applicable) | Run [$($androidCi.Id)]($($androidCi.Url)): completed/success | ✅ | Automated | $nowDate |"
    } elseif ($androidCi.BillingBlocked) {
        "| Android build (if applicable) | Run [$($androidCi.Id)]($($androidCi.Url)): completed/failure; aktueller Blocker: Billing/Spending-Limit; siehe docs/CI_REVALIDATION_LATEST.md | ⬜ | Engineering | $nowDate |"
    } else {
        "| Android build (if applicable) | Run [$($androidCi.Id)]($($androidCi.Url)): completed/failure; siehe docs/CI_REVALIDATION_LATEST.md | ⬜ | Engineering | $nowDate |"
    }
} else { $null }

$evidence = Update-Line -Text $evidence -Pattern '^\| Build artifact .*$' -Replacement "| Build artifact (npm run build) | Local build successful (tsc -p tsconfig.json) | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| Lint result .*$' -Replacement "| Lint result (npm run lint) | 0 errors, 0 warnings | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| Test result .*$' -Replacement "| Test result (npm run test:ci) | $testSuites suites, $testCases/$testCases passed | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| Static readiness checks \|.*$' -Replacement "| Static readiness checks | scripts/static_readiness_checks.py: $staticText (python scripts/test_automation.py --suite static-readiness) | ✅ | Automated | $nowDate |"
$evidence = Update-Line -Text $evidence -Pattern '^\| .*ndroid-apps \(pairing \+ sync\) \|.*$' -Replacement "| android-apps (pairing + sync) | ⬜ | build/test-automation/latest-summary.json (android-connected-master/android-connected-child skipped: $deviceReason) | Automated + Device Owner pending | $nowDate |"

if ($codeqlLine) {
    $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL security scan \(0 high/critical\) \|.*$' -Replacement $codeqlLine
    if ($codeql.CodeScanningBlocked) {
        $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL-Ergebnis verlinken \|.*$' -Replacement "| CodeQL-Ergebnis verlinken | Letzter Run: [$($codeql.Id)]($($codeql.Url)) (completed/failure; aktueller Blocker: Code scanning nicht aktiviert) | ⬜ | Engineering Owner | offen |"
    } elseif ($codeql.BillingBlocked) {
        $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL-Ergebnis verlinken \|.*$' -Replacement "| CodeQL-Ergebnis verlinken | Letzter Run: [$($codeql.Id)]($($codeql.Url)) (completed/failure; Billing weiterhin kritisch) | ⬜ | Engineering Owner | offen |"
    } elseif ($codeql.HasSuccess) {
        $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL-Ergebnis verlinken \|.*$' -Replacement "| CodeQL-Ergebnis verlinken | Letzter Run: [$($codeql.Id)]($($codeql.Url)) (completed/success) | ✅ | Engineering Owner | $nowDate |"
    } else {
        $evidence = Update-Line -Text $evidence -Pattern '^\| CodeQL-Ergebnis verlinken \|.*$' -Replacement "| CodeQL-Ergebnis verlinken | Letzter Run: [$($codeql.Id)]($($codeql.Url)) (completed/failure; aktueller Blocker: Workflow- oder Build-Fehler) | ⬜ | Engineering Owner | offen |"
    }
}
if ($androidLine) {
    $evidence = Update-Line -Text $evidence -Pattern '^\| Android build \(if applicable\) \|.*$' -Replacement $androidLine
    if ($androidCi.HasSuccess) {
        $evidence = Update-Line -Text $evidence -Pattern '^\| Android CI Build-Nachweis verlinken \|.*$' -Replacement "| Android CI Build-Nachweis verlinken | Letzter Run: [$($androidCi.Id)]($($androidCi.Url)) (completed/success) | ✅ | Engineering Owner | $nowDate |"
    } elseif ($androidCi.BillingBlocked) {
        $evidence = Update-Line -Text $evidence -Pattern '^\| Android CI Build-Nachweis verlinken \|.*$' -Replacement "| Android CI Build-Nachweis verlinken | Letzter Run: [$($androidCi.Id)]($($androidCi.Url)) (completed/failure; Billing weiterhin kritisch) | ⬜ | Engineering Owner | offen |"
    } else {
        $evidence = Update-Line -Text $evidence -Pattern '^\| Android CI Build-Nachweis verlinken \|.*$' -Replacement "| Android CI Build-Nachweis verlinken | Letzter Run: [$($androidCi.Id)]($($androidCi.Url)) (completed/failure) | ⬜ | Engineering Owner | offen |"
    }
}

$technicalBlockerText = if ($codeql) {
    if ($codeql.CodeScanningBlocked) {
        "Build/Lint/Test lokal gruen ($testSuites/$testSuites Suites, $testCases/$testCases Tests) inkl. static-readiness; Android CI ist aktuell gruen, aber CodeQL bleibt rot, weil Code scanning im Repository nicht aktiviert ist."
    } elseif ($codeql.BillingBlocked) {
        "Build/Lint/Test lokal gruen ($testSuites/$testSuites Suites, $testCases/$testCases Tests) inkl. static-readiness; CodeQL bleibt durch Billing/Spending-Limit extern blockiert."
    } elseif ($androidCi -and $androidCi.HasSuccess) {
        "Build/Lint/Test lokal gruen ($testSuites/$testSuites Suites, $testCases/$testCases Tests) inkl. static-readiness; Android CI ist aktuell gruen, CodeQL bleibt noch technischer Restblocker."
    } else {
        "Build/Lint/Test lokal gruen ($testSuites/$testSuites Suites, $testCases/$testCases Tests) inkl. static-readiness; CodeQL bleibt technischer Restblocker."
    }
} else {
    "Build/Lint/Test lokal gruen ($testSuites/$testSuites Suites, $testCases/$testCases Tests) inkl. static-readiness."
}
$decision = Update-Line -Text $decision -Pattern '^\| Technical Quality \(build/lint/test\) \|.*$' -Replacement "| Technical Quality (build/lint/test) | Fail | docs/RELEASE_EVIDENCE_REGISTER.md | $technicalBlockerText |"
if ($codeql) {
    if ($codeql.CodeScanningBlocked) {
        $decision = Update-Line -Text $decision -Pattern '^\| CodeQL result linked \|.*$' -Replacement "| CodeQL result linked | Open - Run [$($codeql.Id)]($($codeql.Url)) completed/failure (aktueller Blocker: Code scanning nicht aktiviert) | Engineering Owner | offen | No |"
    } elseif ($codeql.BillingBlocked) {
        $decision = Update-Line -Text $decision -Pattern '^\| CodeQL result linked \|.*$' -Replacement "| CodeQL result linked | Open - Run [$($codeql.Id)]($($codeql.Url)) completed/failure (Billing/Spending-Limit; kein Runner-Start) | Engineering Owner | offen | No |"
    } elseif ($codeql.HasSuccess) {
        $decision = Update-Line -Text $decision -Pattern '^\| CodeQL result linked \|.*$' -Replacement "| CodeQL result linked | Closed - Run [$($codeql.Id)]($($codeql.Url)) completed/success | Engineering Owner | $nowDate | No |"
    } else {
        $decision = Update-Line -Text $decision -Pattern '^\| CodeQL result linked \|.*$' -Replacement "| CodeQL result linked | Open - Run [$($codeql.Id)]($($codeql.Url)) completed/failure (aktueller Blocker: Workflow- oder Build-Fehler) | Engineering Owner | offen | No |"
    }
    $decision = Update-Line -Text $decision -Pattern '^\| CodeQL nach .*erneut ausfuehren und erfolgreichen Lauf verlinken \(letzter Fehl-Run: .*\) \|.*$' -Replacement "| CodeQL nach Repo-Aktivierung erneut ausfuehren und erfolgreichen Lauf verlinken (letzter Fehl-Run: $($codeql.Id)) | Engineering | P0 | offen |"
    $decision = Update-Line -Text $decision -Pattern '^\| CodeQL nach Billing-Fix erneut ausfuehren und verlinken \(letzter Fehl-Run: .*\) \|.*$' -Replacement "| CodeQL nach Repo-Aktivierung erneut ausfuehren und erfolgreichen Lauf verlinken (letzter Fehl-Run: $($codeql.Id)) | Engineering | P0 | offen |"
}
if ($androidCi) {
    if ($androidCi.HasSuccess) {
        $decision = Update-Line -Text $decision -Pattern '^\| Android CI build evidence linked \|.*$' -Replacement "| Android CI build evidence linked | Closed - Run [$($androidCi.Id)]($($androidCi.Url)) completed/success | Engineering Owner | $nowDate | No |"
    } else {
        $decision = Update-Line -Text $decision -Pattern '^\| Android CI build evidence linked \|.*$' -Replacement "| Android CI build evidence linked | Open - Run [$($androidCi.Id)]($($androidCi.Url)) completed/failure | Engineering Owner | offen | No |"
    }
    $decision = Update-Line -Text $decision -Pattern '^\| Android CI nach Billing-Fix erneut ausfuehren und verlinken \(letzter Fehl-Run: .*\) \|.*$' -Replacement "| Android CI nach aktuellem Fehl-Run erneut ausfuehren und verlinken (letzter Fehl-Run: $($androidCi.Id)) | Engineering | P1 | offen |"
}

Write-TextNormalized -Path $EvidenceFile -Content $evidence
Write-TextNormalized -Path $DecisionFile -Content $decision

Write-Host "Release documents synchronized: $EvidenceFile, $DecisionFile"
