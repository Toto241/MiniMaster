# High-Priority Workpackages – Umsetzungsplan

**Datum:** 23. April 2026
**Basis:** Vollumfängliche Projektanalyse + Dokumentationsprüfung
**Ziel:** Projektweite Umsetzung der 6 kritischen Lücken mit selbst priorisierten Arbeitspaketen.

---

## Priorisierungslogik

1. **Backend-First:** iOS-Clients bauen auf Backend-Features auf (Apple API, Auth-Claims).
2. **Markt-Blocker vor interner Schuld:** iOS-Fehlstellung schließt ~50 % des Marktes aus.
3. **Fundamente vor Polishing:** Auth-Migration + Schema-Migration müssen vor Client-Hardening stabil sein.

---

## Arbeitspakete (AP)

### AP1: Apple App Store Server API (Backend)
**Status:** 🔴 Blocker für iOS-Subscription
**Ziel:** Vollständige Receipt-Validation + Server-to-Server-Notifications für Apple.

- [ ] `verifyApplePurchase` callable function (StoreKit2 receipt → Apple API → Entitlement)
- [ ] Apple Server Notifications HTTP-Handler (analog RTDN)
- [ ] `reverifyAppleSubscriptions` scheduled function (täglich)
- [ ] Environment-Variablen: `APPLE_ISSUER_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`
- [ ] `.env.example` + Deployment Guide aktualisieren
- [ ] Unit-Tests für Apple-Flows

### AP2: iOS MasterApp Grundgerüst
**Status:** 🔴 Nicht existent (nur Package.swift Stub)
**Ziel:** MVP-fähige Eltern-App für iOS 17+ (SwiftUI).

- [ ] `Package.swift` mit Firebase SPM Dependencies
- [ ] `MiniMasterParentApp.swift` – App-Einstieg, Firebase-Config
- [ ] `AuthService.swift` – Firebase Auth + CustomToken, Anonymous Sign-In
- [ ] `CloudFunctionsClient.swift` – Wrapper für alle callable functions
- [ ] `ChildDevice.swift`, `TaskItem.swift` – Models
- [ ] `RootView.swift` – Auth-Gate + Tab-Navigation
- [ ] `LoginView.swift` – Registration / Pairing
- [ ] `DashboardView.swift` – Geräteliste, Lock, Rules
- [ ] `TaskListView.swift` – Task Review + Approval
- [ ] `SubscriptionView.swift` – StoreKit2 Product Loading (UI-Stub)
- [ ] `GoogleService-Info.plist` Template
- [ ] Entitlements + Info.plist

### AP3: iOS ChildApp Grundgerüst
**Status:** 🔴 Nicht existent
**Ziel:** MVP-fähige Kinder-App für iOS 17+ mit FamilyControls.

- [ ] `Package.swift` mit Firebase SPM Dependencies
- [ ] `MiniMasterChildApp.swift` – App-Einstieg
- [ ] `ChildAuthService.swift` – Pairing + Firebase Auth
- [ ] `CommandSyncService.swift` – fetchPendingCommands, acknowledgeCommand, syncPolicySnapshot
- [ ] `PolicyState.swift` / `PolicyStore.swift` – Lokaler Policy-Cache (@MainActor)
- [ ] `AppBlockingManager.swift` – ManagedSettings + DeviceActivity (Screen Time API)
- [ ] `ChildRootView.swift` – Navigation (Pairing → Main)
- [ ] `ChildPairingView.swift` – 6-stelliger Code
- [ ] `MainChildView.swift` – Lock-Status + Aufgabenliste
- [ ] `GoogleService-Info.plist` Template
- [ ] Entitlements (`com.apple.developer.family-controls`)

### AP4: Legacy Auth Migration finalisieren
**Status:** 🟡 Phase 1 umgesetzt, Phase 2/3 offen
**Ziel:** IMEI/secretKey vollständig entfernen.

- [ ] Backend: `DISABLE_LEGACY_SECRETKEY_AUTH=true` als Default setzen
- [ ] Backend: `generateCustomToken` + `registerMasterDevice` als deprecated markieren
- [ ] Android MasterApp: `secretKey` aus Speicher/UI entfernen, Firebase Auth Anonymous Sign-In
- [ ] Android ChildApp: Pairing mit Firebase Auth statt IMEI-only
- [ ] Web-Control: Secret-Key Login UI entfernen (bereits weitgehend)
- [ ] Telemetry: `legacyAuthUsage` auf 0 für 14 Tage prüfen
- [ ] Firestore-Backfill: `masters/{uid}` für Legacy-IDs

### AP5: Families Schema Migration (Vorbereitung)
**Status:** 🟡 Blockiert bis Auth-Migration abgeschlossen
**Ziel:** Hierarchisches Schema `families/{familyId}` vorbereiten.

- [ ] `families` Collection + Security Rules (nur Functions)
- [ ] Dual-Write-Adapter in `device-sync.ts` / `tasks.ts`
- [ ] Migration-Script für Backfill (Cloud Function)
- [ ] Client-Adapter für Queries (Family-Context Resolver)

### AP6: Android Offline Policy Cache + Conflict Resolution
**Status:** 🟡 Gap dokumentiert in ARCHITECTURE.md
**Ziel:** Child-App kann offline Policies anwenden und bei Reconnect synchronisieren.

- [ ] `PolicyCache` (Room/DataStore) in childApp
- [ ] `PolicyVersion` Tracking lokal vs. remote
- [ ] Conflict Resolution Strategy: Server-wins mit Merge für unabhängige Felder
- [ ] `syncPolicySnapshot` Integration bei App-Start + Reconnect
- [ ] WorkManager-Task für periodischen Sync (Fallback zu FCM)

### AP7: Android Anti-Tamper Hardening
**Status:** 🟡 Prototype-Kennzeichnung
**Ziel:** Bypass-Resistance erhöhen.

- [ ] Debug-Detection (`isDebuggerConnected`, `Debug.isDebuggerConnected()`)
- [ ] Root-Detection (SafetyNet/Play Integrity API Check)
- [ ] Emulator-Detection
- [ ] Accessibility-Service-Prozess-Validierung
- [ ] Battery-Optimization-Whitelist-Check + User-Guidance
- [ ] Certificate Pinning für Firebase-Calls
- [ ] Overlay-Protection: Prüfen ob eigener Overlay durch andere Apps überdeckt wird

---

## Umsetzungsreihenfolge (vorgeschlagen)

| Woche | AP | Liefergegenstand |
|-------|----|------------------|
| 1 | AP1 + AP2-Start | Apple Backend API + iOS MasterApp Skeleton |
| 2 | AP2 + AP3 | iOS MasterApp MVP + iOS ChildApp Skeleton |
| 3 | AP3 + AP4-Start | iOS ChildApp MVP (FamilyControls) + Auth-Migration Backend |
| 4 | AP4 + AP5-Start | Auth-Migration Clients + Families Dual-Write |
| 5 | AP5 + AP6 | Families Migration + Android Offline Cache |
| 6 | AP6 + AP7 | Android Conflict Resolution + Anti-Tamper |

---

## Abhängigkeiten

```
AP1 (Apple Backend) ──→ AP2 (iOS Master Subscription)
AP1 (Apple Backend) ──→ AP3 (iOS Child StoreKit)
AP4 (Auth Migration) ──→ AP5 (Families Schema)
AP5 (Families Schema) ──→ AP6 (Android Offline Cache) [optional]
```

**SOFORT-Start empfohlen:** AP1 + AP2 parallel (unabhängig voneinander bis StoreKit-Integration).
