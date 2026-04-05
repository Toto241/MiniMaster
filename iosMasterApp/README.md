# MiniMaster Parent App (iOS)

Eltern-App zum Verwalten von Kindgeräten mit Aufgabenerstellung, Richtlinien-Verwaltung und Subscription-Handling.

## Schnellstart

### Anforderungen
- Xcode 15+
- iOS 17+
- Swift 5.9+
- Firebase Account (minimaster-28fbd)

### Lokales Setup (5 min)

```bash
# 1. GoogleService-Info.plist von Firebase Console herunterladen
#    Bundle ID: com.minimaster.parentapp

# 2. Datei hier ablegen:
cp ~/Downloads/GoogleService-Info.plist .

# 3. Xcode öffnen
open .

# 4. In Xcode:
#    • Team ID in Build Settings setzen
#    • Product → Run (Cmd+R)
```

## App-Struktur

```
Sources/MiniMasterParent/
├── App/
│   ├── MiniMasterParentApp.swift       # Entry point
│   └── RootView.swift                  # Auth gate + MainTabView
├── Models/
│   ├── ChildDevice.swift               # Device-Daten + Status
│   └── TaskItem.swift                  # Task mit Status/AI-Analyse
├── Services/
│   ├── AuthService.swift               # Firebase Auth + Keychain
│   ├── CloudFunctionsClient.swift      # Alle callable functions
│   └── SubscriptionService.swift       # StoreKit2 + Verify
├── ViewModels/
│   ├── DashboardViewModel.swift        # Firestore Listener
│   └── TaskReviewViewModel.swift       # Task-Approval Flow
└── Views/
    ├── DashboardView.swift             # Dashboard (5 Sub-Views)
    ├── LoginView.swift                 # Registration + Login
    ├── PairingView.swift               # QR + 6-stelliger Code
    ├── TaskListView.swift              # Task Review UI
    └── SubscriptionView.swift          # StoreKit2 Products
```

## Cloud Functions (Backend)

Diese App ruft folgende Firebase Cloud Functions auf:

### Authentifizierung
- `registerMasterDevice(name)` → `{ imei, secretKey }`
- `login(imei, secretKey, appVersion)` → `{ customToken }`

### Pairing
- `generatePairingLink()` → `{ token, expiresAt }`
- `createPairingCode()` → `{ code }`

### Device-Management
- `registerDeviceEndpoint(childId, token, appVersion, capabilities)`
- `setDeviceLocked(childId, isLocked)`
- `updateAppBlacklist(childId, appBlacklist)`
- `setUsageRules(childId, usageRules)`
- `getRulesForChild(childId)` → `{ isLocked, appBlacklist, usageRules, ... }`

### Task-Management
- `createTask(childId, description, deadline?)`
- `approveTask(taskId, childId, aiAnalysis)`
- `rejectTask(taskId, childId, rejectReason)`

### Subscription
- `verifyPurchase(receiptData, productId)`
- `getSubscriptionStatus(imei)` → `{ status, tier, expiresAt }`

## Firestore Data

**Master Device (selbst)**
```
masters/{masterImei}
├── name: String
├── email: String
├── secretKey: String (Keychain!)
├── registeredAt: Timestamp
└── subscriptionTier: String
```

**Kind-Geräte**
```
children/{childId}
├── masterImei: String
├── deviceName: String
├── isLocked: Boolean
├── appBlacklist: [String] (Android: Bundle IDs, iOS: Screen-Time-Token-Strings mit Prefix `ios-app-token:`)
├── usageRules: { dailyLimit, bedtime... }
├── policyVersion: Int
├── lastPolicyVersion: Int
├── lastSeen: Timestamp
└── capabilities: [String]

children/{childId}/tasks/{taskId}
├── description: String
├── status: pending | pending_approval | approved | rejected
├── photoUrl: String
├── deadline: Timestamp
├── completedAt: Timestamp
└── aiAnalysis: String
```

## Development-Tipps

### Keychain-Debugging
```swift
// In AuthService anschauen:
let credentials = KeychainHelper.shared.load(key: "master_imei")
```

### Firestore Listener
```swift
// In DashboardViewModel:
db.collection("children")
  .whereField("masterImei", isEqualTo: masterImei)
  .addSnapshotListener { snapshot, error in ... }
```

### StoreKit2
```swift
// Produkte laden:
let products = try await Product.products(for: ["com.minimaster.tier1"])

// Purchase:
if let result = try await product.purchase() {
    switch result {
    case .success(let transaction):
        await verifyWithBackend(transaction)
    }
}
```

### Pairing UI
- **QR-Code**: `CIFilter.qrCodeGenerator()` + `CIImage`
- **6-stellig Code**: Nur Ziffern, auto-submit bei 6 Ziffern

## Tests

```bash
# iOS Unit Tests (Unit-Level, Mocks)
xcodebuild test -scheme MiniMasterParent -destination 'platform=iOS Simulator,name=iPhone 15'

# iOS UI Tests (KIF, XCTestDynamicOverlay - optional)
# (Noch nicht implementiert)
```

## Troubleshooting

### "Invalid Team ID"
→ Xcode → Target → Signing → Team auswählen

### "GoogleService-Info.plist not found"
→ Xcode → Build Phases → Copy Bundle Resources prüfen

### "Keychain write failed"
→ Simulator: Settings → Developer → Achtung bei Keychain-Zugriff über Simulator-Grenze

### "Firebase Auth failing"
→ Prüfe: internet connectivity + firebase console status

## Nächste Schritte

- [ ] TestFlight-Deployment einrichten
- [ ] App Store - Privacy Policy hinterlegen
- [ ] Push Notifications (APNs) in Firebase verknüpfen
- [ ] Error-Tracking (Sentry, Firebase Crashlytics)
