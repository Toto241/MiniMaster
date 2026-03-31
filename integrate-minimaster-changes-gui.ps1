param(
    [string]$RepoPath = "",
    [string]$ImportPath = "",
    [string]$BranchName = "",
    [string]$CommitMessage = "feat: integrate prepared MiniMaster changes",
    [switch]$CreatePullRequest,
    [string]$BaseBranch = "main",
    [switch]$NoBackup
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info($Text) {
    Write-Host "[INFO] $Text" -ForegroundColor Cyan
}

function Write-Ok($Text) {
    Write-Host "[OK]   $Text" -ForegroundColor Green
}

function Write-WarnMsg($Text) {
    Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Write-Fail($Text) {
    Write-Host "[FAIL] $Text" -ForegroundColor Red
}

function Assert-CommandExists {
    param([string]$Name)

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Benötigtes Programm nicht gefunden: $Name"
    }
}

function Get-Timestamp {
    return (Get-Date).ToString("yyyyMMdd-HHmmss")
}

function Select-FolderDialog {
    param([string]$Description = "Ordner auswählen")

    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description
    $dialog.ShowNewFolderButton = $false

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dialog.SelectedPath
    }

    return $null
}

function Select-FileDialog {
    param(
        [string]$Title = "Datei auswählen",
        [string]$Filter = "ZIP-Dateien (*.zip)|*.zip|Alle Dateien (*.*)|*.*"
    )

    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = $Title
    $dialog.Filter = $Filter
    $dialog.Multiselect = $false

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dialog.FileName
    }

    return $null
}

function Ask-ImportSource {
    $choice = [System.Windows.Forms.MessageBox]::Show(
        "Importquelle auswählen:`nJa = Ordner auswählen`nNein = ZIP auswählen`nAbbrechen = Abbruch",
        "MiniMaster Import",
        [System.Windows.Forms.MessageBoxButtons]::YesNoCancel,
        [System.Windows.Forms.MessageBoxIcon]::Question
    )

    switch ($choice) {
        ([System.Windows.Forms.DialogResult]::Yes) { return Select-FolderDialog -Description "Import-Ordner auswählen" }
        ([System.Windows.Forms.DialogResult]::No)  { return Select-FileDialog -Title "Import-ZIP auswählen" }
        default { return $null }
    }
}

function Expand-ImportIfNeeded {
    param([string]$PathToImport)

    $item = Get-Item $PathToImport
    if ($item.PSIsContainer) {
        return $item.FullName
    }

    if ($item.Extension -ieq ".zip") {
        $tempDir = Join-Path $env:TEMP ("MiniMasterImport_" + (Get-Timestamp))
        New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
        Expand-Archive -Path $item.FullName -DestinationPath $tempDir -Force

        $subdirs = Get-ChildItem -Path $tempDir -Directory
        if ($subdirs.Count -eq 1) {
            return $subdirs[0].FullName
        }

        return $tempDir
    }

    throw "Import-Pfad muss ein Ordner oder eine ZIP-Datei sein."
}

function Assert-GitRepo {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        throw "Repo-Pfad existiert nicht: $Path"
    }

    if (-not (Test-Path (Join-Path $Path ".git"))) {
        throw "Im Zielpfad wurde kein Git-Repository gefunden: $Path"
    }
}

function Invoke-Git {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $argLine = ($Arguments | ForEach-Object {
        if ($_ -match '\s') {
            '"' + $_.Replace('"', '\"') + '"'
        } else {
            $_
        }
    }) -join ' '

    Write-Info ("git " + $argLine)

    Push-Location $WorkingDirectory
    try {
        $output = & cmd.exe /c "git $argLine 2>&1"
        $exitCode = $LASTEXITCODE

        if ($output) {
            $output | ForEach-Object { Write-Host $_ }
        }

        if ($exitCode -ne 0) {
            throw "Git-Befehl fehlgeschlagen: git $argLine"
        }

        return $output
    }
    finally {
        Pop-Location
    }
}

function Invoke-Gh {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $argLine = ($Arguments | ForEach-Object {
        if ($_ -match '\s') {
            '"' + $_.Replace('"', '\"') + '"'
        } else {
            $_
        }
    }) -join ' '

    Write-Info ("gh " + $argLine)

    Push-Location $WorkingDirectory
    try {
        $output = & cmd.exe /c "gh $argLine 2>&1"
        $exitCode = $LASTEXITCODE

        if ($output) {
            $output | ForEach-Object { Write-Host $_ }
        }

        if ($exitCode -ne 0) {
            throw "gh-Befehl fehlgeschlagen: gh $argLine"
        }

        return $output
    }
    finally {
        Pop-Location
    }
}

function Copy-PreparedFiles {
    param(
        [string]$SourceRoot,
        [string]$TargetRoot,
        [string]$BackupRoot,
        [bool]$CreateBackup
    )

    $copiedFiles = New-Object System.Collections.Generic.List[string]
    $allFiles = Get-ChildItem -Path $SourceRoot -Recurse -File

    foreach ($file in $allFiles) {
        $relativePath = $file.FullName.Substring($SourceRoot.Length).TrimStart('\','/')
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            continue
        }

        $targetPath = Join-Path $TargetRoot $relativePath
        $targetDir = Split-Path $targetPath -Parent

        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }

        if ($CreateBackup -and (Test-Path $targetPath)) {
            $backupPath = Join-Path $BackupRoot $relativePath
            $backupDir = Split-Path $backupPath -Parent
            if (-not (Test-Path $backupDir)) {
                New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            }
            Copy-Item -Path $targetPath -Destination $backupPath -Force
        }

        Copy-Item -Path $file.FullName -Destination $targetPath -Force
        $copiedFiles.Add($relativePath)
    }

    return $copiedFiles
}

