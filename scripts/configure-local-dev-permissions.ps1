<#
.SYNOPSIS
  Configures common local Windows development permissions to reduce repeated prompts for trusted MiniMaster development work.

.DESCRIPTION
  This script is intended for a trusted local development machine. It helps reduce repeated confirmations from
  PowerShell, Windows Defender Controlled Folder Access, Windows Defender exclusions, GitHub CLI and VS Code workspace trust.

  Default mode is diagnostic/dry-run. Use -Apply to make changes.

  Recommended usage from an elevated PowerShell session:

    pwsh -ExecutionPolicy Bypass -File .\scripts\configure-local-dev-permissions.ps1 -Apply -WorkspaceRoot D:\Tools\MiniMaster

  Safer non-admin/current-user-only usage:

    pwsh -ExecutionPolicy Bypass -File .\scripts\configure-local-dev-permissions.ps1 -Apply -CurrentUserOnly -WorkspaceRoot D:\Tools\MiniMaster

.PARAMETER Apply
  Actually applies changes. Without this switch, the script only prints the planned actions.

.PARAMETER WorkspaceRoot
  Trusted repository or tool root. Defaults to the current repository root if the script is run from inside the repo.

.PARAMETER CurrentUserOnly
  Avoids machine-wide changes where possible. PowerShell execution policy is set for CurrentUser only.

.PARAMETER DisableControlledFolderAccess
  Disables Windows Defender Controlled Folder Access. This requires elevation and should only be used on trusted machines.

.PARAMETER AddDefenderExclusions
  Adds Defender exclusions for the workspace and common developer tools.

.PARAMETER ConfigureGitHubCli
  Checks GitHub CLI authentication and runs gh auth setup-git when available.

.PARAMETER ConfigureVSCodeSettings
  Writes a workspace .vscode/settings.json with trust-friendly development settings.

.PARAMETER IncludeCopilotAutoApproveHints
  Adds commented Copilot/agent auto-approval hints to .vscode/settings.json. Exact setting names may vary by VS Code/Copilot version.

.NOTES
  This script cannot disable security prompts from browser-based connectors or ChatGPT's own safety confirmations.
  Those prompts are controlled by the platform and cannot be reliably bypassed from PowerShell.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$Apply,
    [string]$WorkspaceRoot,
    [switch]$CurrentUserOnly,
    [switch]$DisableControlledFolderAccess,
    [switch]$AddDefenderExclusions = $true,
    [switch]$ConfigureGitHubCli = $true,
    [switch]$ConfigureVSCodeSettings = $true,
    [switch]$IncludeCopilotAutoApproveHints
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Plan {
    param([string]$Message)
    if ($Apply) {
        Write-Host "APPLY: $Message" -ForegroundColor Green
    } else {
        Write-Host "PLAN : $Message" -ForegroundColor Yellow
    }
}

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Resolve-WorkspaceRoot {
    param([string]$RequestedRoot)

    if (-not [string]::IsNullOrWhiteSpace($RequestedRoot)) {
        return (Resolve-Path -LiteralPath $RequestedRoot).Path
    }

    $scriptDir = Split-Path -Parent $PSCommandPath
    $candidate = Resolve-Path -LiteralPath (Join-Path $scriptDir '..')
    return $candidate.Path
}

function Invoke-WhenApplying {
    param(
        [string]$Description,
        [scriptblock]$Action,
        [switch]$RequiresElevation
    )

    Write-Plan $Description

    if (-not $Apply) {
        return
    }

    if ($RequiresElevation -and -not (Test-IsElevated)) {
        Write-Warning "Skipped because this action requires an elevated PowerShell session: $Description"
        return
    }

    if ($PSCmdlet.ShouldProcess($Description, 'Apply')) {
        & $Action
    }
}

function Set-PowerShellPolicy {
    Write-Step 'PowerShell execution policy'

    $scope = if ($CurrentUserOnly) { 'CurrentUser' } else { 'CurrentUser' }
    Invoke-WhenApplying "Set PowerShell execution policy to RemoteSigned for scope $scope" {
        Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope $scope -Force
    }

    Write-Host "Current policies:" -ForegroundColor Gray
    Get-ExecutionPolicy -List | Format-Table -AutoSize
}

