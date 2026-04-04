# Automated Commissioning Test Runner

Dieses Setup automatisiert die commissioning-relevanten Android-Tests auf zwei physischen Geraeten
(Eltern-App + Kinder-App) unter Nutzung der abgesicherten Debug-Schnittstelle.

## Voraussetzungen

- Zwei per USB angeschlossene Android-Geraete
- USB-Debugging auf beiden Geraeten aktiviert
- `adb` im PATH
- Debug-Session-Secrets in `local.properties`:
  - `debug.session.secret.master`
  - `debug.session.secret.child`

## Enthaltene Suites

### Master (`commissioning`)

- `com.minimaster.masterapp.MasterAppE2ETest`
- `com.minimaster.masterapp.CommissioningMasterPhase1UiTest`
- `com.minimaster.masterapp.CommissioningMasterUiFlowTest`

### Child (`commissioning`)

- `com.google.pairing.PairingScreenUITest`
- `com.google.pairing.DeepLinkE2ETest`
- `com.google.pairing.CommissioningChildUiFlowTest`

## Ausfuehrung

### Einzel-App

```powershell
pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial <MASTER_SERIAL> -Suite commissioning
pwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial <CHILD_SERIAL> -Suite commissioning
```

### Einzel-App mit APK-Installation

```powershell
# Neueste APK im jeweiligen Modul automatisch finden und installieren
pwsh -File scripts/run-usb-tests.ps1 -AppId master -AdbSerial <MASTER_SERIAL> -Suite commissioning -InstallApk

# Explizite APK-Datei installieren
pwsh -File scripts/run-usb-tests.ps1 -AppId child -AdbSerial <CHILD_SERIAL> -Suite commissioning -InstallApk -ApkPath "D:\builds\childApp-release.apk"
```

### Duales Commissioning (empfohlen)

```powershell
pwsh -File scripts/run-dual-device-commissioning.ps1 -MasterSerial <MASTER_SERIAL> -ChildSerial <CHILD_SERIAL>
```

### Duales Commissioning mit APK-Installation

```powershell
# Auto-APK-Erkennung je Modul
pwsh -File scripts/run-dual-device-commissioning.ps1 -MasterSerial <MASTER_SERIAL> -ChildSerial <CHILD_SERIAL> -InstallApk

# Explizite APK-Pfade + sauberes Reinstall
pwsh -File scripts/run-dual-device-commissioning.ps1 \
  -MasterSerial <MASTER_SERIAL> \
  -ChildSerial <CHILD_SERIAL> \
  -InstallApk -UninstallFirst \
  -MasterApkPath "D:\builds\masterApp-release.apk" \
  -ChildApkPath "D:\builds\childApp-release.apk"
```

## Mapping zur PHYSICAL_COMMISSIONING_CHECKLIST

- Phase 1.1: Master first-launch consent/registration gate checks
- Phase 1.2: Pairing-link generation UI states (idle/loading/success/error)
- Phase 1.3: Pairing UI and deep-link handshake smoke tests
- Phase 2.1: Task creation form and submit interaction
- Phase 2.2: Child task completion action path
- Phase 2.3: Parent approval action path
- Phase 3.1: Rule/control entry points on parent dashboard card
- Phase 3.2: Child task-lock proof submission state
- Phase 3.3: Parent lock toggle + child waiting/lock states

Hinweis: Die automatisierte Suite deckt reproduzierbare UI- und Kontrollpfade ab. Fuer die finale
Abnahme auf echten Geraeten bleiben weiterhin manuelle Endabnahmen nach Checkliste empfohlen.

## Fehlerbild: INSTALL_FAILED_USER_RESTRICTED

Wenn ein USB-Lauf beim APK-Install mit `INSTALL_FAILED_USER_RESTRICTED` abbricht, liegt der Blocker typischerweise auf dem Geraet und nicht im Repo:

- Geraet entsperren und Display waehrend des Laufs aktiv lassen
- USB-Debugging bestaetigen und die RSA-Freigabe dauerhaft erlauben
- In den Entwickleroptionen `Install via USB` / `USB-Installation` aktivieren, falls der Hersteller das getrennt absichert
- Geraete- oder Familienrichtlinien pruefen, die seitliches Installieren blockieren

Schneller Gegencheck:

```powershell
adb install -r masterApp/build/outputs/apk/debug/masterApp-debug.apk
adb install -r childApp/build/outputs/apk/debug/childApp-debug.apk
```

Scheitert bereits dieser manuelle Install mit demselben Fehler, sollte zuerst die Geraetekonfiguration behoben werden. Der Runner selbst kann diesen Blocker nicht umgehen.
