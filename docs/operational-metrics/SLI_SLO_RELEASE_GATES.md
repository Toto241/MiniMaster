# Betriebsmetriken, SLIs/SLOs & Release-Gates (AP-N6)

> **Status:** Draft v0.1 — operationalisierungsreif
> **Scope:** Cloud Functions, Admin-Panel, Mobile Clients, Infrastruktur

---

## 1. Service Level Indicators (SLIs)

### 1.1 Availability

| SLI | Messung | Quelle |
|-----|---------|--------|
| **Cloud Functions Uptime** | Prozent der Zeit, in der keine `functions.https.onCall`-Handler mit `internal`-Fehler antworten | Firebase Functions Logs |
| **Admin-Panel Erreichbarkeit** | HTTP 200-Rate auf Hosting-URLs | Firebase Hosting Monitoring |
| **Firestore-Lese-Latenz p99** | 99. Perzentil der `get()`-Operationen | Cloud Monitoring |

### 1.2 Latenz

| SLI | Messung | Quelle |
|-----|---------|--------|
| **API-Antwortzeit p95** | 95. Perzentil der Callable-Function-Antwortzeiten | Functions Logs (`executionId` + Dauer) |
| **Task-Erstellung E2E** | Zeit von `createTask`-Aufruf bis Child-Notifikation | Firestore-Trigger-Timestamp-Differenz |
| **Photo-Proof-Validierung** | Zeit von Upload bis `completeTask`-Antwort | `completeTask` Log-Dauer |
| **Admin-Panel Ladezeit** | Time-to-Interactive (TTI) | Lighthouse CI |

### 1.3 Fehlerrate

| SLI | Messung | Quelle |
|-----|---------|--------|
| **5xx-Rate Cloud Functions** | Anteil der Aufrufe mit `HttpsError` code `internal`/`unknown` | Functions Error Reporting |
| **Auth-Fehlerrate** | Fehlgeschlagene `generateCustomToken` / `createMasterWebBootstrapToken` | Auth-Function Logs |
| **Rate-Limit-Triggers** | Anzahl der `rate-limit`-Aktionen pro Stunde | `checkRateLimit`-Audit-Logs |
| **Client-Crash-Rate** | Abstürze pro Session (Android/iOS) | Firebase Crashlytics |

### 1.4 Durchsatz

| SLI | Messung | Quelle |
|-----|---------|--------|
| **Heartbeat-Durchsatz** | Heartbeats pro Minute (Child-Geräte) | Firestore `childStatus`-Write-Rate |
| **RTDN-Verarbeitung** | Pub/Sub-Nachrichten pro Minute | `onPlayBillingNotification` Logs |
| **Reverify-Batch-Größe** | Durchschnittliche Subscriptions pro Run | `reverifyActiveSubscriptionsRun` Logs |

---

## 2. Service Level Objectives (SLOs)

### 2.1 Kritisch (P1) — Verfügbarkeit + Sicherheit

| SLO | Ziel | Fenster | Konsequenz bei Verletzung |
|-----|------|--------|---------------------------|
| Cloud Functions Availability | ≥ 99.9% | 30 Tage | Seite PagerDuty On-Call |
| Admin-Panel Availability | ≥ 99.5% | 30 Tage | Seite On-Call |
| Auth-Fehlerrate | ≤ 0.1% | 7 Tage | Automatische Alert + Rollback-Bereitschaft |
| Unbeabsichtigte Legacy-Auth-Nutzung | = 0 | 1 Tag | Sofort-Alert, Cutover-Review |

### 2.2 Wichtig (P2) — Latenz + Nutzererfahrung

| SLO | Ziel | Fenster | Konsequenz bei Verletzung |
|-----|------|--------|---------------------------|
| API p95 Latenz | ≤ 500ms | 7 Tage | Performance-Alert |
| Task-Erstellung E2E | ≤ 3s | 7 Tage | Child-Notification-Investigation |
| Photo-Proof-Validierung | ≤ 2s | 7 Tage | Storage- oder AI-Timeout-Check |
| Admin-Panel TTI | ≤ 3s | 7 Tage | Bundle-Optimierung |

### 2.3 Operational (P3) — Wartung + Monitoring