function Set-DefenderConfiguration {
    param([string]$Root)

    Write-Step 'Windows Defender developer exclusions'

    if (-not (Get-Command Add-MpPreference -ErrorAction SilentlyContinue)) {
        Write-Warning 'Windows Defender PowerShell cmdlets are not available on this system.'
        return
    }

    if ($AddDefenderExclusions) {
        $paths = @(
            $Root,
            'D:\Tools',
            "$env:USERPROFILE\.gradle",
            "$env:USERPROFILE\.npm",
            "$env:USERPROFILE\.cache",
            "$env:LOCALAPPDATA\Android",
            "$env:APPDATA\npm"
        ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique

        foreach ($path in $paths) {
            Invoke-WhenApplying "Add Defender folder exclusion: $path" {
                Add-MpPreference -ExclusionPath $path
            } -RequiresElevation
        }

        $processCandidates = @(
            'Code.exe',
            'git.exe',
            'gh.exe',
            'node.exe',
            'npm.cmd',
            'npx.cmd',
            'python.exe',
            'python3.exe',
            'pwsh.exe',
            'powershell.exe',
            'java.exe',
            'adb.exe',
            'emulator.exe',
            'gradle.exe'
        )

        foreach ($process in $processCandidates) {
            Invoke-WhenApplying "Add Defender process exclusion: $process" {
                Add-MpPreference -ExclusionProcess $process
            } -RequiresElevation
        }
    }

    if ($DisableControlledFolderAccess) {
        Invoke-WhenApplying 'Disable Windows Defender Controlled Folder Access' {
            Set-MpPreference -EnableControlledFolderAccess Disabled
        } -RequiresElevation
    } else {
        Write-Host 'Controlled Folder Access will not be disabled. Use -DisableControlledFolderAccess to disable it explicitly.' -ForegroundColor Gray
    }
}

function Set-GitHubCliConfiguration {
    Write-Step 'GitHub CLI authentication'

    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        Write-Warning 'GitHub CLI was not found. Install it first: winget install GitHub.cli'
        return
    }

    Write-Host 'Current gh auth status:' -ForegroundColor Gray
    try {
        gh auth status
    } catch {
        Write-Warning 'gh auth status failed. Run: gh auth login'
    }

    Invoke-WhenApplying 'Configure Git to use GitHub CLI credentials' {
        gh auth setup-git
    }
}

function Set-VSCodeWorkspaceSettings {
    param([string]$Root)

    Write-Step 'VS Code workspace settings'

    $vscodeDir = Join-Path $Root '.vscode'
    $settingsPath = Join-Path $vscodeDir 'settings.json'

    $settings = [ordered]@{
        'security.workspace.trust.enabled' = $true
        'terminal.integrated.enablePersistentSessions' = $true
        'terminal.integrated.confirmOnExit' = 'never'
        'files.restoreUndoStack' = $true
        'git.autofetch' = $true
        'git.confirmSync' = $false
        'git.enableSmartCommit' = $true
        'npm.fetchOnlinePackageInfo' = $true
    }

    if ($IncludeCopilotAutoApproveHints) {
        $settings['github.copilot.chat.codeGeneration.useInstructionFiles'] = $true
        $settings['github.copilot.chat.agent.autoFix'] = $true
    }

    $json = $settings | ConvertTo-Json -Depth 5

    Invoke-WhenApplying "Write VS Code workspace settings: $settingsPath" {
        if (-not (Test-Path -LiteralPath $vscodeDir)) {
            New-Item -ItemType Directory -Path $vscodeDir | Out-Null
        }
        $json | Set-Content -LiteralPath $settingsPath -Encoding UTF8
    }

    if (-not $Apply) {
        Write-Host $json -ForegroundColor Gray
    }
}

function Show-ManualSteps {
    Write-Step 'Manual settings that PowerShell cannot safely force'

    Write-Host @'
1. VS Code Workspace Trust
   Open the MiniMaster folder in VS Code and choose:
   Manage Workspace Trust -> Trust this workspace

2. ChatGPT / browser connector confirmations
   These are platform security prompts and cannot be disabled by this script.

3. GitHub repository / branch protection
   Check GitHub repository settings manually if PR merges are blocked by required checks.

4. Windows UAC
   Lowering UAC reduces prompts but weakens system security. This script does not change UAC.

5. OneDrive / synced folders
   Keep repositories under D:\Tools\ or another local non-synced path to avoid sync locks and permission prompts.
'@ -ForegroundColor Gray
}

$workspace = Resolve-WorkspaceRoot -RequestedRoot $WorkspaceRoot
$isElevated = Test-IsElevated

Write-Host 'MiniMaster Local Development Permission Helper' -ForegroundColor Magenta
Write-Host "WorkspaceRoot: $workspace"
Write-Host "Apply mode   : $Apply"
Write-Host "Elevated     : $isElevated"
Write-Host "Current user : $env:USERNAME"

Set-PowerShellPolicy
Set-DefenderConfiguration -Root $workspace
if ($ConfigureGitHubCli) { Set-GitHubCliConfiguration }
if ($ConfigureVSCodeSettings) { Set-VSCodeWorkspaceSettings -Root $workspace }
Show-ManualSteps

Write-Step 'Done'
if (-not $Apply) {
    Write-Host 'No changes were applied. Re-run with -Apply to make changes.' -ForegroundColor Yellow
}
