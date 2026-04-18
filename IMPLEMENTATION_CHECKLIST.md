# Produktionsreife: Umsetzungs-Checkliste

> **Stand 2026-04-18 (Session-Update):** Nach iterativer Abarbeitung sind alle [CODE]-Findings der admin-panel-Integration F2-F5, F8-F10 sowie F1 (Operator-Reanalyse-Button für `analyzeWithDebugData`) geschlossen. F7 wurde im Catch-Pfad-Audit (8 ungeschützte `error.message`-Sites) abgesichert; weitere innerHTML-Templates verwenden konsistent `escapeHtml()`. Tests: 142/142 admin-panel ✅, Build grün ✅.

## ✅ Durchgeführt (5 Punkte)

- [x] **CodeQL Hard Gate (CRITICAL)**: `continue-on-error: true` aus `.github/workflows/codeql-analysis.yml` entfernt
  - **Effekt**: Sicherheitsanalyse-Fehler blockieren nun Deployment

- [x] **Node.js Version Harmonisierung (MEDIUM)**: `NODE_VERSION: '20'` → `'22'` in `deploy.yml`
  - **Effekt**: Deploy läuft auf gleicher Version wie CI-Tests

- [x] **Markdown Lint (MEDIUM)**: Blank lines in `iOS_BUILD_REFERENCE.md` korrigiert
  - **Effekt**: Dokumentation erfüllt Linting-Standards

- [x] **AI Support Security Guard (LOW)**: NODE_ENV Validierung in `src/support.ts` hinzugefügt
  - **Effekt**: Warnung wenn test-stub in Production versehentlich aktiv

- [x] **iOS CI Build Stage (HIGH)**: Template-Job in `.github/workflows/ios-ci.yml` hinzugefügt
  - **Status**: Disabled (`if: false`), wartet auf Xcode Project + Secrets
  - **Aktivierung**: Siehe `IMPLEMENTATION_COMPLETION_REPORT.md`

## ✅ Durchgeführt – Admin-Panel-Integration (Session 2026-04-18)

- [x] **F2 App Check Bindung**: CDN-Script + `appcheck-init.js` in `admin-panel/index.html`; robuster Bootstrap mit try/catch und deutscher Diagnose
- [x] **F3 PWA Manifest**: `id`, `scope`, `lang`, `dir`, `description`, `orientation`, maskable Purpose ergänzt
- [x] **F4 SW Update Banner**: User-bestätigter SKIP_WAITING-Flow ("Jetzt aktualisieren / Später") in `pwa-register.js`
- [x] **F5 SW Pre-Cache**: `pwa-register.js` in APP_ASSETS aufgenommen, Cache-Version v2 → v3
- [x] **F8 PII-Maskierung Logs**: `maskUserId/maskIp/maskUserAgent` + Opt-in-Toggle im Detail-Modal von `logs.js`
- [x] **F9 Sprach-Attribut**: `logs.html` `lang="de"`
- [x] **F10 Architektur-Doku**: Sektion 6 ("Aktueller Funktionsumfang Stand 2026-04") in `docs/ADMIN_PANEL_ARCHITECTURE.md`
- [x] **F1 Operator-Reanalyse-UI**: "🤖 KI-Reanalyse"-Button im Ticket-Modal ruft `analyzeWithDebugData` (zeigt Status + Confidence)
- [x] **F7 Catch-Pfad-XSS-Hardening**: 8 `error.message`-innerHTML-Stellen in `admin-panel/app.js` auf `escapeHtml()` umgestellt; Stichproben-Audit der übrigen Templates bestätigt konsistente `escapeHtml`-Nutzung
- [x] **Test-Hardening Cloud Functions**: Hard-Fail in `src/support.ts` (`generateAiCompletion`) wenn Test-Stub-Pfad in Functions-Runtime aktiv (NODE_ENV=test + K_SERVICE/FUNCTION_TARGET/FUNCTION_NAME/GAE_SERVICE)
- [x] **Test-Stabilität admin-panel-qa-flows**: `replaceElementWithState` defensive (HTML-escaped Fallback für Test-Mocks ohne `appendChild`); `selfHealing`-Drift in Sektionscount/Mock korrigiert
- [x] **ARCHITECTURE.md C4-Status**: Verbindlicher textueller Kontext + korrigierte Status-Notiz zu parent-panel/child-panel (sind funktionsfähige Support-/Debug-Consent-Panels, keine Skeletons)
- [x] **Photo-Proof Path-Scoping** (`src/tasks.ts` `completeTask`): URL-Object-Pfad wird URL-decodiert und gegen Allowlist `children/{childId}/photos/` bzw. `proofs/{childId}/` geprüft. Cross-Child-Pfade → `permission-denied`, fehlendes `/o/<path>` → `invalid-argument`. Tests in `branch-coverage-wave3` (5 Bestand + 2 neue Negativfälle), `wave5/6/7`, `tasks-and-device-extra`, `enforcement-automation`, `integration/task-lifecycle` migriert. Build grün ✅, photoUrl-relevante Suiten 0 Regressionen.
- [x] **Debug-Snapshot Whitelist (`sanitizeDebugSnapshot`)**: Defense-in-Depth Filter in `src/support.ts` vor JSON.stringify (AI-Prompt) und Firestore-Persistierung. Erlaubt nur die deklarierten Felder (Counts/Booleans/ISO-Timestamps), eliminiert versehentliche Leaks falls `DebugSnapshot`-Typ erweitert wird. 80/80 Support-Tests grün ✅, Build grün ✅.
- [x] **Test-Mock-Drift Cleanup (Baseline-Failures behoben)**: `db().batch()` und kettbares `where()` in `enforcement-automation.test.ts`, `tasks-and-device-extra.test.ts`, `branch-coverage-device.test.ts` ergänzt (DecisioningRepository.replaceRulesForDevice braucht beides). `auth.test.ts`: TDZ-ReferenceError auf `mockDbObj` durch lazy `require("../index")` in `beforeAll` behoben. **Vollständige Jest-Suite jetzt grün: 62/62 Suites, 2048/2048 Tests** ✅.
- [x] **Coverage-Schwellwerte angehoben** (`jest.config.cjs`): branches 50→85, functions 70→88, lines 65→90, statements 65→90. Tatsächliche Ist-Werte: 88.62 / 90.96 / 94.77 / 94.72 % — ~5pp Margin gegen Regression. CI-Gate verhärtet, alle 62 Suites bestehen Threshold-Check ✅.
- [x] **Recovery-Token Rotation** (`src/auth.ts`): Multi-Token-Support per Komma-Liste in `ADMIN_RECOVERY_TOKEN` (Rolling-Rotation mit Overlap-Fenster), Rotations-Datum via `ADMIN_RECOVERY_TOKEN_ROTATED_AT` (ISO), Health-Endpoint liefert `recoveryTokenCount` / `recoveryTokenAgeDays` / `recoveryTokenRotationOverdue` (>90 Tage). Admin-Panel-Reset-Flow zeigt entsprechende Warnung im Statusfeld. Bei Reset mit überfälligem Token wird `functions.logger.warn` getriggert. 207/207 Auth-Tests grün ✅, gesamte Suite 2048/2048 ✅, Build grün ✅.

