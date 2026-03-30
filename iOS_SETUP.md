# iOS App Setup Guide (MiniMaster)

Diese Anleitung deckt die lokale Einrichtung beider iOS-Apps ab (Parent + Child).

## Anforderungen

- **Xcode 15+** (iOS 17+ SDK)
- **macOS 13+**
- **CocoaPods** (für Firebase): `sudo gem install cocoapods`
- **Apple Developer Account** (für FamilyControls)

## Verzeichnisstruktur

```
iosMasterApp/                          # Parent App (Swift Package Manager)
├── Package.swift                      # SPM manifest (iOS 17+)
├── GoogleService-Info.template.plist  # Firebase config template
├── MiniMasterParent.entitlements      # Code Signing + push notifications
├── Sources/
│   └── MiniMasterParent/
│       ├── App/
│       ├── Models/
│       ├── Services/
│       ├── ViewModels/
│       └── Views/
└── README.md

iosChildApp/                           # Child App (Screen Time control)
├── Package.swift                      # SPM manifest
├── GoogleService-Info.template.plist  # Firebase config template
├── MiniMasterChild.entitlements       # FamilyControls + ManagedSettings
├── Sources/
│   └── MiniMasterChild/
│       ├── App/
│       ├── Models/
│       ├── Services/
│       └── Views/
└── README.md
```

## Step 1: Firebase-Konfiguration

### 1.1 Google-Services-Info.plist erstellen

1. **Firebase Console öffnen**: https://console.firebase.google.com/
2. **Project "minimaster-28fbd" wählen**
3. **Für Parent App:**
   - Projekt-Einstellungen → iOS-Apps → `com.minimaster.parentapp`
   - GoogleService-Info.plist herunterladen
   - → `iosMasterApp/` kopieren
4. **Für Child App:**
   - Projekt-Einstellungen → iOS-Apps → `com.minimaster.childapp`
   - GoogleService-Info.plist herunterladen
   - → `iosChildApp/` kopieren

Falls die Apps noch nicht registriert sind:
1. iOS-App hinzufügen (+)
2. Bundle ID eingeben: `com.minimaster.parentapp` / `com.minimaster.childapp`
3. **WICHTIG für Child App:** Entitlements aktivieren:
   - Family Controls (`com.apple.developer.family-controls`)
   - Managed Settings
   - Device Activity

## Step 2: Code Signing & Team IDs

### 2.1 Xcode öffnen

```bash
open iosMasterApp
# oder
open iosChildApp
```

### 2.2 Team ID konfigurieren

1. **Project Navigator** → `MiniMasterParent` / `MiniMasterChild` wählen
2. **Build Settings** → **Team ID**
3. Dein Apple Developer Team auswählen
4. `ios.xcconfig` aktualisieren:
   ```bash
   DEVELOPMENT_TEAM = [Deine Team ID]
   APPSTORE_TEAM_ID = [Deine Team ID]
   ```

### 2.3 Signing Certificate

1. **Xcode** → **Settings** → **Accounts**
2. Dein Apple ID hinzufügen (falls nicht vorhanden)
3. Team auswählen → **Manage Certificates**
4. **iOS Development** Zertifikat hinzufügen (falls nicht vorhanden)

## Step 3: Entitlements

### Parent App

**Datei:** `iosMasterApp/MiniMasterParent.entitlements`

Entitlements für diese App:
- ✓ Push Notifications (production)
- ✓ iCloud Keychain (Credential-Sicherung)
- ✓ CloudKit (optional für zukünftige Sync)

### Child App (KRITISCH)

**Datei:** `iosChildApp/MiniMasterChild.entitlements`

**WICHTIGE Entitlements:**
- ✓ **Family Controls** (`com.apple.developer.family-controls`)
  - Nur verfügbar in Account mit Family Controls entitlement!
- ✓ **Device Activity** (zur Bildschirmzeit-Verwaltung)
- ✓ **Managed Settings** (App-Blocking-Durchsetzung)
- ✓ Push Notifications (APNs)

**Anforderung:** Das Apple-Entwicklerkonto benötigt ein **Family Controls Contract** von Apple. Dies ist normalerweise mit dem Developer Application verfügbar, muss aber explizit für die App freigegeben werden:

1. **Apple Developer Portal** → App ID `com.minimaster.childapp`
2. **Capabilities** → **Enable Family Controls**
3. **Save**
4. Neues Provisioning Profile herunterladen

## Step 4: Abhängigkeiten

### Firebase SDK (Swift Package Manager)

In Xcode:
1. **File** → **Add Packages...**
2. URL eingeben: `https://github.com/firebase/firebase-ios-sdk.git`
3. Branch auswählen: `main` (oder letzter Release-Tag)
4. Folgende Packages auswählen:
   - `FirebaseCore`
   - `FirebaseAuth`
   - `FirebaseFirestore`
   - `FirebaseStorage`
   - `FirebaseMessaging`

