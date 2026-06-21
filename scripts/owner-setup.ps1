param(
    [ValidateSet(
        "setup",
        "preflight",
        "doctor",
        "start-admin",
        "open-parent-pc",
        "open-child-pc",
        "open-web-control",
        "open-all-pc",
        "desktop-parent",
        "desktop-operator"
    )]
    [string]$Mode = "setup",
    [int]$Port = 8765
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location -Path $RepoRoot

function Test-LocalAdminServer {
    param([int]$TargetPort)
    try {
        Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$TargetPort/api/runtime-info" -TimeoutSec 2 | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Start-LocalAdminServer {
    param([int]$TargetPort)
    if (Test-LocalAdminServer -TargetPort $TargetPort) {
        return
    }

    Write-Host "Starting MiniMaster Python admin server on http://127.0.0.1:$TargetPort ..." -ForegroundColor Cyan
    $env:MINIMASTER_ADMIN_PORT = [string]$TargetPort
    Start-Process -FilePath "python" -ArgumentList @("-m", "python_admin.app") -WorkingDirectory $RepoRoot -WindowStyle Minimized

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if (Test-LocalAdminServer -TargetPort $TargetPort) {
            return
        }
    }

    Write-Warning "Admin server did not answer within 20 seconds. Opening the target anyway."
}

function Open-LocalPage {
    param(
        [int]$TargetPort,
        [string]$Path
    )
    Start-LocalAdminServer -TargetPort $TargetPort
    Start-Process "http://127.0.0.1:$TargetPort$Path"
}

switch ($Mode) {
    "setup" {
        node scripts/run_python.js scripts/setup_init.py
        exit $LASTEXITCODE
    }
    "preflight" {
        node scripts/run_python.js scripts/preflight.py
        exit $LASTEXITCODE
    }
    "doctor" {
        node scripts/run_python.js scripts/release_doctor.py
        exit $LASTEXITCODE
    }
    "start-admin" {
        Open-LocalPage -TargetPort $Port -Path "/admin-panel/"
    }
    "open-parent-pc" {
        Open-LocalPage -TargetPort $Port -Path "/parent-panel/"
    }
    "open-child-pc" {
        Open-LocalPage -TargetPort $Port -Path "/child-panel/"
    }
    "open-web-control" {
        Open-LocalPage -TargetPort $Port -Path "/web-control/"
    }
    "open-all-pc" {
        Start-LocalAdminServer -TargetPort $Port
        Start-Process "http://127.0.0.1:$Port/admin-panel/"
        Start-Process "http://127.0.0.1:$Port/parent-panel/"
        Start-Process "http://127.0.0.1:$Port/child-panel/"
    }
    "desktop-parent" {
        npm run desktop-start
        exit $LASTEXITCODE
    }
    "desktop-operator" {
        npm run desktop-operator
        exit $LASTEXITCODE
    }
}
