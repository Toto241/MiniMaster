# iOS Setup Checkliste

Diese Checkliste führt dich durch alle Schritte für funktionsfähige iOS-Apps (Parent + Child).

## 🟢 Phase 1: Vorbereitung

- [ ] **macOS 13+** installiert
- [ ] **Xcode 15+** installiert (`xcode-select --install`)
- [ ] **Apple Developer Account** erstellt (https://developer.apple.com)
- [ ] **Firebase Projekt** existiert (minimaster-28fbd)
- [ ] **iOS_SETUP.md** gelesen

## 🟡 Phase 2: Firebase-Konfiguration

### Für Parent App

- [ ] **Firebase Console öffnen:** https://console.firebase.google.com
- [ ] **Projekt wählen:** minimaster-28fbd
- [ ] **iOS-App registrieren (falls nicht existiert):** com.minimaster.parentapp
- [ ] **GoogleService-Info.plist herunterladen**
- [ ] **Datei ablegen:** `iosMasterApp/GoogleService-Info.plist`
- [ ] **Firebase SDK in Xcode hinzufügen:**
  - File → Add Packages
  - https://github.com/firebase/firebase-ios-sdk.git
  - FirebaseCore, FirebaseAuth, FirebaseFirestore, FirebaseStorage, FirebaseMessaging

### Für Child App

- [ ] **iOS-App registrieren (falls nicht existiert):** com.minimaster.childapp
- [ ] **⚠️ KRITISCH: Family Controls in Capabilities aktivieren**
  - App ID → Capabilities
  - Family Controls, Device Activity, Managed Settings aktivieren
- [ ] **GoogleService-Info.plist herunterladen**
- [ ] **Datei ablegen:** `iosChildApp/GoogleService-Info.plist`

## 🟠 Phase 3: Xcode-Konfiguration (Parent App)

```bash
open iosMasterApp
```

### Signing & Team

- [ ] **Target:** MiniMasterParent auswählen
- [ ] **Build Settings:** Team ID = dein Apple Developer Team
- [ ] **Entitlements prüfen:** MiniMasterParent.entitlements
  - ✓ Push Notifications
  - ✓ iCloud Keychain

### GoogleService-Info.plist

- [ ] **Project Navigator:** iosMasterApp rechts auswählen
- [ ] **File Inspector:** GoogleService-Info.plist prüfen
- [ ] **Build Phases → Copy Bundle Resources:**
   - GoogleService-Info.plist sollte dort gelistet sein
   - Falls nicht: + Button → GoogleService-Info.plist hinzufügen

### Build & Run

- [ ] **Simulator wählen:** iPhone 15 Pro Simulator (oder Real Device)
- [ ] **Product → Run (Cmd+R)**
- [ ] **App sollte starten** ohne Fehler

## 🟠 Phase 4: Xcode-Konfiguration (Child App)

```bash
open iosChildApp
```

### Signing & Team

- [ ] **Target:** MiniMasterChild auswählen
- [ ] **Build Settings:** Team ID = dein Apple Developer Team
- [ ] **Entitlements prüfen:** MiniMasterChild.entitlements
   - ✓ **Family Controls** (com.apple.developer.family-controls=true)
   - ✓ Device Activity (com.apple.developer.deviceactivity=true)
   - ✓ Managed Settings (com.apple.developer.managed-settings=true)
   - ✓ Push Notifications

### Provisioning Profile

- [ ] **Xcode → Settings → Accounts**
- [ ] **Team auswählen → Download Profiles**
- [ ] **Warte auf Sync** (kann 1-2 Min dauern)

### GoogleService-Info.plist

- [ ] **Project Navigator:** iosChildApp rechts auswählen
- [ ] **File Inspector:** GoogleService-Info.plist prüfen
- [ ] **Build Phases → Copy Bundle Resources:**
   - GoogleService-Info.plist sollte dort gelistet sein

### Build Konfiguration

- [ ] **File → Open project navigator `Package.swift`**
- [ ] **iOS Minimum:** 17.0 oder höher
- [ ] **Build & Run** (nur auf echtem Device möglich!)

## 🔴 Phase 5: Device Setup (Kind-App)

**⚠️ Child App kann NUR auf echtem iPhone/iPad getestet werden! Nicht im Simulator!**

### Auf echtem Device

1. [ ] **iPhone/iPad an Mac anschließen**
2. [ ] **Vertrauen:** "Trust this computer?" → Ja
3. [ ] **In Xcode:** Device in Top-Bar wählen
4. [ ] **Product → Run**
5. [ ] **App auf Device installiert** ✓

### Screen Time / Family Controls

1. [ ] **Device öffnen:** Settings → Family Sharing
2. [ ] [ ] **"Diese Geräte diesem Kinde zuordnen"** (Oder als Child-Account in Family Sharing)
3. [ ] **Screen Time aktivieren:** Settings → Screen Time
4. [ ] **"Das ist das iPhone/-iPad meines Kindes"** auswählen
5. [ ] **MiniMaster in Screen Time Zulassungsliste** (falls nicht auto)

## 💚 Phase 6: Pairing Test

### Beide Apps öffnen (zwei Geräte oder Simulator + Device)

**Parent App (auf Mac oder zweitem Device):**
- [ ] App starten
- [ ] **Anmelden (Email/PW)** oder **Registrieren**
- [ ] **Mein Kind hinzufügen**
- [ ] **6-stelligen Code generieren** (z.B. `123456`)
- [ ] **Notieren & kopieren**

**Child App (auf dem echten Device):**
- [ ] App starten
- [ ] **Gerät verbinden**
- [ ] **6-stelligen Code eingeben**
- [ ] **Verbinden bestätigt** ✓

### Validierung

- [ ] **Parent-App:** Kind wird in Dashboard angezeigt
- [ ] **Child-App:** MainChildView zeigt Status
- [ ] **Firebase Console:** children/{id} document erstellt

## 🟢 Phase 7: Basic Feature Test

### Parent App

- [ ] **Dashboard:** Alle Kinder werden angezeigt
- [ ] **Aufgabe erstellen:** Create Task → Submit
- [ ] **Gerät sperren:** Lock icon → Toggle
- [ ] **Abo ansehen:** Subscription View → Subscribe (optional)

### Child App

- [ ] **Sperrstatus angezeigt** (aktualisiert sich)
- [ ] **Aufgaben sichtbar**
- [ ] **Pull-to-Refresh funktioniert**

## 🔵 Phase 8: Deployment Vorbereitung

### Parent App

- [ ] **Bundle ID ist eindeutig** (in Xcode prüfen)
- [ ] **Version & Build Number** gesetzt (Info.plist)
- [ ] **App Icons enthalten** (AppIcon.appiconset)
- [ ] **Launch Screen** konfiguriert
- [ ] **Privacy Policy prepared**
- [ ] **Terms of Service prepared**

### Child App

- [ ] **Bundle ID ist eindeutig** (com.minimaster.childapp)
- [ ] **Version & Build Number** gesetzt
- [ ] **App Icons enthalten**
- [ ] **Launch Screen** konfiguriert
- [ ] **Family Controls dokumentation prepared** (für App Store)
- [ ] **Privacy Policy prepared**
- [ ] **Entitlements für App Store angefordert** (Family Controls Contract)

## 🟣 Phase 9: CI/CD Setup (Optional)

- [ ] **.github/workflows/ios-build.yml erstellen** (GitHub Actions)
- [ ] **Fastlane Setup** (optional für automated builds)
- [ ] **TestFlight Beta Testers einladen**

## 📋 Troubleshooting Checklist

Falls etwas schiefgeht:

### Build Fehler

1. [ ] **Clean Build Folder** (Cmd+Shift+K)
2. [ ] **Derived Data löschen** (`~/Library/Developer/Xcode/DerivedData`)
3. [ ] **Pods/SPM Neuinstallation** (File → Packages → Reset Package Caches)

### Runtime Fehler

1. [ ] **Xcode Logs** ansehen (Window → Devices & Simulators → Console)
2. [ ] **GoogleService-Info.plist** liegt im Bundle?
3. [ ] **Internet-Verbindung** aktiv?
4. [ ] **Firebase Project ID** korrekt?

### Family Controls Fehler (Child App)

1. [ ] **Entitlements vorhanden?** MiniMasterChild.entitlements prüfen
2. [ ] **Provisioning Profile aktuell?** Xcode → Manage Certificates
3. [ ] **Auf echtem Device?** (Simulator unterstützt FamilyControls NICHT!)
4. [ ] **Screen Time aktiviert?** Settings → Family Sharing prüfen

## ✅ Done!

Alle Schritte abgehakt? Glückwunsch! 🎉

Beide iOS-Apps sollten jetzt:
- ✓ Lokal starten
- ✓ Mit Firebase verbunden sein
- ✓ Pairing funktionieren
- ✓ Befehle synchronisieren

**Nächste Schritte:**
- TestFlight Beta Test
- App Store Submission
- Promotion zur Family

---

**Fragen?** Siehe [iOS_SETUP.md](../iOS_SETUP.md) oder [iosMasterApp/README.md](../iosMasterApp/README.md) / [iosChildApp/README.md](../iosChildApp/README.md)
