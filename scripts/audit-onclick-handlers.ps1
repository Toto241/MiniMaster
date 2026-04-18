# scripts/audit-onclick-handlers.ps1
# Inventarisiert inline onclick-Attribute im Admin-Panel als Vorbereitung
# fuer Welle 3 (Migration zu addEventListener). Schreibt einen Markdown-
# Bericht nach build/reports/onclick-audit.md.
[CmdletBinding()]
param(
  [string]$Root = (Resolve-Path "$PSScriptRoot/../admin-panel"),
  [string]$Output = (Resolve-Path "$PSScriptRoot/../build/reports").Path + "/onclick-audit.md"
)

$ErrorActionPreference = "Stop"
$reportDir = Split-Path -Parent $Output
if (-not (Test-Path $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }

$files = Get-ChildItem -Path $Root -Recurse -Include *.html,*.js -File `
  | Where-Object { $_.FullName -notmatch '\\modules\\' -and $_.FullName -notmatch 'service-worker\.js$' }

$rows = @()
$pattern = 'onclick\s*=\s*"([^"]+)"'
foreach ($f in $files) {
  $rel = (Resolve-Path -LiteralPath $f.FullName -Relative)
  $lines = Get-Content -LiteralPath $f.FullName
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $matches = [regex]::Matches($lines[$i], $pattern)
    foreach ($m in $matches) {
      $expr = $m.Groups[1].Value.Trim()
      $callMatch = [regex]::Match($expr, '^(\w+)')
      $fn = if ($callMatch.Success) { $callMatch.Groups[1].Value } else { "<expr>" }
      $rows += [pscustomobject]@{
        File   = $rel
        Line   = ($i + 1)
        Fn     = $fn
        Expr   = $expr
      }
    }
  }
}

$total = $rows.Count
$byFile = $rows | Group-Object File | Sort-Object Count -Descending
$byFn   = $rows | Group-Object Fn   | Sort-Object Count -Descending

$md = @()
$md += "# onclick-Inventar (Welle 3 Vorbereitung)"
$md += ""
$md += "Generiert: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"
$md += ""
$md += "## Gesamt: $total Inline-Handler"
$md += ""
$md += "## Top-Dateien"
$md += ""
$md += "| Datei | Anzahl |"
$md += "|---|---:|"
foreach ($g in $byFile) { $md += "| $($g.Name) | $($g.Count) |" }
$md += ""
$md += "## Top-Handler-Funktionen"
$md += ""
$md += "| Funktion | Anzahl |"
$md += "|---|---:|"
foreach ($g in ($byFn | Select-Object -First 30)) { $md += "| ``$($g.Name)`` | $($g.Count) |" }
$md += ""
$md += "## Migrations-Strategie"
$md += ""
$md += "Welle 3 ersetzt diese Inline-Handler in mehreren Iterationen durch addEventListener-Bindings nach data-action-Attributen. Pattern (Vorschlag):"
$md += ""
$md += '```html'
$md += '<button data-action="loadTestingRegister">QA neu laden</button>'
$md += '```'
$md += ""
$md += '```js'
$md += "document.addEventListener('click', (ev) => {"
$md += "  const target = ev.target?.closest('[data-action]');"
$md += "  if (!target) return;"
$md += "  const fnName = target.dataset.action;"
$md += "  const fn = window[fnName];"
$md += "  if (typeof fn === 'function') { ev.preventDefault(); fn.call(target, ev); }"
$md += "});"
$md += '```'
$md += ""
$md += "Empfohlene Reihenfolge: erst die haeufigsten Funktionen aus der Top-30-Tabelle, jede Iteration mit Bundle-Budget-Gate + Smoke-Test."

$md | Set-Content -LiteralPath $Output -Encoding UTF8
Write-Host ("OK. {0} Handler in {1} Dateien -> {2}" -f $total, $byFile.Count, $Output)
