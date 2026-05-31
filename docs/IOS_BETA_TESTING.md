# iOS Beta-Testing Setup

## Prerequisites

- [ ] Apple Developer Account (Paid — $99/year)
- [ ] Xcode 15+ with iOS 17+ SDK
- [ ] Device with iOS 17+ for FamilyControls testing (Simulator **not supported**)
- [ ] App Store Connect App Record created

## Entitlements (bereits konfiguriert in MiniMasterChild.entitlements)

```xml
<key>com.apple.developer.family-controls</key>
<true/>
<key>com.apple.developer.deviceactivity</key>
<true/>
<key>com.apple.developer.managed-settings</key>
<true/>
```

## TestFlight Workflow

### 1. Build vorbereiten

```bash
cd iosChildApp
# Version bump
agvtool new-version -all $(date +%Y%m%d%H%M)
# Build
xcodebuild -scheme MiniMasterChild -configuration Release -archivePath build/MiniMasterChild.xcarchive archive
# Export
xcodebuild -exportArchive -archivePath build/MiniMasterChild.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/Export
```

### 2. Upload zu App Store Connect

```bash
xcrun altool --upload-app --type ios --file "build/Export/MiniMasterChild.ipa" --apiKey "YOUR_API_KEY" --apiIssuer "YOUR_ISSUER_ID"
```

### 3. TestFlight Konfiguration

- App Store Connect → App → TestFlight → Internal Testing
- Testgruppe "MiniMaster Beta" erstellen
- Mindestens 1 internen Tester hinzufügen (Apple ID erforderlich)
- Build zu Gruppe hinzufügen
- Compliance-Info: **NOT** using encryption → No
- Beta-App-Review: Beschreibung + Testinformationen ausfüllen

### 4. Beta-Tester einladen

**Intern (sofort verfügbar):**
- Bis zu 100 interne Tester (App Store Connect Benutzer)

**Extern (Beta-Review nötig):**
- Bis zu 10.000 externe Tester
- Öffentlicher Link oder E-Mail-Einladung
- Beta-App-Review dauert typisch 1-2 Tage

## FamilyControls-Testing auf Device

### Automatisierte UI-Contract-Tests (Repo)

Vor dem manuellen Beta-Lauf können folgende Swift-Package-Tests ausgeführt werden:

```bash
cd iosMasterApp
swift test
```

Abgedeckt durch `MiniMasterParentUIContractTests`:
- LoginView Accessibility-IDs (`login.imeiField`, `login.deviceNameField`, `login.registerButton`)
- PairingView Accessibility-IDs (`pairing.generateCodeButton`, `pairing.generateLinkButton`)

Diese Tests ersetzen keinen XCUITest auf Gerät, sichern aber die UI-Hooks für künftige UI-Automation.

### Erst-Setup
1. App installieren (TestFlight oder Xcode-Direct)
2. App starten → Child-Registrierung durchlaufen
3. **Einstellungen → Bildschirmzeit → App-Limits → MiniMasterChild aktivieren**
4. "Gerät suchen" erlauben (für Location-Proofs, optional)

### Was zu testen ist

| Feature | Erwartung | Test-Status |
|---------|-----------|-------------|
| Gerät sperren (Eltern-App) | MiniMasterChild zeigt Sperrbildschirm | ⬜ |
| App-Blacklist | Blockierte Apps starten nicht | ⬜ |
| Aufgabe mit Foto-Proof | Kamera öffnet, Bild hochladen | ⬜ |
| Sperre aufheben | Apps wieder nutzbar | ⬜ |
| Offline-Modus | Lokale Regeln bleiben aktiv | ⬜ |
| Doze / Batterie-Optimierung | WorkManager-Sync funktioniert | ⬜ |

## Bekannte Einschränkungen

1. **Simulator**: FamilyControls funktioniert nur auf echten Geräten
2. **iOS 16 und älter**: `ManagedSettings` API nicht verfügbar → Fallback zu lokaler Sperre
3. **Enterprise/Gerät aus Schul-MDM**: Screen-Time-API kann blockiert sein
4. **Kind über 18**: FamilyControls verweigert Authorization (Apple-Richtlinie)

## Debug-Logging

```swift
// In AppBlockingManager.swift
print("[FamilyControls] Authorization: \(isAuthorized)")
print("[FamilyControls] Shield applied: \(isLocked)")

// In CrossPlatformSyncService.swift
print("[Sync] Policy version: \(lastPolicyVersion)")
print("[Sync] Commands received: \(commands.count)")
```

## Crashlytics / Firebase Analytics

- Crashlytics ist in `GoogleService-Info.plist` konfiguriert
- Analytics-Events: `screen_view`, `task_complete`, `device_lock_toggle`
- Dashboard: Firebase Console → Analytics → Events

## Beta-Feedback sammeln

1. TestFlight → App → Feedback
2. In-App Shake-to-Feedback (konfiguriert in Settings.swift)
3. Support-Ticket direkt aus App (für Eltern-Panel integriert)

---
**Letzte Aktualisierung:** Auto-generiert
**Nächste Prüfung:** Vor jedem TestFlight-Upload