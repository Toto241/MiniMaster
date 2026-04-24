# MiniMaster Admin Panel Architecture and Automation Concept

Stand: 2026-04-24

Dieses Dokument ist die aktuelle, verbindliche Beschreibung des Admin-Panels. Frühere Notizen zu offenen TODOs, fehlendem SRI fuer `firebase-app-check-compat.js` oder nicht migrierten Inline-Handlern wurden durch den aktuellen, messbaren Stand ersetzt.

## 1. Zielbild

Das Admin-Panel ist kein reines Anzeige-Dashboard. Es ist die zentrale Operator-Oberflaeche fuer automatisierte Analysen, Release-Gates, QA-Steuerung, Support-Triage, Systemdiagnose und kontrollierte Betriebsaktionen.

Prioritaet der Bedienlogik:

1. Automatisierte Analyse zuerst.
2. Manuelle Freigabe nur dort, wo externe Systeme oder reale Geraete beteiligt sind.
3. Jede offene Luecke muss als Gate, Evidence-Item oder Finding sichtbar sein.
4. Kritische Aktionen bleiben rollenbasiert, auditierbar und explizit bestaetigungspflichtig.

## 2. Kernarchitektur

| Bereich | Zweck | Status |
|---|---|---|
| Operator-Cockpit | Systemzustand, Health, P0/P1-Sicht, Fehleranalyse | implementiert |
| Qualitaetssicherung | Testkatalog, Testregister, Suite-Runs, Evidence-Historie, Python-Automation | implementiert und prioritaerer Operator-Einstieg |
| KI-Assistent | Fehler-/Ticketanalyse, Operator-Hilfe, Systemdiagnose | implementiert, produktive Provider-Evidenz bleibt Release-Gate |
| Support | Ticketverwaltung, Debug-/Support-Kontext, Triage | weitgehend implementiert; support/debug automation entry points werden durch Fertigungsstandsanalyse geprueft |
| Compliance / Legal | DSAR, Audit, Re-Consent, Legacy-Auth-Monitor | implementiert |
| Administration | RBAC, Operator-Keys, Reset-/Recovery-Pfade | implementiert und abgesichert |
| Firebase / System-Tools | Functions-Checks, FCM-Test, Knowledge Base, Gemini-Test | implementiert |
| Monetarisierung | Preise/SKUs, B2B, Affiliate, Umsatz/KPIs | im Admin-Panel sichtbar; fachliche Produktfreigabe bleibt gesondertes Rollout-Thema |

## 3. Rollen- und Sicherheitsmodell

- Authentifizierung erfolgt ueber Firebase Authentication.
- Rollen werden ueber Custom Claims gesteuert: `admin`, `support`, `auditor`.
- Backend-seitige Durchsetzung erfolgt in Callable Functions, insbesondere ueber Admin-/Rollenpruefungen.
- Das Panel nutzt Inaktivitaets-Logout und rollenbasierte UI-Einschraenkungen.
- Recovery- und Reset-Funktionen sind nur ueber explizite Runtime-Flags, Projekt-Allowlist, Recovery-Token und bestaetigungspflichtige Aktionen zulaessig.

## 4. Automatisierte Analyse als Pflichtbestandteil

Das Repository enthaelt jetzt eine automatisierte Fertigungsstands- und Gap-Analyse:

```bash
npm run analyze:fertigungsstand
npm run analyze:fertigungsstand:gate
```

Die Analyse liest unter anderem:

- `docs/RELEASE_EVIDENCE_REGISTER.md`
- `docs/CI_REVALIDATION_LATEST.md`
- `docs/LEGACY_AUTH_INVENTORY.md`
- `docs/LEGACY_AUTH_CUTOVER_PLAN.md`
- `docs/SECURITY_BASELINE_CHECKLIST.md`
- `admin-panel/index.html`
- `admin-panel/app.js`

Ausgegeben werden:

- `build/fertigungsstand/latest-summary.json`
- `build/fertigungsstand/latest-report.md`

Der Gate-Modus `analyze:fertigungsstand:gate` schlaegt fehl, solange P0-Blocker offen sind.

## 5. Aktueller Sicherheitsstand Admin-Panel

