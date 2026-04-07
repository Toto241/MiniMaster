# QA Platform Foundation (2026-04-07)

## Ziel dieser Ausbaustufe

Diese Ausbaustufe setzt die erste priorisierte Phase der geplanten Testplattform um:

- kanonischer QA-Katalog als versionierte Basis
- standardisierte Android-10-bis-16-Matrix
- standardisierte Einzelgeraet- und Zwei-Geraete-Profile
- priorisierte Dual-Device-Szenarien
- priorisierter Automatisierungs-Backlog
- Python-Admin-API fuer den zentralen Abruf
- Integration in den bestehenden Python-Test-Runner

## Neu eingefuehrte Artefakte

### Versionierte QA-Katalogdaten

- qa/catalog/android-version-matrix.json
- qa/catalog/device-profiles.json
- qa/catalog/dual-device-scenarios.json
- qa/catalog/automation-backlog.json

### Python-Kataloglogik

- scripts/qa_catalog.py

Funktionen:

- laedt die versionierten Katalogdaten
- baut einen kanonischen QA-Katalog aus bestehenden Test-Suites und Repo-Testdateien
- exportiert den Katalog nach build/test-automation/qa-catalog.json

### Admin-API-Endpunkte

- GET /api/qa/catalog
- GET /api/qa/android-matrix
- GET /api/qa/device-profiles
- GET /api/qa/dual-device-scenarios

### Runner-Integration

Neue zentrale Suite in scripts/test_automation.py:

- qa-catalog-export

Aufruf:

- python scripts/test_automation.py --suite qa-catalog-export

## Dual-Device-Ausbau in dieser Stufe

scripts/dual_device_runner.py akzeptiert jetzt zusaetzlich:

- scenario_id
- profile_id
- fault_modes

Die Eingaben werden gegen qa/catalog/dual-device-scenarios.json validiert.

Damit ist noch keine vollstaendige Fault-Injection implementiert. Diese Stufe liefert aber die kanonische, validierte Einstiegsschnittstelle fuer spaetere Szenario-orientierte Zwei-Geraete-Laeufe.

## Priorisierte naechste Schritte

1. Dual-Device-Runs um echte Fault-Injection und Synchronisationspunkte erweitern.
2. Admin-Panel um QA-Katalog-, Matrix-, Emulator- und Szenarioansichten erweitern.
3. Bestehende Android-Instrumentation-Tests an Szenario-IDs und Testfall-IDs koppeln.
4. Artefakt-Explorer fuer fehlgeschlagene Runs und Release-Evidence integrieren.
5. AVD-Erstellung und Boot-Steuerung direkt aus dem Emulator-Manager ansteuern.

## Zusatzstand: Emulator-Management

Die nachgelagerte Ausbaustufe hat bereits begonnen:

- scripts/emulator_manager.py liefert Matrixplan, SDK-/AVD-Status und Reservierungslogik
- python_admin/app.py stellt Emulator-Endpunkte fuer Uebersicht und Reservierungen bereit
- scripts/tests/test_emulator_manager.py prueft Matrixplan und Reservierungslogik

## Validierung

Folgende Checks wurden fuer diese Ausbaustufe erfolgreich ausgefuehrt:

- python -m pytest -c scripts/pytest.ini scripts/tests/test_qa_catalog.py scripts/tests/test_app_suites.py
- python -m pytest -c scripts/pytest.ini scripts/tests/test_dual_device_runner.py scripts/tests/test_app_suites.py scripts/tests/test_qa_catalog.py
- python scripts/qa_catalog.py --json-out build/test-automation/qa-catalog.json
- python scripts/test_automation.py --suite qa-catalog-export --continue-on-fail
