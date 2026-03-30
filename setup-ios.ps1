#!/usr/bin/env pwsh
# MiniMaster iOS Setup Helper (für macOS-Remote-Zugriff oder WSL)

param(
    [Switch]$CheckOnly = $false,
    [Switch]$OpenParent = $false,
    [Switch]$OpenChild = $false
)

function Write-Status {
    param([string]$Message, [string]$Status = "info")
    $color = @{
        "ok" = "Green"
        "warn" = "Yellow"
        "error" = "Red"
        "info" = "Cyan"
    }
    Write-Host $Message -ForegroundColor $color[$Status]
}

Write-Host ""
Write-Status "🍎 MiniMaster iOS Buildsetup" "info"
Write-Status "=============================" "info"
Write-Host ""

# Überprüfe Dateien
Write-Status "📋 Überprüfung Standard-Dateien:" "info"

$files = @(
    @{ path = "iosMasterApp/Package.swift"; name = "Parent App Manifest" },
    @{ path = "iosMasterApp/MiniMasterParent.entitlements"; name = "Parent Entitlements" },
    @{ path = "iosMasterApp/GoogleService-Info.template.plist"; name = "Parent Firebase Template" },
    @{ path = "iosChildApp/Package.swift"; name = "Child App Manifest" },
    @{ path = "iosChildApp/MiniMasterChild.entitlements"; name = "Child Entitlements (FamilyControls!)" },
    @{ path = "iosChildApp/GoogleService-Info.template.plist"; name = "Child Firebase Template" },
    @{ path = "ios.xcconfig"; name = "Build Configuration" }
)

foreach ($file in $files) {
    if (Test-Path $file.path) {
        Write-Status "✓ $($file.name)" "ok"
    }
    else {
        Write-Status "✗ $($file.name) - FEHLT" "error"
    }
}

Write-Host ""
Write-Status "📱 Setup-Schritte:" "info"
Write-Host ""
Write-Host "1. Xcode-Projekte öffnen:"
Write-Host "   • iosMasterApp/ (Parent App)"
Write-Host "   • iosChildApp/ (Child App)"
Write-Host ""
Write-Host "2. Firebase GoogleService-Info.plist:"
Write-Host "   • Konsole: https://console.firebase.google.com/"
Write-Host "   • Projekt: minimaster-28fbd"
Write-Host "   • iOS-Apps: com.minimaster.parentapp / com.minimaster.childapp"
Write-Host "   • ⬇️  GoogleService-Info.plist herunterladen"
Write-Host ""
Write-Host "3. Xcode-Konfiguration:"
Write-Host "   • Team ID in Signing setzen"
Write-Host "   • Entitlements überprüfen"
Write-Host "   • Build & Run mit Simulator/Device"
Write-Host ""
Write-Host "4. Detaillierte Anleitung:"
Write-Host "   iOS_SETUP.md lesen"
Write-Host ""
Write-Status "✅ Bereit für iOS-Entwicklung!" "ok"
Write-Host ""
