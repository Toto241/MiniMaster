# Child Enforcement Härtungs-Testmatrix (AP-N4)

> **Status:** Draft v0.1 — Stand der Umsetzung
> **Scope:** Android childApp, iOS MiniMasterChild, Cloud Functions

## 1. Ziel

Erfassung aller Enforcement-Pfade (App-Blocking, Task-Erzwingung, Screen-Time-Limit, Safe-Mode) mit ihrem aktuellen Testabdeckungsgrad und den geplanten Härtungsmaßnahmen.

---

## 2. Enforcement-Kategorien

### 2.1 App-Blocking (Android)

| Pfad | Implementierung | Tests | Status |
|------|----------------|-------|--------|
| `DeviceAdminReceiver.onReceive` (ACTION_LOCK / ACTION_UNLOCK) | `childApp/.../admin/DeviceAdminReceiver.kt` | 12 Unit-Tests | ✅ |
| `AccessibilityService` App-Switch-Detection + Overlay-Block | `AppBlockAccessibilityService.kt` | 8 Unit-Tests | ✅ |
| `OverlayBlockerActivity` (Full-Screen-Block) | `OverlayBlockerActivity.kt` | 6 UI-Tests | ✅ |
| **Whitelist-Override** (Notfall-Kontakte, Eltern-App) | `EmergencyContactBypass.kt` | 3 Unit-Tests | ⚠️ |
| **Anti-Tamper** (Deaktivierungsversuche erkennen) | *Nicht implementiert* | — | ❌ |

### 2.2 Task-Erzwingung (Android + iOS)

| Pfad | Implementierung | Tests | Status |
|------|----------------|-------|--------|
| `TaskEnforcer.showTaskOverlay()` | `TaskEnforcer.kt` | 10 Unit-Tests | ✅ |
| `TaskEnforcer.handleTaskCompletion()` | `TaskEnforcer.kt` | 8 Unit-Tests | ✅ |
| **Belohnungs-Task-Pfad** (Freigabe nach Foto-Proof) | `TaskEnforcer.kt` | 4 Unit-Tests | ⚠️ |
| **Penalties** (Verweigerung → Screen-Time-Reduktion) | *Nicht implementiert* | — | ❌ |

### 2.3 Screen-Time / Usage Rules (Android + iOS)

| Pfad | Implementierung | Tests | Status |
|------|----------------|-------|--------|
| `UsageRuleEngine.applyDailyLimit()` | `UsageRuleEngine.kt` | 6 Unit-Tests | ✅ |
| `UsageRuleEngine.applyBedtime()` | `UsageRuleEngine.kt` | 5 Unit-Tests | ✅ |
| **Cross-Day-Rollover** (Limit überschreitet Mitternacht) | `UsageRuleEngine.kt` | 2 Unit-Tests | ⚠️ |
| **iOS DeviceActivitySchedule** | `AppBlockingManager.swift` | Source-Contract + iOS Readiness Gate; DeviceActivityMonitor Extension offen | ⚠️ |

### 2.4 Offline-Fallback / Safe-Mode

| Pfad | Implementierung | Tests | Status |
|------|----------------|-------|--------|
| `OfflinePolicyCache.enforceOfflineFallbackIfExpired()` | `OfflinePolicyCache.kt` | 9 Unit-Tests | ✅ |
| `HeartbeatWorker` Safe-Mode-Trigger (>72h offline) | `HeartbeatWorker.kt` | 4 Unit-Tests | ✅ |
| **Policy-Version-Mismatch-Resolution** | `OfflinePolicyCache.kt` | 3 Unit-Tests | ⚠️ |

---

## 3. Härtungsmaßnahmen (Geplant)

### Welle 1 — Anti-Tamper-Fundament

- [ ] **Deaktivierungs-Monitor:** AccessibilityService erkennt, wenn der Benutzer versucht, die App zu deinstallieren oder die Geräteadministrator-Rechte zu entfernen → Sofort-Benachrichtigung an Master + Lockdown-Modus
- [ ] **Safe-Mode-Trigger bei Tamper:** Wenn Tamper erkannt → sofortiger Safe-Mode (alles blockiert, nur Notfall-Kontakte)
- [ ] **Selbstheilung:** Periodischer Check (alle 5 Min), ob der Accessibility-Service noch läuft; wenn nicht → Restart-Intent

### Welle 2 — Penalty-System

- [ ] **Task-Verweigerung zählt:** 3× Verweigerung → Reduktion der Tages-Screen-Time um 30 Min
- [ ] **Frist-Überschreitung:** Task nicht innerhalb Zeitfenster erledigt → automatische "Milde"-Status-Verzögerung
- [ ] **Bonus-Pool:** Extra-Screen-Time für frühzeitige / qualitative Task-Erledigung

### Welle 3 — iOS Enforcement-Parität

- [ ] **iOS App Blocking E2E-Tests:** XCTest-UI-Tests für ManagedSettings-Integration
- [ ] **FamilyActivityPicker-E2E:** Master wählt Apps → Token → Child enforced
- [x] **iOS Offline-Policy:** `OfflinePolicyCache.swift` + `PolicyStore` persistieren letzte Policy
- [ ] **DeviceActivityMonitor Extension:** Daily-Limit-Thresholds erzwingen
- [ ] **Task Photo Upload:** iOS Child Proof-Upload auf Android-Niveau bringen

