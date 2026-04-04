# USB-Debug-Schnittstelle – Anleitung

## Überblick

Die Debug-Schnittstelle ermöglicht gezielte Diagnose und automatisierte USB-Tests beider MiniMaster-Apps **ohne separaten Debug-Build**. Der Zugang erfolgt ausschließlich über ein physisch per USB angeschlossenes Gerät mittels ADB und einem **Challenge-Response-Protokoll (HMAC-SHA256)**.

---

## Sicherheitskonzept

### Doppelter Schutz

| Schutzebene | Mechanismus |
|---|---|
| **Physischer Gate** | ADB erfordert USB-Verbindung + aktiviertes USB-Debugging auf dem Gerät |
| **Kryptografischer Gate** | HMAC-SHA256 Challenge-Response (einmaliger Nonce, 30-Min-Session) |

### Ablauf

```
Admin                             Android-Gerät
  │                                    │
  │──── adb broadcast GET_CHALLENGE ───▶│
  │◀─── CHALLENGE:a1b2c3… (Logcat) ────│  (einmaliger UUID-Nonce)
  │                                    │
  │  HMAC-SHA256(secret, nonce + suffix)│
  │  = token                           │
  │                                    │
  │──── adb broadcast ACTIVATE ────────▶│  (token als Extra)
  │◀─── "Session activated" (Logcat) ──│  (30-Min-Timer startet)
  │                                    │
  │  ... Tests & Diagnose ...          │
  │                                    │
  │──── adb broadcast DEACTIVATE ──────▶│  (Session sofort beendet)
```

### Sicherheitsgarantien

- **`android:exported="false"`** – kein App außer dem Gerät-eigenen ADB-Shell-User kann die Broadcasts senden
- **Einmal-Nonce** – jeder Nonce wird nach dem ersten Aktivierungsversuch ungültig (unabhängig vom Ergebnis)
- **Auto-Expire** – Session erlischt automatisch nach 30 Minuten
- **Verschiedene Secrets** – Eltern-App und Kinder-App haben getrennte HMAC-Secrets
- **Secure-by-default** – ohne konfigurierten Secret bleibt die Schnittstelle dauerhaft deaktiviert (`BuildConfig…= "DISABLED"`)

---

## Einmalige Einrichtung

### 1. Secrets generieren

```powershell
pwsh -File scripts/generate-debug-token.ps1 -GenSecret
```

Die Ausgabe zeigt zwei Beispielwerte. Generiere idealerweise **zwei verschiedene** Secrets (einmal für master, einmal für child):

```
Generated secret: 9f3a2c1d...
```

### 2. Secrets in `local.properties` eintragen

`local.properties` wird **nicht in Git committed** (steht in `.gitignore`):

```properties
debug.session.secret.master=<DEIN-MASTER-SECRET>
debug.session.secret.child=<DEIN-CHILD-SECRET>
```

### 3. Apps neu bauen

```bash
./gradlew :masterApp:assembleDebug :childApp:assembleDebug
```

Die Secrets werden via `BuildConfig.DEBUG_SESSION_SECRET_MASTER` / `…_CHILD` eingebettet.

---

## Nutzung: Manuelle Diagnose

### Eltern-App (masterApp)

```powershell
# Challenge anfordern
adb shell am broadcast -a com.minimaster.masterapp.DEBUG_GET_CHALLENGE
adb logcat -s MINIMASTER_DEBUG_CHALLENGE -d -T 1
# Ausgabe: CHALLENGE:a1b2c3d4...

# Token generieren
pwsh -File scripts/generate-debug-token.ps1 -AppId master -Challenge a1b2c3d4...

# Session aktivieren (TOKEN aus vorherigem Schritt)
adb shell am broadcast -a com.minimaster.masterapp.DEBUG_ACTIVATE -e response <TOKEN>

# App-Status abfragen
adb shell am broadcast -a com.minimaster.masterapp.DEBUG_DUMP_STATE
adb logcat -s MINIMASTER_DEBUG_STATE -d -T 1

# Session beenden
adb shell am broadcast -a com.minimaster.masterapp.DEBUG_DEACTIVATE
```

