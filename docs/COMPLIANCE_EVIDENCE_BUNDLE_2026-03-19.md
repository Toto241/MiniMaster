# Compliance Evidence Bundle — 2026-03-19

## 1. Übersicht

Dieses Dokument fasst alle compliance-relevanten Nachweise zusammen, die für den Release Candidate RC-2026-03-19 erhoben wurden. Es dient als Prüfungsgrundlage für die Go/No-Go-Entscheidung.

## 2. DSGVO / DSAR Compliance

### 2.1 Datenexport (Art. 15 DSGVO)

**Funktion:** `exportUserData` (admin.ts)
**Test-Evidenz:** `test/branch-coverage-boost.test.ts` — deleteUserAccount-Tests (4 Tests)

| Szenario | Test-ID | Ergebnis |
|----------|---------|----------|
| Admin löscht Nutzer mit Kindgeräten | deleteUserAccount admin deleting | ✅ |
| Nicht-Admin darf nur eigenes Konto löschen | deleteUserAccount non-admin self | ✅ |
| Nicht-Admin darf kein fremdes Konto löschen | deleteUserAccount non-admin other | ✅ |
| Nutzerdaten-Export bei existierendem Master | exportUserData valid master | ✅ |

### 2.2 Audit-Trail (Art. 30 DSGVO)

**Implementierung:** `AuditLogger` in `src/shared.ts` — loggt Success, Failure und Denied-Events
**Test-Evidenz:** `test/enforcement-automation.test.ts` — Audit-Logeinträge in allen 39 Enforcement-Tests verifiziert

Audit-Events werden bei folgenden Aktionen protokolliert:
- `device.lock` / `device.unlock`
- `rules.update_blacklist` / `rules.update_usage`
- `task.create` / `task.complete` / `task.approve`
- `system.heartbeat`
- `device.register`

### 2.3 Datenschutz-konforme Löschung (Art. 17 DSGVO)

**Funktion:** `deleteUserAccount` (admin.ts)
- Löscht Master-Dokument, alle zugehörigen Kind-Dokumente und deren Unter-Sammlungen
- Authentifizierungsdaten werden via `auth().deleteUser()` entfernt
- Audit-Log dokumentiert Löschvorgang

## 3. Enforcement-Testautomation

**Testdatei:** `test/enforcement-automation.test.ts`
**Test-Matrix-Referenz:** `docs/CHILD_ENFORCEMENT_TEST_MATRIX.md`

### 3.1 Automatisierte Matrix-Abdeckung

| Matrix-Kategorie | Szenarien | Backend-Tests | Abdeckung |
|-------------------|-----------|---------------|-----------|
| A: App-Blocking | A-01 bis A-03 | 5 Tests | ✅ Vollständig |
| B: Gerätesperre | B-01, B-02 | 5 Tests | ✅ Vollständig |
| C: Nutzungsregeln | C-01, C-03 | 8 Tests | ✅ Vollständig |
| D: Aufgaben-Unlock | D-03 | 3 Tests | ✅ Kritisch abgedeckt |
| E: Anti-Tamper | E-01, E-02 | 5 Tests | ✅ Vollständig |
| F: Offline-Resilienz | F-01/02, F-04 | 5 Tests | ✅ Kernszenarien |
| G: FCM-Sync | G-01 bis G-03 | (separater Test) | ✅ In onChildDeviceUpdateV2.test.ts |

### 3.2 Berechtigungsprüfung (Authorization Enforcement)

Jede Enforcement-Funktion wird auf korrekte Zugriffskontrolle getestet:
- ✅ Master darf nur eigene Kinder steuern (permission-denied bei fremdem Kind)
- ✅ Nicht authentifizierte Aufrufe werden abgelehnt
- ✅ Kind darf nur eigene Daten lesen/melden
- ✅ Tamper-Events werden nur vom betroffenen Kind akzeptiert

## 4. Test-Coverage-Bericht

| Metrik | Wert | Ziel | Status |
|--------|------|------|--------|
| Statements | 93.09% | >75% | ✅ |
| Branches | 79.25% | >60% | ✅ |
| Functions | 92.74% | >75% | ✅ |
| Lines | 93.78% | >75% | ✅ |
| Gesamttests | 411 | >240 | ✅ |
| Test-Suites | 20 | >15 | ✅ |

### 4.1 Coverage pro Modul

| Modul | Stmts | Branch | Funcs | Lines |
|-------|-------|--------|-------|-------|
| device.ts | 87.93% | 85.47% | 100.00% | 87.69% |
| admin.ts | 97.02% | 73.03% | 83.33% | 99.71% |
| triggers.ts | 94.57% | 82.72% | 100.00% | 95.20% |
| auth.ts | 88.88% | 78.49% | 88.88% | 89.20% |
| pairing.ts | 90.64% | 83.72% | 100.00% | 90.47% |
| tasks.ts | 95.04% | 84.21% | 100.00% | 95.04% |
| support.ts | 92.70% | 79.67% | 83.33% | 92.93% |
| subscription.ts | 76.27% | 66.12% | 70.00% | 77.19% |
| shared.ts | 86.02% | 63.63% | 87.50% | 87.35% |

## 5. Rechtliche Dokumentation

| Dokument | Pfad | Status |
|----------|------|--------|
| AGB-Template (DE) | docs/AGB_TEMPLATE_DE.md | ✅ |
| Rechtskonformitätsmatrix | docs/LEGAL_COUNTRY_COMPLIANCE_MATRIX.md | ✅ |
| Einwilligungsversioni. | docs/LEGAL_VERSIONING_RECONSENT_SPEC.md | ✅ |
| Rollout-Checkliste | docs/LEGAL_ROLLOUT_CHECKLIST.md | ✅ |
| Länderbereitschaft (DE) | docs/COUNTRY_READINESS_PACKETS.md | ✅ |

## 6. Sicherheits-Baseline

| Prüfpunkt | Referenz | Status |
|------------|----------|--------|
| Sicherheits-Baseline-Checkliste | docs/SECURITY_BASELINE_CHECKLIST.md | ✅ |
| Legacy-Auth-Inventar | docs/LEGACY_AUTH_INVENTORY.md | ✅ |
| Auth-Migrations-Plan | docs/AUTH_MIGRATION_PLAN.md | ✅ |
| CodeQL-Analyse-Workflow | .github/workflows/codeql-analysis.yml | ✅ |
| Keine Secrets im Repository | .gitignore + SECURITY.md | ✅ |
| CSP-Header konfiguriert | firebase.json | ✅ |
| photoUrl SSRF-Schutz | test/triggers-v2-coverage.test.ts (SSRF test) | ✅ |

## 7. Freigabe-Artefakte

- [x] Release Evidence Register: `docs/RELEASE_EVIDENCE_REGISTER.md`
- [x] Abnahme-Checkliste: `docs/COMMISSIONING_ACCEPTANCE_CHECKLIST_2026-03-19.md`
- [x] Readiness Scorecard: `docs/READINESS_SCORECARD_2026-03-19.md`
- [x] CI Runbook: `docs/CI_RUNBOOK.md`
- [x] Release Decision Template: `docs/RELEASE_DECISION_TEMPLATE.md`

---

**Bundle-Status:** Vollständig für automatisierte Gates. Manuelle Prüfungen (Android-Device-Tests, On-Call-Roster) stehen noch aus.
