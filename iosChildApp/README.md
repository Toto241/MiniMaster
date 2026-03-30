# MiniMaster Child App (iOS)

Kind-App mit Screen Time-Integration (FamilyControls), Device-Locking und Kommando-Synchronisierung vom Eltern-Gerät.

## Schnellstart

### Anforderungen
- **Xcode 15+**
- **iOS 17+** auf echtem iPhone/iPad (nicht Simulator!)
- **Swift 5.9+**
- Firebase Account (minimaster-28fbd)
- **Family Controls Contract** von Apple (wichtig!)

### Lokales Setup (5 min)

```bash
# 1. GoogleService-Info.plist von Firebase Console herunterladen
#    Bundle ID: com.minimaster.childapp
#    ⚠️  WICHTIG: Family Controls in App-Capabilities aktivieren!

# 2. Datei hier ablegen:
cp ~/Downloads/GoogleService-Info.plist .

# 3. Xcode öffnen
open .

# 4. In Xcode:
#    • Team ID in Build Settings setzen
#    • Entitlements überprüfen (MiniMasterChild.entitlements)
#    • Auf echtem Device deployen (Simulator ≠ FamilyControls!)
```

## ⚠️ Family Controls - Kritisches Entitlement

Diese App benötigt Apples **FamilyControls** Framework (Screen Time API).

**Aktivierung:**
1. Apple Developer Portal → App ID `com.minimaster.childapp`
2. Capabilities → **Familie Controls** aktivieren
3. Neues Provisioning Profile herunterladen
4. `MiniMasterChild.entitlements` muss enthalten:
   ```xml
   <key>com.apple.developer.family-controls</key>
   <true/>
   <key>com.apple.developer.managed-settings</key>
   <true/>
   <key>com.apple.developer.deviceactivity</key>
   <true/>
   ```

**Device-Anforderung:**
- ✓ Echtes iPhone/iPad (iOS 17+)
- ✓ Screen Time/Family Sharing aktiviert
- ✓ Device als "Child Account" registriert oder in Family Sharing

Simulator kann Family Controls **NICHT** testen!

## App-Struktur

```
Sources/MiniMasterChild/
├── App/
│   ├── MiniMasterChildApp.swift        # Entry point + AppDelegate
│   └── ChildRootView.swift             # Auth gate → PairingView/MainChildView
├── Models/
│   ├── PolicyState.swift               # Lokaler Policy-Zustand (Codable)
│   ├── PolicyStore.swift               # @MainActor ObservableObject + UserDefaults
│   └── AnyCodable.swift                # Type-erased Codable für API-Responses
├── Services/
│   ├── CommandSyncService.swift        # Control-Plane Sync (Hauptlogik)
│   ├── AppBlockingManager.swift        # ManagedSettings + DeviceActivity
│   ├── ChildAuthService.swift          # Pairing + Firebase Auth
│   └── ChildCloudFunctionsClient.swift # Cloud Function Wrappers
└── Views/
    ├── MainChildView.swift             # Status + Aufgabenliste
    └── ChildPairingView.swift          # 6-stelliger Pairing-Code
```

## Kommando-Synchronisierung (Control-Plane)

**Architektur:**
```
Parent App                    Firebase                  Child Device
(Cloud Function)            (Firestore)                (iOS App)

setDeviceLocked() ────→ children/{id}/commands/ ────→ fetchPendingCommands()
                        ├─ type: "lock_state"         ↓
                        ├─ payload: {isLocked}        applyAndAck()
                        └─ policyVersion: 42          ↓
                                                   acknowledgeCommand()
                                                   (status: "applied")
```

**Policy Versioning:**
- Jeder Befehl trägt `policyVersion`
- Child speichert `lastPolicyVersion`
- Duplikate sind sicher (Idempotenz durch Version)

## Cloud Functions (Backend)

### Authentication
- `validatePairingCode(code)` → `{ childId, firebaseToken }`
- `validatePairingToken(token)` → `{ childId, firebaseToken }`

### Device Endpoint
- `registerDeviceEndpoint(childId, token, appVersion, capabilities, provider=apns)`

### Control-Plane
- `fetchPendingCommands(childId, cursor?)` → `{ commands, nextCursor, policyVersion }`
- `acknowledgeCommand(childId, commandId, status, appliedAt, errorCode?)`
- `syncPolicySnapshot(childId, knownPolicyVersion)` → `{ fullPolicy, upToDate, policyVersion }`