| SLO | Ziel | Fenster | Konsequenz bei Verletzung |
|-----|------|--------|---------------------------|
| RTDN-Verarbeitungs-Verzögerung | ≤ 5 Min | 1 Tag | Play-Billing-Alert |
| Reverify-Batch-Abdeckung | 100% der active/grace_period-Master | 1 Tag | Scheduler-Health-Check |
| Recovery-Token-Alter | ≤ 90 Tage | 1 Tag | Rotations-Warnung |
| Audit-Log-Vollständigkeit | 100% der Admin-Aktionen | 1 Tag | Log-Pipeline-Alert |

---

## 3. Error Budgets

| SLO | Budget | Verbrauch |
|-----|--------|-----------|
| Cloud Functions Availability 99.9% | 43.2 Min Ausfallzeit / 30 Tage | Tracken via Firebase Status |
| API p95 ≤ 500ms | 5% der Requests dürfen > 500ms sein | Tracken via Cloud Monitoring |
| Auth-Fehlerrate ≤ 0.1% | 1 Fehler pro 1000 Aufrufen | Tracken via Functions Logs |

**Policy:** Wenn 50% des Error Budgets in der ersten Hälfte des Fensters verbraucht wird → Freeze aller Deploys bis zur Ursachenbeseitigung.

---

## 4. Release-Gate-Matrix

### 4.1 Pre-Deploy Gates (jeder Deploy)

| Gate | Prüfung | Verantwortlich | Automatisierung |
|------|---------|---------------|-----------------|
| **G1 — Tests** | Alle 62+ Jest-Suiten grün | CI | ✅ GitHub Actions |
| **G2 — Coverage** | Thresholds in `jest.config.cjs` eingehalten | CI | ✅ GitHub Actions |
| **G3 — Lint** | ESLint + TypeScript strict ohne Fehler | CI | ✅ GitHub Actions |
| **G4 — Firestore Rules** | `firebase deploy --only firestore:rules` Dry-Run | CI | ✅ GitHub Actions |
| **G5 — Admin-Panel Bundle** | Keine Inline-Scripts/Styles (Bundle-Budget-Test) | CI | ✅ GitHub Actions |
| **G6 — Legacy Auth Freeze** | `legacy-auth-freeze-guard.js` grün | CI | ✅ (neu hinzufügen) |
| **G7 — Dependency Audit** | `npm audit` — keine CRITICAL/HIGH ohne Ack | CI | ✅ GitHub Actions |
| **G8 — Version Bump** | `package.json` Version erhöht + Changelog-Eintrag | Developer | ⚠️ Manuell |

### 4.2 Staging Gates (vor Production)

| Gate | Prüfung | Verantwortlich | Automatisierung |
|------|---------|---------------|-----------------|
| **G9 — Staging Deploy** | Deploy auf Staging-Projekt | CI/CD | ✅ GitHub Actions |
| **G10 — E2E Smoke** | Kritischer Pfad: Registrierung → Pairing → Task → Foto | QA / Developer | ⚠️ Halb-automatisch |
| **G11 — Load Test** | 100 parallele Nutzer, 5 Min Dauer | QA | ⚠️ Manuell / K6 |
| **G12 — Security Scan** | CodeQL + Dependency-Check + Secret-Scan | CI | ✅ GitHub Actions |
| **G13 — Rollback-Readiness** | Vorheriger Release-Tag ist deploy-fähig | Developer | ⚠️ Manuell |

### 4.3 Production Gates (nach Deploy)

| Gate | Prüfung | Verantwortlich | Automatisierung |
|------|---------|---------------|-----------------|
| **G14 — Canary Health** | 5 Min nach Deploy: Error-Rate ≤ 0.1% | Monitoring | ✅ Cloud Monitoring Alert |
| **G15 — Traffic Shift** | 10% → 50% → 100% über 30 Min | CI/CD | ✅ (Firebase Hosting Preview) |
| **G16 — Post-Deploy E2E** | Kritischer Pfad auf Production | QA / On-Call | ⚠️ Halb-automatisch |
| **G17 — Rollback-Entscheidung** | Wenn G14 fehlschlägt: Automatisches Rollback | On-Call | ⚠️ Manuell Trigger |