### Kinder-App (childApp)

Gleicher Ablauf mit `com.google.pairing.*`-Actions:

```powershell
adb shell am broadcast -a com.google.pairing.DEBUG_GET_CHALLENGE
adb logcat -s MINIMASTER_DEBUG_CHALLENGE_CHILD -d -T 1

pwsh -File scripts/generate-debug-token.ps1 -AppId child -Challenge <NONCE>

adb shell am broadcast -a com.google.pairing.DEBUG_ACTIVATE -e response <TOKEN>
adb shell am broadcast -a com.google.pairing.DEBUG_DUMP_STATE
adb logcat -s MINIMASTER_DEBUG_STATE_CHILD -d -T 1

adb shell am broadcast -a com.google.pairing.DEBUG_DEACTIVATE
```

---

## Nutzung: Automatisierter USB-Testlauf

### Vollständiger Testlauf (empfohlen)

```powershell
# Eltern-App
pwsh -File scripts/run-usb-tests.ps1 -AppId master

# Kinder-App
pwsh -File scripts/run-usb-tests.ps1 -AppId child

# Bestimmtes Gerät
pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial R58M12345

# Einzelnen Test ausführen
pwsh -File scripts/run-usb-tests.ps1 -AppId master `
    -TestFilter "com.minimaster.masterapp.MasterAppE2ETest"

# Vorher APK installieren (auto-detect)
pwsh -File scripts/run-usb-tests.ps1 -AppId master -InstallApk

# Vorher APK installieren (expliziter Pfad)
pwsh -File scripts/run-usb-tests.ps1 -AppId child -InstallApk -ApkPath "D:\builds\childApp-release.apk"
```

### Was der Testlauf macht

1. ADB-Gerät erkennen
2. Optional APK installieren (`-InstallApk`, optional `-ApkPath`)
3. Challenge anfordern → aus Logcat lesen
4. HMAC-Token generieren (`generate-debug-token.ps1`)
5. Debug-Session aktivieren
6. `./gradlew :<AppModule>:connectedDebugAndroidTest` ausführen
7. Debug-Session deaktivieren
8. XML-Testergebnisse parsen → **Ampelausgabe**

### Ampelausgabe

```
══════════════════════════════════════════════
  TEST-ERGEBNISSE: MASTER-APP
══════════════════════════════════════════════
  🟢  BESTANDEN
  Gesamt:       12
  Bestanden:    12
  Übersprungen: 0
══════════════════════════════════════════════
```

oder bei Fehlern:

```
══════════════════════════════════════════════
  TEST-ERGEBNISSE: CHILD-APP
══════════════════════════════════════════════
  🔴  FEHLGESCHLAGEN
  Gesamt:        5
  Fehlgeschlagen:1
  Übersprungen:  0

  Fehler:
    ✘ com.google.pairing.DeepLinkE2ETest.verifySuccessfulPairing...
      ComposeTimeoutException: ...nach 30s