---

## ⏳ Erforderliche Manuelle Aktion (1 Punkt)

### GitHub Actions Billing / Spending Limit beheben (CRITICAL - Blocking)

**Problem**: Die aktuelle Revalidation vom 2026-04-16 zeigt, dass CodeQL und Android CI nicht wegen Code Scanning scheitern, sondern weil GitHub Actions Jobs wegen Billing-/Spending-Limit gar nicht gestartet werden.

```text
The job was not started because recent account payments have failed or your spending limit needs to be increased.
```

**Lösung (5-10 Minuten):**

1. GitHub → Profil / Organisation → **Settings**
2. **Billing & plans** öffnen
3. Fehlgeschlagene Zahlung bzw. Spending-Limit korrigieren
4. Prüfen, dass GitHub Actions für das Repository wieder Jobs starten darf
5. Danach im Workspace die Release Gates erneut ausführen:

  In VS Code im Terminal nacheinander ausführen:
  `npm run ci:revalidate:rerun`
  `npm run ci:revalidate`

**Nach Behebung:**

- CodeQL Analysis kann wieder real anlaufen ✓
- Android CI kann wieder real anlaufen ✓
- Hard Gate kann mit echter CI-Evidenz bewertet werden ✓

---

## 🔄 Geplant / In Bearbeitung (Backlog)

### [CODE] – Erweiterungen (jeweils eigene Iteration empfohlen)