---

## 5. Operational Runbooks

### 5.1 Alert: "Cloud Functions Error Rate > 0.1%"

```
1. Öffne Firebase Console → Functions → Logs
2. Filtere auf `severity >= ERROR` in den letzten 15 Minuten
3. Gruppiere nach `function_name` — welche Funktionen sind betroffen?
4. Wenn > 50% der Fehler von einer einzelnen Funktion:
   a. Prüfe, ob Fehler auf einen Deploy zurückgehen (vergleiche `deploy_time`)
   b. Wenn ja → Rollback auf vorherigen Release
   c. Wenn nein → On-Call eskalieren
5. Dokumentiere in Incident-Log
```

### 5.2 Alert: "Legacy Auth Usage Detected"

```
1. Öffne Firestore → `legacy_auth_usage/{today}`
2. Prüfe, ob Nutzung von `generateCustomToken` oder `registerMasterDevice` (IMEI-only)
3. Wenn Nutzung > 0 nach geplantem Cutover-Datum:
   a. Prüfe `DISABLE_LEGACY_SECRETKEY_AUTH` — ist es auf `true`?
   b. Wenn nein → Cutover noch nicht aktiv, Alert ist informativ
   c. Wenn ja → Kritischer Incident: Legacy-Auth ist nach Cutover noch aktiv
      → Sofort On-Call + Security-Review
4. Wenn Nutzung vor Cutover-Datum:
   a. Normal — Monitor läuft noch
   b. Dokumentiere Trend für Cutover-Entscheidung
```

### 5.3 Alert: "Recovery Token Age > 90 Days"

```
1. Öffne Admin-Panel → Setup-Tab → Recovery-Token-Status
2. Prüfe `recoveryTokenRotationOverdue`
3. Führe Rotation durch: `scripts/operator-setup.ps1 rotate-token`
4. Verifiziere neuen Token über Health-Endpoint
5. Update `ADMIN_RECOVERY_TOKEN_ROTATED_AT`
6. Deploy mit neuem Secret
```

---

## 6. Dashboard-Vorschlag

### Metriken-Widget-Layout (Admin-Panel "📊 Status"-Tab)

```
┌─────────────────────────────────────────────────────────────┐
│  SYSTEM HEALTH                          [🔄 Aktualisieren]  │
├─────────────────────────────────────────────────────────────┤
│  🔵 Cloud Functions    99.97%  │  🔵 RTDN Queue      0 lag  │
│  🔵 API Latenz p95       312ms   │  🔵 Reverify Batch  47/47  │
│  🟡 Admin-Panel TTI      2.8s    │  🔵 Auth-Fehler     0.02%  │
│  🔵 Child Heartbeats     124/min │  🟡 Recovery Token   87 Tage │
├─────────────────────────────────────────────────────────────┤
│  RELEASE GATE STATUS                                        │
│  ✅ G1-G7  │  ✅ G9-G10  │  ⏳ G11 (Load)  │  ✅ G14-G16    │
├─────────────────────────────────────────────────────────────┤
│  LEGACY AUTH MONITOR                                        │
│  Heute: 0 Nutzungen  │  7-Tage-Trend: ↓ 0  │  Cutover: READY │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Implementierungs-Checkliste

- [ ] Cloud Functions: Structured Logging mit `executionId` + `functionName` + `durationMs`
- [ ] Cloud Functions: Fehlerrate-Metrik exportieren (via `functions.logger` → Cloud Monitoring)
- [ ] Admin-Panel: Neuer "📊 Status"-Tab mit Live-Metriken
- [ ] GitHub Actions: `legacy-auth-freeze-guard.js` in CI integrieren
- [ ] GitHub Actions: Lighthouse CI für Admin-Panel-TTI
- [ ] Firebase: Cloud Monitoring Alert Policies für alle P1-SLOs
- [ ] PagerDuty / Discord-Webhook: On-Call-Rotation verbinden
- [ ] RUNBOOK.md: Alert-Runbooks (Error Rate, Legacy Auth, Recovery Token) vervollständigen

---

*Stand: 2026-05-10 | Nächste Review: Nach G1-G7 CI-Integration*