try {
    Assert-CommandExists -Name "git"
    Assert-CommandExists -Name "gh"

    if (-not $RepoPath) {
        $RepoPath = Select-FolderDialog -Description "MiniMaster Repository-Ordner auswählen"
        if (-not $RepoPath) {
            throw "Kein Repository-Ordner ausgewählt."
        }
    }

    Assert-GitRepo -Path $RepoPath
    Write-Ok "Repository erkannt: $RepoPath"

    if (-not $ImportPath) {
        $ImportPath = Ask-ImportSource
        if (-not $ImportPath) {
            throw "Keine Importquelle ausgewählt."
        }
    }

    if (-not (Test-Path $ImportPath)) {
        throw "Importquelle existiert nicht: $ImportPath"
    }

    $importRoot = Expand-ImportIfNeeded -PathToImport $ImportPath
    Write-Ok "Import-Quelle: $importRoot"

    $resolvedRepo = (Resolve-Path $RepoPath).Path
    $resolvedImport = (Resolve-Path $importRoot).Path

    if ($resolvedRepo -eq $resolvedImport) {
        throw "Import-Quelle und Repository sind identisch. Bitte wähle den Ordner mit dem Änderungspaket, nicht das Repo selbst."
    }

    $gitStatus = & git -C $RepoPath status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "Git-Status konnte nicht gelesen werden."
    }

    if (-not [string]::IsNullOrWhiteSpace(($gitStatus | Out-String))) {
        Write-WarnMsg "Im Repository gibt es bereits uncommittete Änderungen."
    }

    $currentBranch = (& git -C $RepoPath rev-parse --abbrev-ref HEAD).Trim()

    if (-not $BranchName) {
        $BranchName = "chatgpt/import-" + (Get-Timestamp)
    }

    Write-Info "Aktueller Branch: $currentBranch"
    Write-Info "Ziel-Branch: $BranchName"

    if ($currentBranch -ne $BranchName) {
        $existingBranch = & git -C $RepoPath branch --list $BranchName
        if ([string]::IsNullOrWhiteSpace(($existingBranch | Out-String))) {
            Invoke-Git -WorkingDirectory $RepoPath -Arguments @("checkout", "-b", $BranchName)
        } else {
            Invoke-Git -WorkingDirectory $RepoPath -Arguments @("checkout", $BranchName)
        }
    }

    $backupRoot = Join-Path $RepoPath (".backup_import_" + (Get-Timestamp))
    $doBackup = -not $NoBackup

    if ($doBackup) {
        New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
        Write-Ok "Backup-Ordner: $backupRoot"
    } else {
        Write-WarnMsg "Backup deaktiviert."
    }

    $copiedFiles = Copy-PreparedFiles -SourceRoot $importRoot -TargetRoot $RepoPath -BackupRoot $backupRoot -CreateBackup:$doBackup

    if ($copiedFiles.Count -eq 0) {
        throw "Es wurden keine Dateien kopiert."
    }

    Write-Ok "Kopierte Dateien:"
    foreach ($file in $copiedFiles) {
        Write-Host "       $file"
    }

    Invoke-Git -WorkingDirectory $RepoPath -Arguments @("add", ".")

    $postAddStatus = & git -C $RepoPath diff --cached --name-only
    if ($LASTEXITCODE -ne 0) {
        throw "Git staged diff konnte nicht gelesen werden."
    }

    if ([string]::IsNullOrWhiteSpace(($postAddStatus | Out-String))) {
        Write-WarnMsg "Keine Änderungen zum Committen gefunden."
        exit 0
    }

    Invoke-Git -WorkingDirectory $RepoPath -Arguments @("commit", "-m", $CommitMessage)
    Invoke-Git -WorkingDirectory $RepoPath -Arguments @("push", "-u", "origin", $BranchName)

    Write-Ok "Änderungen gepusht."

    if ($CreatePullRequest) {
        $prBody = @"
Automatisch importierte MiniMaster-Änderungen.

Enthalten:
- iOS Parent Pairing View / Pairing Service
- iOS Child App Blocking Manager
- Cross-Platform Sync Service
- Photo Proof Upload Service

Bitte Diff prüfen und Build/Test ausführen.
"@

        Invoke-Gh -WorkingDirectory $RepoPath -Arguments @(
            "pr", "create",
            "--repo", "Toto241/MiniMaster",
            "--base", $BaseBranch,
            "--head", $BranchName,
            "--title", $CommitMessage,
            "--body", $prBody
        )

        Write-Ok "Pull Request erstellt."
    } else {
        Write-Info "PR-Erstellung übersprungen."
    }

    [System.Windows.Forms.MessageBox]::Show(
        "Integration abgeschlossen.",
        "MiniMaster Import",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Information
    ) | Out-Null

    Write-Ok "Integration abgeschlossen."
}
catch {
    Write-Fail $_.Exception.Message

    [System.Windows.Forms.MessageBox]::Show(
        $_.Exception.Message,
        "MiniMaster Import – Fehler",
        [System.Windows.Forms.MessageBoxButtons]::OK,
        [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null

    exit 1
}