---

## 4. Testabdeckungsziele

| Kategorie | Aktuell | Ziel | Gap |
|-----------|---------|------|-----|
| Unit-Tests (JVM) | 71% | 85% | +14% |
| Android UI-Tests | 45% | 70% | +25% |
| iOS Unit-Tests | 35% | 75% | +40% |
| iOS UI-Tests | 10% | 60% | +50% |
| Cloud Functions | 94% | 95% | +1% |

---

## 5. Anti-Tamper-Spezifikation (Welle 1)

### Erkennungspfade

1. **Deinstallationsversuch:** `ACTION_PACKAGE_REMOVED` Broadcast → Prüfe, ob unser eigenes Package in der Intent-Data ist
2. **Admin-Deaktivierung:** `DeviceAdminReceiver.onDisabled()` → Wird aufgerufen, wenn Admin-Rechte entfernt werden
3. **Accessibility-Service-Stop:** Periodischer Health-Check (alle 5 Min) → `AccessibilityManager.isEnabled` prüfen
4. **Factory-Reset-Erkennung:** `ACTION_FACTORY_RESET` Broadcast (falls verfügbar)

### Reaktion

```
Tamper erkannt →
  1. Sofortiger Safe-Mode (alles blockieren)
  2. Push-Benachrichtigung an Master: "Gerät {childName} hat Sicherheitsmaßnahmen umgangen"
  3. Audit-Log-Eintrag: `security.tamper_detected`
  4. Heartbeat beschleunigen (alle 30s statt 5min) für schnellere Reaktion
```

### Implementierungsskizze

```kotlin
// childApp/src/main/java/.../security/TamperDetector.kt
class TamperDetector(
    private val context: Context,
    private val policyCache: OfflinePolicyCache,
    private val commandSync: CommandSyncRepository
) {
    fun register() {
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_REMOVED)
            addDataScheme("package")
        }
        context.registerReceiver(tamperReceiver, filter)
        startHealthCheck()
    }
    
    private val tamperReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.data?.schemeSpecificPart == ctx.packageName) {
                triggerTamperResponse("package_removed")
            }
        }
    }
    
    private fun triggerTamperResponse(reason: String) {
        policyCache.enforceSafeMode()
        commandSync.reportTamperEvent(reason)
    }
}
```

---

## 6. iOS Offline-Policy-Cache (Welle 3)

### Problem

iOS `AppBlockingManager` nutzt nur ManagedSettings (kein Offline-Cache). Bei 72h ohne Server-Kontakt bleibt die letzte Policy aktiv — es gibt keinen Safe-Mode.

### Lösung

```swift
// iosChildApp/Sources/MiniMasterChild/Services/OfflinePolicyCache.swift
import Foundation

actor OfflinePolicyCache {
    static let shared = OfflinePolicyCache()
    
    private let defaults = UserDefaults.standard
    private let POLICY_KEY = "cachedPolicy"
    private let TIMESTAMP_KEY = "policyAppliedAt"
    private let SAFE_MODE_KEY = "safeModePayload"
    
    struct CachedPolicy: Codable {
        let policyVersion: Int
        let appliedAt: Date
        let isLocked: Bool
        let appBlacklist: [String]
        let dailyLimitMinutes: Int?
        let bedtimeStart: String?
        let bedtimeEnd: String?
    }
    
    func cachePolicy(_ policy: PolicyState) {
        let cached = CachedPolicy(
            policyVersion: policy.version,
            appliedAt: Date(),
            isLocked: policy.isLocked,
            appBlacklist: policy.appBlacklist,
            dailyLimitMinutes: policy.usageRules.dailyLimitMinutes,
            bedtimeStart: policy.usageRules.bedtimeStart,
            bedtimeEnd: policy.usageRules.bedtimeEnd
        )
        if let data = try? JSONEncoder().encode(cached) {
            defaults.set(data, forKey: POLICY_KEY)
        }
    }
    
    func enforceOfflineFallbackIfExpired() {
        guard let data = defaults.data(forKey: POLICY_KEY),
              let cached = try? JSONDecoder().decode(CachedPolicy.self, from: data) else {
            return
        }
        
        let hoursSinceUpdate = Date().timeIntervalSince(cached.appliedAt) / 3600
        
        if hoursSinceUpdate > 72 {
            let safeMode = PolicyState(
                isLocked: true,
                appBlacklist: [],
                usageRules: PolicyState.UsageRulesState(dailyLimitMinutes: 0, bedtimeStart: nil, bedtimeEnd: nil)
            )
            AppBlockingManager.shared.applyPolicy(safeMode)
        }
    }
}
```

---

## 7. Nächste Schritte

1. **Anti-Tamper Welle 1** — `TamperDetector.kt` implementieren
2. **Penalty-System Welle 2** — `TaskPenaltyEngine.kt` implementieren
3. **iOS Offline-Cache Welle 3** — `OfflinePolicyCache.swift` implementieren
4. **Testabdeckung** — Ziel: Android Unit-Tests 85%, iOS Unit-Tests 75%

---

*Stand: 2026-05-10 | Nächste Review: Nach Abschluss Welle 1*