══════════════════════════════════════════════
```

---

## Admin-Panel: Neue Kommandos

Im Admin-Panel → **Befehlskatalog** sind folgende Gruppen verfügbar:

| ID | Label |
|---|---|
| `debug-master-challenge` | [Debug] Eltern-App: Challenge anfordern |
| `debug-master-activate` | [Debug] Eltern-App: Session aktivieren |
| `debug-master-deactivate` | [Debug] Eltern-App: Session beenden |
| `debug-master-dump-state` | [Debug] Eltern-App: Status abfragen |
| `debug-child-challenge` | [Debug] Kinder-App: Challenge anfordern |
| `debug-child-activate` | [Debug] Kinder-App: Session aktivieren |
| `debug-child-deactivate` | [Debug] Kinder-App: Session beenden |
| `debug-child-dump-state` | [Debug] Kinder-App: Status abfragen |
| `debug-usb-run-tests-master` | [Debug] USB-Tests: Eltern-App (vollständig) |
| `debug-usb-run-tests-child` | [Debug] USB-Tests: Kinder-App (vollständig) |
| `debug-usb-run-tests-all` | [Debug] USB-Tests: Beide Apps (sequenziell) |

---

## Dump-State: Felder

### Eltern-App

```json
{
  "app": "masterApp",
  "sessionActive": true,
  "sessionRemainingMin": 28,
  "registrationState": "REGISTERED",
  "imeiLast4": "1234",
  "secretKeyLast4": "abcd",
  "legalConsentAccepted": true,
  "fcmTokenLast8": "12ab34cd"
}
```

### Kinder-App

```json
{
  "app": "childApp",
  "sessionActive": true,
  "sessionRemainingMin": 28,
  "pairingState": "PAIRED(last4:5678)",
  "isLocked": false,
  "accessibilityServiceRunning": true,
  "blockedAppsCount": 3,
  "pendingTasksCount": -1,
  "settingsAccessCount": -1,
  "lastRulesSyncEpoch": 1710000000000,
  "heartbeatLastSentEpoch": 0
}
```

> Hinweis: `pendingTasksCount` und `settingsAccessCount` sind `-1` (in-memory, nicht persistiert).

---

## Logcat-Tags Referenz

| Tag | Beschreibung |
|---|---|
| `MINIMASTER_DEBUG` | masterApp allgemeine Debug-Logs |
| `MINIMASTER_DEBUG_CHALLENGE` | masterApp HMAC-Nonce |
| `MINIMASTER_DEBUG_STATE` | masterApp JSON-Status-Dump |
| `MINIMASTER_DEBUG_CHILD` | childApp allgemeine Debug-Logs |
| `MINIMASTER_DEBUG_CHALLENGE_CHILD` | childApp HMAC-Nonce |
| `MINIMASTER_DEBUG_STATE_CHILD` | childApp JSON-Status-Dump |

---

## Fehlerbehebung

### „Debug interface is DISABLED"

→ `local.properties` Eintrag fehlt. Secret generieren und eintragen, dann neu bauen.

### „no pending challenge"

→ Zuerst `DEBUG_GET_CHALLENGE` senden, dann den Challenge-Wert aus Logcat lesen, Token generieren und **danach** `DEBUG_ACTIVATE` senden.

### „invalid response token"

→ Challenge ist veraltet (Nonce wurde nach erstem Versuch ungültig) oder Secret passt nicht zur App. Neuen Challenge-Zyklus starten.

### „Session activated" erscheint nicht im Logcat

→ App im Vordergrund öffnen, damit der BroadcastReceiver aktiv ist.

### Kein ADB-Gerät gefunden

→ `adb devices` prüfen. USB-Debugging im Entwicklermenü aktivieren. Bei Emulator: `adb connect localhost:5554`.

### `INSTALL_FAILED_USER_RESTRICTED`

→ Das ist in der Regel **kein Repo- oder Runner-Fehler**, sondern ein Geräte- oder Policy-Blocker beim Paketinstaller.

Prüfschritte auf dem Android-Gerät:

- Gerät vollständig entsperren und Display aktiv lassen
- RSA-Abfrage für USB-Debugging mit "Immer zulassen" bestätigen
- In den Entwickleroptionen nach "Install via USB" / "USB-Installation" suchen und aktivieren
- Falls eine Geräteverwaltungs-, Familien- oder Enterprise-Policy APK-Installationen blockiert, diese für den Testlauf temporär freigeben

Manueller Gegencheck per ADB:

```powershell
adb install -r masterApp/build/outputs/apk/debug/masterApp-debug.apk
adb install -r childApp/build/outputs/apk/debug/childApp-debug.apk
```

Wenn schon der manuelle `adb install` mit `INSTALL_FAILED_USER_RESTRICTED` scheitert, ist der USB-Commissioning-Runner nicht die Ursache. Erst nach erfolgreichem manuellen Install lohnt sich ein erneuter Testlauf.

---

## Sicherheitshinweise

- **Secrets niemals committen** – `local.properties` steht in `.gitignore`
- **USB-Debugging nach Tests deaktivieren** auf Produktionsgeräten
- **Secrets rotieren** nach einem Geräteverlust oder bei Verdacht auf Kompromittierung
- Die Debug-Schnittstelle ist **kein Ersatz für Profiling** (z.B. Android Studio Profiler, Firebase Crashlytics)
