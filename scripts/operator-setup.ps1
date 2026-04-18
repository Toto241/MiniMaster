<#
.SYNOPSIS
  Operator-Inbetriebnahme-Tool für MiniMaster.
.DESCRIPTION
  Vereint die wichtigsten Setup-Aufgaben des Betreibers in einem einzigen
  PowerShell-Skript:
   - status        : Ruft den Backend-Status (getOperatorSetupStatus) ab.
   - set-secret    : firebase functions:secrets:set <NAME>
   - rotate-token  : Erzeugt frischen ADMIN_RECOVERY_TOKEN + setzt _ROTATED_AT.
   - create-topic  : Legt das Pub/Sub-Topic für Play-Billing-RTDN an.
   - apply-targets : firebase target:apply hosting <target> <site>
   - deploy-rules  : firebase deploy --only firestore:rules,storage
   - upload-config : Kopiert google-services.json / GoogleService-Info.plist
                     an die erwarteten Pfade im Repo.
   - mark          : Setzt einen manuellen Checklist-Punkt
                     (setOperatorSetupChecklistItem) auf done/undone.

  Voraussetzungen:
   - Firebase CLI angemeldet (firebase login)
   - gcloud CLI angemeldet (für create-topic)
   - Für status/mark: ID-Token eines Admin-Users (per Parameter -IdToken
     oder Umgebungsvariable MINIMASTER_ADMIN_ID_TOKEN). Token kann z.B. im
     Admin-Panel via DevTools (window.__getIdToken()) abgegriffen werden.

.EXAMPLE
  .\scripts\operator-setup.ps1 -Action status -ProjectId my-project -Region europe-west1
.EXAMPLE
  .\scripts\operator-setup.ps1 -Action rotate-token -ProjectId my-project
.EXAMPLE
  .\scripts\operator-setup.ps1 -Action create-topic -ProjectId my-project
.EXAMPLE
  .\scripts\operator-setup.ps1 -Action mark -ItemId play_developer_account -Done $true -ProjectId my-project -Region europe-west1
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("status","set-secret","rotate-token","create-topic","apply-targets","deploy-rules","upload-config","mark")]
  [string]$Action,

  [string]$ProjectId,
  [string]$Region = "europe-west1",

  # set-secret
  [string]$SecretName,

  # apply-targets
  [string]$TargetName,
  [string]$SiteId,

  # upload-config
  [string]$SourcePath,
  [ValidateSet("android-master","android-child","ios-master","ios-child","service-account")]
  [string]$ConfigKind,

  # mark
  [string]$ItemId,
  [Nullable[bool]]$Done,
  [string]$Note,

  # auth
  [string]$IdToken = $env:MINIMASTER_ADMIN_ID_TOKEN,

  # output
  [string]$OutFile,

  # create-topic
  [string]$TopicName = "play-billing-notifications"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

function Require-Tool([string]$tool, [string]$installHint) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "Tool '$tool' nicht im PATH gefunden. Installation: $installHint"
  }
}

function Invoke-CallableFunction([string]$fnName, [hashtable]$payload) {
  if (-not $ProjectId) { throw "Parameter -ProjectId ist erforderlich." }
  if (-not $IdToken) { throw "Admin-IdToken fehlt. Setze -IdToken oder Env MINIMASTER_ADMIN_ID_TOKEN. Im Admin-Panel via DevTools: await firebase.auth().currentUser.getIdToken()." }
  $url = "https://$Region-$ProjectId.cloudfunctions.net/$fnName"
  $body = @{ data = $payload } | ConvertTo-Json -Depth 10 -Compress
  $headers = @{
    "Authorization" = "Bearer $IdToken"
    "Content-Type"  = "application/json"
  }
  Write-Host "→ POST $url" -ForegroundColor Cyan
  $resp = Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $body
  return $resp.result
}

