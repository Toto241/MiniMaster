# Admin-Panel QA Automation Audit

Stand: 2026-04-24

Dieses Dokument legt verbindlich fest, wie der bestehende Admin-Panel-Reiter **Qualitätssicherung** weiterentwickelt wird. Das Admin-Panel wird **nicht ersetzt** und es werden **keine Demo-Endpunkte** eingefuehrt.

## 1. Ziel

Der QA-Reiter soll die zentrale Oberflaeche fuer automatisierte Qualitaetssicherung, Emulator-/Device-Tests, Evidence-Erfassung und Release-Gates sein.

Prioritaet:

1. Alte oder nicht mehr nutzbare UI-Funktionen erkennen und entfernen.
2. Vorhandene Test-Suites vollstaendig sichtbar machen.
3. Manuelle Tests systematisch in automatisierte Suites ueberfuehren.
4. Externe Gates klar von automatisch ausfuehrbaren Tests trennen.
5. Keine parallele Admin-UI und keine Platzhalter-API-Routen.

## 2. Neuer Audit-Befehl

```bash
npm run analyze:admin-qa
npm run analyze:admin-qa:gate
```

Der Befehl erzeugt:

```text
build/admin-panel-qa-audit/latest-summary.json
build/admin-panel-qa-audit/latest-report.md
```

Der Gate-Modus schlaegt fehl, wenn P1-Findings offen sind.

## 3. Was automatisch geprueft wird

`scripts/admin_panel_qa_audit.py` prueft:

| Pruefung | Zweck |
|---|---|
| QA-Tab sichtbar | Der bestehende QA-Reiter muss als Operator-Oberflaeche vorhanden bleiben. |
| data-action-Werte | Tote Buttons oder verwaiste Aktionen werden erkannt. |
| Handler-Funktionen | UI-Aktionen muessen echte Handler oder registrierte Dispatcher besitzen. |
| Suite-Gruppen | Backend, Android, Device, Python und Release muessen in `scripts/test_automation.py` vorhanden sein. |
| Emulator-/Device-Suites | Connected-, E2E- und USB-Suites muessen als automatisierbare Kandidaten erkannt werden. |
| QA-Sichtbarkeit | Suites, die im QA-Kontext nicht sichtbar sind, werden als Review-Finding ausgegeben. |
| Manuell zu automatisiert | Manuelle Tests werden auf konkrete Ziel-Suites gemappt. |
| Externe Gates | Billing, Play Console, Firebase Console, On-call und Deploy duerfen nicht als automatisch bestanden erscheinen. |
| QA-Katalog-Metadaten | Katalogeintraege sollen Automatisierungsart und Umgebungsbedarf enthalten. |

## 4. Manuelle Tests, die weiter automatisiert werden sollen

| Bisher manueller Test | Ziel-Suite | Ziel-Automatisierung | Umgebung |
|---|---|---|---|
| Eltern-App startet und zeigt Hauptoberflaeche | `android-connected-master` | Single-Emulator/Device | ADB + Emulator/Testgeraet |
| Kind-App startet und zeigt Pairing-Flow | `android-connected-child` | Single-Emulator/Device | ADB + Emulator/Testgeraet |
| Eltern-/Kind-Kopplung ueber zwei Geraete | `python-tests-dual-device-runner` | Dual-Emulator | Zwei ADB-Targets oder Dual-AVD |
| Sperre aktivieren/deaktivieren und synchronisieren | `android-e2e-shell` | Dual-Emulator oder Device | ADB + Firebase-Testkonfiguration |
| App-Blacklist/Usage Rules pruefen | `android-e2e-shell-script` | Dual-Emulator oder Device | ADB + Debug-Secrets + Test-Apps |
| Offline/Wiederanlauf nach Force-Stop/Reboot | `android-usb-child` | Device/Emulator mit Shell-Kontrolle | ADB shell + Netzwerkumschaltung |

## 5. Soll-Struktur des QA-Reiters

Der bestehende QA-Reiter soll seine Inhalte in diese Kategorien strukturieren:

1. **Host-Tests**
   - Backend Build
   - Lint
   - Jest
   - Firestore Rules Structural
   - Static Readiness

2. **Android Host-Tests**
   - Android Lint
   - Master Unit Tests
   - Child Unit Tests
   - Instrumentation Build Master/Child

3. **Single-Emulator/Device-Tests**
   - `android-connected-master`
   - `android-connected-child`

4. **Dual-Emulator-/Cross-App-Tests**
   - Pairing
   - Lock/Unlock
   - Sync
   - Usage Rules
   - Task Workflow

5. **Python-Orchestrierungs- und Tooling-Tests**
   - ADB Client
   - Emulator Manager
   - Dual Device Runner
   - USB Runner
   - QA Catalog

6. **Release-Gates**
   - Release Revalidation
   - Evidence Export
   - Fertigungsstandsanalyse
   - Admin-QA-Audit

7. **Externe Gates**
   - GitHub Billing / Spending Limit
   - CodeQL Green Run
   - Android CI Green Run
   - Firebase Key Rotation
   - Play Console Data Safety / IARC / Permissions
   - Physische Commissioning-Freigabe
   - On-call/Reachability
   - Final Deploy Evidence

## 6. Entfernen alter Funktionen

Eine UI-Funktion darf entfernt werden, wenn mindestens eine Bedingung erfuellt ist:

- Es gibt keinen Backend-Endpunkt und keine lokale Suite mehr.
- Der `data-action`-Wert hat keinen Handler und keine geplante Suite-Zuordnung.
- Der Button zeigt auf einen frueheren manuellen Prozess, der durch eine automatisierte Suite ersetzt wurde.
- Die Funktion ist doppelt in Setup/QA/Commissioning vorhanden und der QA-Reiter ist die kanonische Oberflaeche.

Eine UI-Funktion darf **nicht** entfernt werden, wenn sie ein externes Gate dokumentiert. Dann muss sie als extern/blockiert/evidence-required angezeigt werden.

## 7. Definition of Done

Eine QA-/Admin-Panel-Aenderung ist erst abgeschlossen, wenn:

1. `npm run analyze:admin-qa` ohne unerwartete neue Findings laeuft.
2. Alle neuen automatisierbaren Tests einer Suite-ID zugeordnet sind.
3. Manuelle Resttests einen Owner, eine Umgebung und ein Evidence-Ziel besitzen.
4. Externe Gates nicht als automatisiert bestanden angezeigt werden.
5. Tote Buttons und verwaiste `data-action`-Werte entfernt oder angebunden sind.
6. Der QA-Reiter keine Demo-Endpunkte oder Platzhalter-APIs enthaelt.
7. Dokumentation, QA-Katalog und Release Evidence denselben Stand abbilden.

## 8. Naechste Umsetzung nach diesem Patch

Dieser Patch fuehrt bewusst zuerst die Audit- und Gate-Struktur ein. Der naechste Code-Patch sollte auf Basis von `build/admin-panel-qa-audit/latest-report.md` gezielt:

1. konkrete tote Buttons entfernen,
2. fehlende Suite-Karten im QA-Reiter ergaenzen,
3. Katalogeintraege mit `automationType`, `environmentRequirement`, `evidenceTarget` und `migrationPriority` erweitern,
4. Jest-Tests fuer die QA-Register-Darstellung ergaenzen,
5. Dual-Emulator-Suites im QA-Reiter sichtbar machen.
