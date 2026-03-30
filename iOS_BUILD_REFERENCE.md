# iOS Build & Deployment Schnellreferenz

Häufig verwendete Befehle für MiniMaster iOS-Apps.

## Windows + VS Code (wichtiger Hinweis)

Wenn du mit VS Code auf Windows arbeitest, gilt:

- VS Code ist vollkommen OK als Editor.
- Für Swift-Linking werden trotzdem Microsoft C++ Build Tools benötigt (MSVC).
- iOS-UI-Code mit `SwiftUI` kann auf Windows nicht lokal gebaut werden.
- Echte iOS-Builds laufen über macOS (lokal auf Mac oder via GitHub Actions auf `macos-14`).

### Lokale Toolchain-Prüfung unter Windows

```powershell
# 1) Prüfen, ob MSVC-Lib vorhanden ist
Get-ChildItem "C:\Program Files*\Microsoft Visual Studio\2022\*\VC\Tools\MSVC\*\lib\x64\msvcrt.lib" -ErrorAction SilentlyContinue

# 2) Minimalen Swift-Compile prüfen
$tmp = Join-Path $env:TEMP 'swift_hello.swift'
@'
print("ok")
'@ | Set-Content -Path $tmp -Encoding ascii

& 'C:\Users\torst\AppData\Local\Programs\Swift\Toolchains\6.3.0+Asserts\usr\bin\swiftc.exe' $tmp -o (Join-Path $env:TEMP 'swift_hello.exe')
& (Join-Path $env:TEMP 'swift_hello.exe')
```

Erwartung:

- `msvcrt.lib` wird gefunden
- Konsolen-Programm gibt `ok` aus

Wenn diese Checks grün sind, ist die Windows-Toolchain korrekt. Für iOS/SwiftUI weiterhin macOS nutzen.

## Lokal Bauen & Testen

### Parent App starten

```bash
cd iosMasterApp
open .                    # Xcode öffnen

# oder vom Terminal:
xcodebuild -scheme MiniMasterParent \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15'
```

### Child App starten (echtes Device REQUIRED!)

```bash
cd iosChildApp
open .                    # Xcode öffnen

xcodebuild -scheme MiniMasterChild \
  -configuration Debug \
  -destination 'platform=iOS,name=*' \  # Alle echten Devices
  -allowProvisioningUpdates
```

## Simulator-Befehle

### Alle Simulatoren auflisten

```bash
xcrun simctl list devices
```

### Spezifischen Simulator starten

```bash
xcrun simctl boot "iPhone 15 Pro"
```

### App aus Simulator löschen

```bash
xcrun simctl uninstall booted com.minimaster.parentapp
```

### Simulator Logs live

```bash
xcrun simctl spawn booted log stream --predicate 'eventMessage contains "MiniMaster"'
```

## Code Signing & Provisioning

### Certificates & Profiles auflisten

```bash
security find-identity -v -p codesigning
```

### Provisioning Profiles anzeigen

```bash
ls ~/Library/MobileDevice/Provisioning\ Profiles/
```

### Team ID finden

```bash
grep -r "TeamIdentifier" ~/Library/MobileDevice/Provisioning\ Profiles/
```

## Build für Distribution (TestFlight/App Store)

### Archive erstellen (Parent)

```bash
cd iosMasterApp
xcodebuild archive \
  -scheme MiniMasterParent \
  -configuration Release \
  -derivedDataPath build \
  -archivePath build/MiniMasterParent.xcarchive \
  -allowProvisioningUpdates
```

### Archive erstellen (Child)

```bash
cd iosChildApp
xcodebuild archive \
  -scheme MiniMasterChild \
  -configuration Release \
  -derivedDataPath build \
  -archivePath build/MiniMasterChild.xcarchive \
  -allowProvisioningUpdates
```

### Zu App Store exportieren (Xcode GUI)

1. **Xcode** → **Window** → **Organizer**
2. **Archives** → neuestes Archive wählen
3. **Distribute App**
4. **App Store Connect** auswählen
5. Signatur & Provisioning wählen
6. **Export** → `.ipa` speichern

## Fastlane Setup (optional)

```bash
# Fastlane installieren
sudo gem install fastlane

# In iosMasterApp/:
fastlane init ios
# → Guided setup für Xcode + App Store Connect

# Dann can you use:
fastlane build       # Build + Archive
fastlane test        # Unit Tests laufen
fastlane release     # Zu TestFlight pushen
```

