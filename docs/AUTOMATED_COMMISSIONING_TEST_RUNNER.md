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

### Duales Commissioning (empfohlen)

```powershell
pwsh -File scripts/run-dual-device-commissioning.ps1 -MasterSerial <MASTER_SERIAL> -ChildSerial <CHILD_SERIAL>
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