switch ($Action) {

  "status" {
    $result = Invoke-CallableFunction -fnName "getOperatorSetupStatus" -payload @{}
    $json = $result | ConvertTo-Json -Depth 10
    Write-Host ""
    Write-Host "── INBETRIEBNAHME-STATUS ──" -ForegroundColor Green
    Write-Host "Projekt   : $($result.projectId)"
    Write-Host "Readiness : $($result.readiness)"
    Write-Host "Blockers  : $((($result.blockers) -join ' | '))"
    Write-Host ""
    Write-Host ("Manuelle Checkliste : {0}/{1} erledigt ({2}%)" -f $result.manualChecklist.requiredDone, $result.manualChecklist.requiredTotal, $result.manualChecklist.progressPct)
    Write-Host ""
    if ($OutFile) {
      $json | Set-Content -Path $OutFile -Encoding UTF8
      Write-Host "Vollständiger Status in $OutFile gespeichert." -ForegroundColor Green
    } else {
      Write-Host $json
    }
  }

  "mark" {
    if (-not $ItemId) { throw "Parameter -ItemId ist erforderlich." }
    if ($null -eq $Done) { throw "Parameter -Done (true|false) ist erforderlich." }
    $payload = @{ itemId = $ItemId; done = [bool]$Done }
    if ($Note) { $payload.note = $Note }
    $result = Invoke-CallableFunction -fnName "setOperatorSetupChecklistItem" -payload $payload
    Write-Host "✔ Checklist-Punkt '$ItemId' = $($result.done)" -ForegroundColor Green
  }

  "set-secret" {
    Require-Tool "firebase" "npm install -g firebase-tools"
    if (-not $SecretName) { throw "Parameter -SecretName ist erforderlich (z.B. GEMINI_API_KEY)." }
    if (-not $ProjectId)  { throw "Parameter -ProjectId ist erforderlich." }
    & firebase --project $ProjectId functions:secrets:set $SecretName
  }

  "rotate-token" {
    Require-Tool "firebase" "npm install -g firebase-tools"
    if (-not $ProjectId) { throw "Parameter -ProjectId ist erforderlich." }
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $newToken = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+","-").Replace("/","_")
    Write-Host "Neues Recovery-Token generiert (32 Bytes, URL-safe Base64)." -ForegroundColor Cyan
    Write-Host "Token wird jetzt im Secret Manager als ADMIN_RECOVERY_TOKEN gesetzt." -ForegroundColor Cyan
    $tmp = New-TemporaryFile
    Set-Content -Path $tmp -Value $newToken -NoNewline -Encoding UTF8
    try {
      Get-Content $tmp -Raw | & firebase --project $ProjectId functions:secrets:set ADMIN_RECOVERY_TOKEN --data-file -
    } finally {
      Remove-Item $tmp -Force
    }
    $today = (Get-Date -Format "yyyy-MM-dd")
    & firebase --project $ProjectId functions:config:set "admin.recovery_token_rotated_at=$today"
    Write-Host "✔ Token rotiert; ADMIN_RECOVERY_TOKEN_ROTATED_AT=$today" -ForegroundColor Green
    Write-Host "Hinweis: Das alte Token bleibt während der Overlap-Phase via Komma-Liste optional gültig." -ForegroundColor Yellow
  }

  "create-topic" {
    Require-Tool "gcloud" "https://cloud.google.com/sdk/docs/install"
    if (-not $ProjectId) { throw "Parameter -ProjectId ist erforderlich." }
    & gcloud --project $ProjectId pubsub topics create $TopicName 2>$null
    & gcloud --project $ProjectId pubsub topics describe $TopicName | Out-Host
    Write-Host "✔ Pub/Sub-Topic '$TopicName' im Projekt $ProjectId vorhanden." -ForegroundColor Green
    Write-Host "→ In Play Console → Monetarisierung → Setup → Cloud Pub/Sub-Thema '$TopicName' eintragen." -ForegroundColor Cyan
  }

  "apply-targets" {
    Require-Tool "firebase" "npm install -g firebase-tools"
    if (-not $ProjectId) { throw "Parameter -ProjectId ist erforderlich." }
    if (-not $TargetName) { throw "Parameter -TargetName ist erforderlich (z.B. admin-panel)." }
    if (-not $SiteId)     { throw "Parameter -SiteId ist erforderlich (Hosting Site)." }
    & firebase --project $ProjectId target:apply hosting $TargetName $SiteId
  }

  "deploy-rules" {
    Require-Tool "firebase" "npm install -g firebase-tools"
    if (-not $ProjectId) { throw "Parameter -ProjectId ist erforderlich." }
    Push-Location $repoRoot
    try {
      & firebase --project $ProjectId deploy --only firestore:rules,storage
    } finally { Pop-Location }
  }

  "upload-config" {
    if (-not $SourcePath) { throw "Parameter -SourcePath ist erforderlich." }
    if (-not $ConfigKind)  { throw "Parameter -ConfigKind ist erforderlich." }
    if (-not (Test-Path $SourcePath)) { throw "Quelldatei nicht gefunden: $SourcePath" }
    $targets = @{
      "android-master"  = "masterApp/google-services.json"
      "android-child"   = "childApp/google-services.json"
      "ios-master"      = "iosMasterApp/GoogleService-Info.plist"
      "ios-child"       = "iosChildApp/GoogleService-Info.plist"
      "service-account" = "secrets/play-developer-sa.json"
    }
    $rel = $targets[$ConfigKind]
    $dest = Join-Path $repoRoot $rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item $SourcePath $dest -Force
    Write-Host "✔ $ConfigKind → $rel" -ForegroundColor Green
    if ($ConfigKind -eq "service-account") {
      Write-Host "Hinweis: $rel ist gitignored. Für Functions-Runtime separat als Secret hochladen." -ForegroundColor Yellow
    }
  }

  default { throw "Unbekannte Action: $Action" }
}