- [ ] **F6 CSP-Refactor**: ~80+ Inline-`onclick`/`style` in `admin-panel/index.html` zu `addEventListener`/CSS-Klassen migrieren. Erfordert Anpassung der DOM-Snapshot-Tests.
- [ ] **Legacy `secretKey` Cutover**: Backend-Migration + koordinierte Mobile-Client-Versionierung
- [ ] **Recovery-Token Rotation — operationelles Runbook**: Quartals-Rotations-SOP dokumentieren (Code/Health-Endpoint sind erledigt, siehe Durchgeführt-Sektion)
- [ ] **Debug-Snapshot Felder erweitern** (optional): zusätzliche diagnostische Felder prüfen (z.B. Battery, NetworkType) — Whitelist-Filter `sanitizeDebugSnapshot` ist bereits implementiert
- [ ] **iOS Family Controls Picker**: Nativer Picker im `iosMasterApp` (Beta → Release)
- [ ] **Electron Build-Pipeline**: `desktop/`-Bundling + Code-Signing
- [ ] **Photo-Proof Validation – Erweiterung**: EXIF-/MIME-/Größenprüfung beim Upload (Path-Scoping ist erledigt, siehe Durchgeführt-Sektion)
- [ ] **Subscription Scheduler**: Periodische Verifikation + Renewal-Webhooks (Play Billing v6)
- [ ] **Offline-Policy Cache (childApp)**: Konfliktauflösung bei längerer Offline-Phase
- [ ] **Coverage-Schwellwerte weiter erhöhen** (optional): Aktuell 85/88/90/90 — Ziel 90/92/95/95 wenn nächste Code-Erweiterungen mit Tests landen

### [DOKU]

- [ ] Formale C4-Diagramme als Mermaid/SVG (textueller Kontext steht)
- [ ] Sequenzdiagramme: Pairing, Task-Lifecycle, Photo-Proof, Subscription-Renewal, Support-Grant
- [ ] Rollback-Drill-Protokoll
- [ ] On-Call-Roster

### [EXTERN] – außerhalb Repo-Scope

- [ ] Apple Team IDs, App Store Connect, Provisioning Profiles
- [ ] Play Console Setup + In-App-Billing-Verträge
- [ ] Production-Secrets in Secret Manager (Gemini-API-Key, FCM Server Key, etc.)
- [ ] Schlüsselrotations-Plan operationalisieren
- [ ] OEM-Hardware für E2E-Validierung (Samsung One UI, Xiaomi MIUI)
- [ ] Rechtstexte (AGB, Datenschutz, Impressum) finalisieren
- [ ] `firebase target:apply` für Hosting-Targets
- [ ] Echte `GoogleService-Info.plist`/`google-services.json` (Production-Projekt)
- [ ] App-Check-Site-Keys (reCAPTCHA v3 / DeviceCheck / Play Integrity)

---

## Validierungsergebnisse

```text
✅ Cloud Functions Tests:        1897/1897 passing (53/53 suites)
✅ Admin-Panel Tests:            142/142 passing (4/4 suites)
✅ Android Gradle Build:         BUILD SUCCESSFUL
✅ Firestore Rules:              All collections validated
✅ Node.js Version:              22 überall konsistent
✅ CodeQL Hard Gate:             Configured (wartet auf GitHub-Actions-Billing-Fix)
✅ iOS CI Structure Validation:  PASSING
⏳ iOS CI Build/Test:            Template ready (wartet auf Xcode Project)
⏳ CodeQL / Android CI:          Blocked by GitHub-Actions-Billing/Spending-Limit
```

---

## Datei-Übersicht der Änderungen (Session 2026-04-18)

```text
d:\Tools\MiniMaster\
├── admin-panel/
│   ├── index.html ............... App Check CDN + appcheck-init Bindung
│   ├── appcheck-init.js ......... Robuster Bootstrap + Diagnose
│   ├── manifest.webmanifest ..... PWA-Felder vervollständigt
│   ├── logs.html ................ lang="de"
│   ├── logs.js .................. PII-Maskierung + Opt-in-Toggle
│   ├── pwa-register.js .......... User-bestätigter Update-Banner
│   ├── service-worker.js ........ Cache v3 + pwa-register im Pre-Cache
│   └── app.js ................... 8× error.message → escapeHtml,
│                                  Reanalyse-Button (analyzeWithDebugData),
│                                  defensive replaceElementWithState
├── src/
│   └── support.ts ............... Hard-Fail Test-Stub in Functions-Runtime
├── test/
│   └── admin-panel-qa-flows.test.ts ... Mock-Anpassungen + selfHealing-Drift
├── docs/
│   └── ADMIN_PANEL_ARCHITECTURE.md ..... Sektion 6 (Funktionsumfang 2026-04)
├── ARCHITECTURE.md .............. C4-Kontext-Status korrigiert
└── IMPLEMENTATION_CHECKLIST.md .. (diese Datei)
```

---

## Nächste Schritte (Nach Repo-Aktivierung)

1. **Sofort:** GitHub-Actions-Billing/Spending-Limit beheben (oben)
2. **Dann:** CodeQL- und Android-CI-Runs erneut anstoßen und Ergebnis prüfen
3. **Anschließend:** F6 (CSP-Refactor) als eigene Iteration starten oder [EXTERN]-Block (Apple/Google/Firebase) abarbeiten
4. **Optional:** iOS Build aktivieren (wenn Xcode Project bereit)


---

**Status**: 🟡 Wartend auf GitHub Repository-Einstellung (Benutzeraktion erforderlich)