| Pruefpunkt | Aktueller Stand |
|---|---|
| Firebase SRI | `firebase-app`, `firebase-auth`, `firebase-firestore`, `firebase-functions`, `firebase-app-check` mit SRI versehen |
| Inline Event Handler | auf `data-action` / Event-Delegation umgestellt; Fertigungsstandsanalyse misst verbleibende Inline-Handler |
| CSP | harte CSP ohne Script-`unsafe-inline`; weitere Details siehe `SECURITY_BASELINE_CHECKLIST.md` |
| App Check | Integration vorhanden; produktiver Site-Key ist externes Betriebs-/Firebase-Gate |
| DOM-Sicherheit | `innerHTML`-Nutzung wird als auditpflichtiges P2-Finding ausgewiesen, falls direkte Zuweisungen vorhanden sind |
| Auditierbarkeit | kritische Backend-/Operator-Aktionen werden ueber Audit-Logging und Rollenmodell abgesichert |

## 6. Widerspruchsaufloesung gegenueber aelteren Dokumenten

Folgende alte Aussagen gelten nicht mehr als aktueller Umsetzungsstand:

- `firebase-app-check-compat.js` habe noch keinen SRI-Hash.
- Inline-`onclick` sei pauschal eine offene Admin-Panel-Blockade.
- Das Admin-Panel sei primaer eine manuelle Verwaltungsoberflaeche.

Aktueller Stand ist:

- SRI fuer App Check ist gesetzt.
- Das HTML nutzt `data-action`-basierte Bedienung; verbleibende Risiken werden automatisiert gemessen.
- Das Admin-Panel ist automation-first: QA, KI-Analyse, Fertigungsstand, Release-Gates und Evidence stehen im Vordergrund.

## 7. Offene Punkte, die bewusst nicht als reine Code-Defekte gelten

Diese Punkte koennen nicht allein durch Repository-Code abgeschlossen werden und bleiben harte Release-/Betriebsgates:

| Gate | Grund |
|---|---|
| GitHub Actions Billing / Spending Limit | Konto-/Abrechnungsthema; blockiert frische CI-/CodeQL-Evidenz |
| CodeQL Success Evidence | benoetigt lauffaehige GitHub Actions |
| Android CI Success Evidence | benoetigt lauffaehige GitHub Actions |
| Physische/Emulator-Commissioning-Checks | benoetigt reale Testumgebung oder funktionsfaehigen AVD |
| Firebase-Key-Rotation | Firebase-Console-/Security-Owner-Aktion |
| Play Console Data Safety / IARC / Permissions / App Access | Store-/Compliance-Owner-Aktion |
| On-call-/Eskalations-Roster | Betriebsorganisation und reale Kontakte erforderlich |
| Final Deploy Evidence | benoetigt produktive Secrets/Runtime-Konfiguration und Deploy-Freigabe |

## 8. Definition of Done fuer Admin-Panel-Aenderungen

Eine Admin-Panel-Aenderung gilt erst als abgeschlossen, wenn:

1. die Funktion ueber `data-action` oder ein eindeutig testbares Event-Pattern bedienbar ist,
2. kritische Aktionen rollenbasiert und auditierbar sind,
3. neue Analyse-/QA-Funktionen im QA- oder KI-Kontext sichtbar sind,
4. `npm run analyze:fertigungsstand` keine neuen unerklaerten Findings erzeugt,
5. P0-/P1-Auswirkungen im Release Evidence Register oder in der Fertigungsstandsanalyse sichtbar sind,
6. direkte DOM-Injektionen vermieden oder mit Escape-/Testnachweis abgesichert sind.

## 9. Operator-Arbeitsfluss

Empfohlener Ablauf im Admin-/QA-Kontext:

1. Fertigungsstandsanalyse ausfuehren.
2. P0-Blocker im QA-/Release-Kontext anzeigen.
3. Automatisierte Test- und Evidence-Suites starten.
4. Support-/Fehlerdaten per KI/Debug-Kontext analysieren.
5. Nur externe Gates manuell abarbeiten und als Evidence verlinken.
6. Go/No-Go erst nach gruener CI, CodeQL, Android-CI, Commissioning und Sign-off dokumentieren.
