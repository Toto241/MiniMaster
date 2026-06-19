# iOS Beta-Testing Setup

Stand: 2026-06-19

## Prerequisites

- [ ] Apple Developer Account (Paid, Team-Zugriff fuer Certificates/Identifiers/Profiles)
- [ ] macOS Build-Host mit Xcode 26+ und iOS 26 SDK fuer App Store Connect Uploads
- [ ] Echtes iPhone/iPad mit iOS 17+ fuer FamilyControls Tests (Simulator reicht nicht)
- [ ] App Store Connect App Records fuer `com.minimaster.parentapp` und `com.minimaster.childapp`
- [ ] App Store Connect API Key, Issuer ID und Key ID fuer automatisierte Upload-/Statusabfragen
- [ ] Family Controls entitlement fuer die Child App von Apple genehmigt und provisioniert

Apple-Referenzen:
- Uploads muessen seit 2026-04-28 mit Xcode 26+ und iOS 26 SDK gebaut werden: <https://developer.apple.com/news/upcoming-requirements/>
- App Store Connect Upload-Optionen: Xcode, App Store Connect API, Transporter/altool: <https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/>
- FamilyControls Dokumentation: <https://developer.apple.com/documentation/familycontrols>
- App Store Connect API: <https://developer.apple.com/documentation/appstoreconnectapi>

## Repo-Gate vor jedem Beta-Lauf

```bash
npm run ios:readiness
npm run ios:readiness:gate
```

Das Gate prueft nur Dinge, die im Repository belegbar sind. Apple-Konto, Entitlements, TestFlight und echtes Device-E2E bleiben externe Release-Blocker, bis Nachweise in `docs/RELEASE_EVIDENCE_REGISTER.md` abgelegt sind.

## Entitlements

`iosChildApp/MiniMasterChild.entitlements` muss mindestens enthalten:

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
agvtool new-version -all "$(date +%Y%m%d%H%M)"
xcodebuild -scheme MiniMasterChild -configuration Release -archivePath build/MiniMasterChild.xcarchive archive
xcodebuild -exportArchive -archivePath build/MiniMasterChild.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/Export
```

Analog fuer `iosMasterApp` mit `MiniMasterParent`.

### 2. Upload zu App Store Connect

Bevorzugt automatisiert ueber App Store Connect API oder Xcode Organizer. Falls der Mac-Host altool nutzt:

```bash
xcrun altool --upload-app --type ios --file "build/Export/MiniMasterChild.ipa" --apiKey "YOUR_API_KEY" --apiIssuer "YOUR_ISSUER_ID"
```

### 3. TestFlight Konfiguration

- App Store Connect -> App -> TestFlight -> Internal Testing
- Testgruppe `MiniMaster Beta` erstellen
- Parent- und Child-Builds zuordnen
- Compliance-Info, Review Notes und Testzugang eintragen
- Child-App-Hinweis aufnehmen: Family Controls entitlement und echtes Kind-/Family-Sharing-Testgeraet erforderlich

## FamilyControls-Testing auf Device

### Automatisierte UI contract tests

```bash
cd iosMasterApp
swift test

cd ../iosChildApp
swift test
```

Abgedeckt:
- Parent Login- und Pairing-Accessibility-Hooks
- Parent MainTab mit Dashboard, Pairing, Aufgaben, Abo
- Child FamilyControls Recovery Section
- Child Safe-Unpair Cleanup
- Child Foreground-Heartbeat-Hook

Diese Tests ersetzen keinen XCUITest auf Geraet, sichern aber die UI- und Source-Contracts fuer Remote-Mac-Agent oder Xcode Cloud.

### Manuelles Erst-Setup

1. App per TestFlight oder Xcode-Direct installieren.
2. Child-App starten und Pairing-Code aus Parent-App eingeben.
3. FamilyControls/Screen-Time-Freigabe im Child-Flow erteilen.
4. Parent-App: Kindgeraet pruefen, Lock/Unlock, App-Blacklist, Aufgaben und Abo-Status testen.

## Testmatrix

| Feature | Erwartung | Status |
| --- | --- | --- |
| Parent Dashboard | Kindgeraete, Lock/Unlock, Regeln sichtbar | Repo vorhanden, Device-E2E offen |
| Parent Pairing | Code/Link dauerhaft ueber Tab erreichbar | Repo vorhanden |
| Parent Tasks | Aufgaben pruefen/genehmigen/ablehnen | Repo vorhanden |
| Parent Abo | StoreKit2 + Backend Verify | Repo vorhanden, ASC Sandbox offen |
| Child Pairing | Code/Token koppelt Device | Repo vorhanden, Device-E2E offen |
| Child FamilyControls | Berechtigung sichtbar und erneut anfragbar | Repo vorhanden, Entitlement offen |
| Child Lock/Unlock | ManagedSettings Shield sperrt/entsperrt | Source vorhanden, Device-E2E offen |
| Child App-Blacklist | Screen-Time-Token werden angewendet | Source vorhanden, Device-E2E offen |
| Child Offline-Policy | Letzte Policy bleibt lokal aktiv | Source vorhanden, Device-E2E offen |
| Child Heartbeat | Start/Foreground-Heartbeat wird gemeldet | Source vorhanden, Background-Evidence offen |
| Daily Usage Limit | DeviceActivityMonitor erzwingt Threshold | P0 geplant |
| Task Photo Upload | Kamera/Foto wird als task_proof hochgeladen | P0 geplant |

## Bekannte Einschränkungen

1. FamilyControls und ManagedSettings sind nicht sinnvoll im Simulator validierbar.
2. Windows kann keinen iOS Archive/TestFlight Build erzeugen.
3. Eine reine Bundle-ID-Blacklist ist auf iOS nicht durchsetzbar; iOS braucht Screen-Time-Token aus FamilyActivityPicker.
4. Daily-Limit-Enforcement ist erst releasefaehig, wenn eine DeviceActivityMonitor Extension Threshold-Events verarbeitet.
5. Task Photo Upload ist auf iOS noch nicht Android-paritaetisch implementiert.

## Nachweise fuer Release Evidence

- `npm run ios:readiness` JSON/Markdown aus `build/ios-readiness/`
- Xcode 26+ Archive- und Export-Logs fuer Parent und Child
- App Store Connect Upload-/Processing-Nachweis
- TestFlight Internal Testing Screenshot/API-Auszug
- Physical Device E2E-Protokoll mit FamilyControls
- Privacy Labels, Age Rating, Subscription Products und Review Notes

**Nächste Prüfung:** Vor jedem TestFlight-Upload und vor jedem App-Store-Review-Kandidaten