### Events
- `publishDeviceEvent(childId, eventType, payload, idempotencyKey)`
  - Types: `heartbeat`, `usage_report`, `tamper_detected`, `task_proof`

### Tasks
- `getTasks(childId)` → `[{ id, description, status, deadline, ... }]`

## Firestore Data (Read-Only)

```
children/{childId}
├── masterImei: String
├── isLocked: Boolean
├── appBlacklist: [String]
├── usageRules: { dailyLimit, bedtime... }
├── policyVersion: Int (monoton steigend)
└── lastPolicyVersion: Int (last applied by device)

children/{childId}/commands/{commandId}
├── type: String (lock_state, app_blacklist, usage_rules, screen_time, policy_update)
├── payload: { key: AnyCodable }
├── policyVersion: Int
├── status: pending | applied | failed
├── createdAt: Timestamp
└── expiresAt: Timestamp

children/{childId}/events/{eventId}
├── eventType: String (heartbeat, usage_report, task_proof)
├── payload: { JSON }
├── createdAt: Timestamp
└── deviceVersion: Int (policyVersion zur Zeit des Events)
```

## Development-Tipps

### PolicyStore + UserDefaults
```swift
@MainActor
final class PolicyStore: ObservableObject {
    @Published private(set) var policy: PolicyState

    func apply(_ newPolicy: PolicyState) {
        policy = newPolicy
        // Auto-persisted zu UserDefaults
    }
}
```

### CommandSyncService Lifecycle
```
App Start:
  1. onAppStart() → syncPolicySnapshot() → fetchPendingCommands()
  2. reportHeartbeat()

FCM Wake-Up:
  1. onFcmWakeUp() → fetchPendingCommands()

Kontinuierlich:
  • FCM Token Refresh → registerEndpoint()
  • (In Zukunft) Periodic Heartbeat via WorkManager
```

### AppBlockingManager (Screen Time)
```swift
// Apply Policy
blockingManager.applyPolicy(PolicyState(isLocked: true, ...))

// Oder einzeln:
blockingManager.applyCommand(DeviceCommand(type: .lockState, ...))

// Ergebnis: ManagedSettings.store.shield aktiviert App-Blocking
```

### Pairing Flow
```
1. ChildPairingView: User gibt 6-stelligen Code ein
2. ChildAuthService.pairWithCode(code)
   → validatePairingCode() → customToken
3. Firebase.signIn(withCustomToken:)
4. Gespeichert: childId, Token in Keychain
5. CommandSyncService.configure(childId: ...)
6. MainChildView eingeblendet
```

## Lokales Testen

### Auf echtem Device
```bash
# Signing
# 1. Team ID setzen

# Build & Run
open .
# In Xcode: Product → Run auf physikalischem iPhone/iPad

# Nach Installation auf Device:
# 1. Settings → Family Sharing → "Dieser ist mein Kindes Gerät"
# 2. Screen Time aktivieren
# 3. MiniMaster-App öffnen → Pairing-Code eingeben
```

### FCM Testing (Firebase Console)
```bash
# 1. Firebase Console → Cloud Messaging
# 2. Neuer Notification an Children/{childId}
# 3. Data Payload: { "policyVersion": "42" }
# 4. App sollte onFcmWakeUp() aufrufen
```

## Troubleshooting

### "Family Controls authorization denied"
→ Settings → Screen Time → MiniMaster erlauben

### "This app has no Family Controls entitlement"
→ Apple Developer Portal → Capabilities → Family Controls aktivieren
→ Neues Provisioning Profile herunterladen

### "FamilyControls not available on Simulator"
→ **Immer** auf echtem Device testen!
→ Simulator präsentiert nur Stubs

### "Commands not applying"
→ Prüfe Policy Version in Firestore
→ Prüfe PolicyStore.lastSyncDate im MainChildView
→ Logs: CommandSyncService.syncError

### "FCM Token nicht registriert"
→ AppDelegate.messaging(_:didReceiveRegistrationToken:) prüfen
→ Notification.Name.childFcmTokenRefreshed posted?
→ commandSyncService.registerEndpoint() aufgerufen?

## Nächste Schritte

- [ ] Periodic Heartbeat (WorkManager-äquivalent für Swift)
- [ ] Usage Tracking (App-Öffnungen + Bildschirmzeit)
- [ ] Tamper Detection (Jailbreak-Prüfung)
- [ ] Task Photo Upload (Camera + Firebase Storage)
- [ ] TestFlight Beta-Test mit Familie
- [ ] App Store Submission (Privacy Policy, Family Controls docs)