**Oder manuell in `Package.swift`:**
```swift
dependencies: [
    .package(
        url: "https://github.com/firebase/firebase-ios-sdk.git",
        from: "11.0.0"
    )
]
```

### Für Child App zusätzlich:

- **FamilyControls** (Apple Framework, bereits in iOS 17+ enthalten)
- **DeviceActivity** (Apple Framework)
- **ManagedSettings** (Apple Framework)

Diese sind in `iosChildApp/Package.swift` bereits als `.systemLibrary` eingebunden.

## Step 5: Build & Run

### Parent App

```bash
cd iosMasterApp
# Xcode öffnen
open .

# oder vom Terminal:
xcodebuild -scheme MiniMasterParent -configuration Debug -derivedDataPath build
```

**Simulator:**
- Select `My Mac (Designed for iPad)` oder `iPhone 15 Pro Simulator`
- **Product** → **Run** (Cmd+R)

**Real Device:**
- Device via USB anschließen
- Device in Xcode wählen
- **Run** starten
- App-Installation auf dem Gerät erlauben

### Child App

```bash
cd iosChildApp
open .
```

**WICHTIG für Device Testing:**
- ✓ Muss auf einem **echten iPhone/iPad** mit iOS 17+ laufen
  - **NICHT im Simulator!** (FamilyControls ist nur auf echten Geräten verfügbar)
- ✓ Device muss in **Family Sharing** oder **MDM** sein
- ✓ Oder vom Gerät selbst aus als **Child Account** erstellt sein

**Screen Time prüfen:**
1. Settings → Screen Time
2. "Dieser ist mein Kind's iPhone" auswählen
3. MiniMaster-App autorisieren

## Step 6: Local Development

### Environment Konfigurieren

1. `.env` Datei in `iosMasterApp/` erstellen:
```
FIREBASE_PROJECT_ID=minimaster-28fbd
LOG_LEVEL=DEBUG
```

2. `.env` Datei in `iosChildApp/` erstellen:
```
FIREBASE_PROJECT_ID=minimaster-28fbd
LOG_LEVEL=DEBUG
FAMILY_CONTROLS_ENABLED=1
```

### Pairing testen (lokal)

**Szenario:** Parent-App und Child-App auf zwei Geräten pairen

1. **Parent-App starten** → **Anmelden** → **Kinder** → **Kind hinzufügen**
2. **6-stelligen Code generieren** (z.B. `123456`)
3. **Child-App starten** → **Gerät verb.** → Code `123456` eingeben
4. **Pairing bestätigt** → MainChildView zeigt Status

### Debugging

**Console Output:**
```bash
# Real device logs
xcrun simctl spawn booted log stream --predicate 'eventMessage contains "MiniMaster"'
```

**Network Debugging (Charles Proxy):**
```swift
// In AppDelegate vor Firebase.configure():
URLSessionConfiguration.default.httpProxy?.host = "127.0.0.1"
URLSessionConfiguration.default.httpProxy?.port = 8888
```

## Troubleshooting

### "Family Controls not authorized"
- ✓ Family Controls Entitlement in Capabilities aktiv?
- ✓ Device unter Screen Time/Family Controls registriert?
- ✓ `requestAuthorization(for: .individual)` aufgerufen?

### "Invalid Team ID"
- ✓ Team ID in Xcode Signing prüfen
- ✓ Provisioning Profile matchet Bundle ID?
- ✓ `ios.xcconfig` aktualisiert?

### "Push Notification not received"
- ✓ APNs Entitlement aktiv?
- ✓ APNS Certificate im Firebase Console hochgeladen?
- ✓ Device-Token erfolgreich an Firebase übertragen?

### "GoogleService-Info.plist missing"
- ✓ Datei wirklich in Xcode Project hinzugefügt?
- ✓ **Build Phases** → **Copy Bundle Resources** → Plist-Datei vorhanden?

## Production Deployment

### TestFlight

1. **Xcode** → **Product** → **Archive**
2. **Organizer** → **Distribute App**
3. **TestFlight** auswählen
4. Tester laden ein (Test User Mails)
5. Build auf TestFlight laden

### App Store

1. **Screenshot + Description** vorbereiten
2. **Privacy Policy + Terms of Service** hinterlegen
3. **Family Controls** als Feature dokumentieren (für Child-App)
4. **Submit for Review**

## Weitere Ressourcen

- [Firebase iOS SDK Docs](https://firebase.google.com/docs/ios/setup)
- [Family Controls Apple Docs](https://developer.apple.com/documentation/familycontrols)
- [Xcode Provisioning Profile Guide](https://developer.apple.com/help/xcode-select-create-manage-provisioning-profiles)
- [Apple App Signing Guide](https://developer.apple.com/help/xcode-select-code-sign-identify-resources)