**Minimale Fastfile:**
```ruby
# iosMasterApp/fastlane/Fastfile
default_platform(:ios)

platform :ios do
  desc "Build and release to TestFlight"
  lane :release do
    build_app(
      scheme: "MiniMasterParent",
      configuration: "Release",
      destination: "generic/platform=iOS",
      archive_path: "build/MiniMasterParent.xcarchive"
    )
    upload_to_testflight(
      app_identifier: "com.minimaster.parentapp"
    )
  end
end
```

## Device Management

### Device-Logs abrufen

```bash
# Device mit USB verbunden
xcrun xcode-select --install  # Ensure tools installed

# Logs live streamen:
log stream --predicate 'process == "MiniMasterParent"'

# Alternative: Xcode Window → Devices & Simulators → Logs
```

### Installation auf realem Device manuell

```bash
# .ipa Datei auf Device installieren
ios-deploy -b build/MiniMasterParent.ipa

# oder via iTunes/Finder (Drag & Drop)
```

## Fehlerhafte Builds beheben

### Clean Build Folder

```bash
xcodebuild clean -scheme MiniMasterParent
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

### SPM Cache löschen

In Xcode:
```
File → Packages → Reset Package Caches
```

Oder:
```bash
rm -rf ~/.swiftpm
```

### Provisioning Profile neu downloaden

```bash
# Xcode Accounts
open "~/Library/Preferences/com.apple.dt.Xcode.plist"

# oder manuell von dev.apple.com
```

## Monitoring & Debugging

### Firebase Console - Cloud Messaging testen

```bash
# 1. Gerät registriert?
db.collection('children').where('masterImei', '==', 'YOUR_IMEI').get()

# 2. FCM Token vorhanden?
console.log(children/{id}/device)

# 3. Test-Nachricht senden:
firebase functions:shell
> messaging.send({token: 'FCM_TOKEN', data: {policyVersion: '1'}})
```

### Lokale Firestore Emulation (optional)

```bash
# Terminal 1: Emulator starten
firebase emulators:start --only firestore,functions

# Terminal 2: Tests gegen Emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 xcodebuild test ...
```

## CI/CD GitHub Actions

```bash
# .github/workflows/ios-ci.yml
name: iOS CI

on:
  push:
    paths:
      - 'iosMasterApp/**'
      - 'iosChildApp/**'
      - '.github/workflows/ios-ci.yml'
  pull_request:
    paths:
      - 'iosMasterApp/**'
      - 'iosChildApp/**'
      - '.github/workflows/ios-ci.yml'

jobs:
  ios-structure-validate:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - name: Validate package manifests
        run: |
          swift package --package-path iosMasterApp describe
          swift package --package-path iosChildApp describe
```

Aktueller Stand dieses Repos:

- GitHub Actions validiert derzeit bewusst nur Manifest- und Struktur-Konsistenz.
- Ein vollständiger iOS-Build in CI ist erst sinnvoll, wenn Xcode-Projekt/Workspace-Dateien oder eine vollständige SPM-Abbildung der Firebase-Abhängigkeiten im Repo vorliegen.
- Für echte UI-Builds und Device-/Simulator-Tests bleibt macOS mit Xcode erforderlich.

## Alternative: Development via Remote Mac

Falls du auf Windows bist und einen Mac brauchst:

### SSH zum Build-Mac

```powershell
# Von Windows:
ssh user@mac-ip
cd /path/to/MiniMaster
xcodebuild build -scheme MiniMasterParent
```

### VNC / Screen Sharing

```powershell
# Xcode remote via VNC
open vnc://user@mac-ip
```

## Quick Links

- [Xcode Documentation](https://developer.apple.com/xcode/)
- [Apple Developer Portal](https://developer.apple.com)
- [Fastlane Docs](https://docs.fastlane.tools/getting-started/ios/setup/)
- [Firebase iOS SDK](https://github.com/firebase/firebase-ios-sdk)
- [FamilyControls Documentation](https://developer.apple.com/documentation/familycontrols)

---

**Tipps:**
- Kommt dir ein Build unterbrochen vor? → `xcodebuild clean` + Xcode neu starten
- Provisioning kann "stuck" sein → Xcode → Settings → Manage Certificates aktualisieren
- Device offline? → Lightning-Kabel raus/rein
