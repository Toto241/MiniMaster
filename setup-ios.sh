#!/bin/bash
# Quick iOS Development Setup Script
# Unterstützung für lokale MiniMaster iOS-App-Einrichtung

set -e

echo "🍎 MiniMaster iOS Setup"
echo "======================="
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Xcode
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}❌ Xcode nicht gefunden. Bitte instalieren:${NC}"
    echo "   xcode-select --install"
    exit 1
fi

XCODE_VERSION=$(xcodebuild -version | grep Xcode | awk '{print $2}')
echo -e "${GREEN}✓ Xcode ${XCODE_VERSION} gefunden${NC}"

# Check macOS version
OS_VERSION=$(sw_vers -productVersion | cut -d. -f1)
if [ "$OS_VERSION" -lt 13 ]; then
    echo -e "${RED}❌ macOS 13+ erforderlich (aktuell: ${OS_VERSION})${NC}"
    exit 1
fi
echo -e "${GREEN}✓ macOS $OS_VERSION ok${NC}"

# Firebase CLI (optional)
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}⚠ Firebase CLI nicht gefunden (optional)${NC}"
    echo "   npm install -g firebase-tools"
else
    FIREBASE_VERSION=$(firebase --version 2>/dev/null | cut -d' ' -f1)
    echo -e "${GREEN}✓ Firebase CLI ${FIREBASE_VERSION} gefunden${NC}"
fi

echo ""
echo "📱 iOS Apps Setup:"
echo "==================="

# Parent App
echo ""
echo "1️⃣  Parent App (MiniMasterParent):"

if [ ! -f "iosMasterApp/GoogleService-Info.plist" ]; then
    echo -e "${YELLOW}⚠ GoogleService-Info.plist nicht gefunden${NC}"
    echo "   📥 Bitte manuell herunterladen:"
    echo "      1. Firebase Console: https://console.firebase.google.com/"
    echo "      2. Projekt: minimaster-28fbd"
    echo "      3. iOS-App: com.minimaster.parentapp"
    echo "      4. GoogleService-Info.plist → iosMasterApp/"
else
    echo -e "${GREEN}✓ GoogleService-Info.plist vorhanden${NC}"
fi

if [ ! -f "ios.xcconfig" ]; then
    echo -e "${YELLOW}⚠ ios.xcconfig nicht gefunden${NC}"
else
    echo -e "${GREEN}✓ iOS build configuration vorhanden${NC}"
fi

# Child App
echo ""
echo "2️⃣  Child App (MiniMasterChild):"

if [ ! -f "iosChildApp/GoogleService-Info.plist" ]; then
    echo -e "${YELLOW}⚠ GoogleService-Info.plist nicht gefunden${NC}"
    echo "   📥 Bitte manuell herunterladen:"
    echo "      1. Firebase Console: https://console.firebase.google.com/"
    echo "      2. Projekt: minimaster-28fbd"
    echo "      3. iOS-App: com.minimaster.childapp"
    echo "      4. GoogleService-Info.plist → iosChildApp/"
    echo "      ⚠️  WICHTIG: com.apple.developer.family-controls in Capabilities einschalten!"
else
    echo -e "${GREEN}✓ GoogleService-Info.plist vorhanden${NC}"
fi

if [ ! -f "iosChildApp/MiniMasterChild.entitlements" ]; then
    echo -e "${YELLOW}⚠ Entitlements nicht vorhanden${NC}"
else
    echo -e "${GREEN}✓ FamilyControls Entitlements konfiguriert${NC}"
fi

echo ""
echo "🔧 Next Steps:"
echo "==============="
echo ""
echo "1. Öffne Parent App:"
echo "   open iosMasterApp"
echo ""
echo "2. Öffne Child App:"
echo "   open iosChildApp"
echo ""
echo "3. In Xcode für beide Apps:"
echo "   • Team ID setzen (Signing)"
echo "   • Entitlements prüfen"
echo "   • Firebase GoogleService-Info.plist hinzufügen"
echo "   • Build & Run auf Simulator/Device"
echo ""
echo "4. Ausführliche Setup-Anleitung:"
echo "   cat iOS_SETUP.md"
echo ""
echo -e "${GREEN}✅ iOS Setup vorbereitet!${NC}"
echo ""
