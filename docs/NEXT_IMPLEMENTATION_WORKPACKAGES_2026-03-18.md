# Next Implementation Workpackages (2026-03-18)

Stand: 2026-03-18

Dieses Dokument konkretisiert die **nächsten Umsetzungen nach der ersten Readiness-Iteration**. Es übersetzt den übergeordneten Readiness-Plan in eine belastbare Reihenfolge aus umsetzbaren Arbeitspaketen mit Zielbild, Deliverables, Abhängigkeiten und Exit-Kriterien.

## 1. Zielbild der nächsten Umsetzungswellen

Die nächste Umsetzungsphase verfolgt vier operative Ziele:

1. **Legacy-Auth kontrolliert zurückbauen** und den produktiven Pfad auf Firebase Auth / Claims fokussieren.
2. **Web-/Desktop-Sicherheitsbasis schließen**, bevor weitere Operator- oder Support-Funktionen erweitert werden.
3. **Child-Enforcement technisch belastbarer machen**, damit das Kernversprechen des Produkts nicht an OEM-/Bypass-Themen scheitert.
4. **Country- und Compliance-Artefakte produktiv anschlussfähig machen**, damit Rollouts nicht nur technisch, sondern auch rechtlich und betrieblich freigabefähig werden.

## 2. Priorisierte nächste Arbeitspakete

### AP-N1 — Legacy-Auth Restflächen inventarisieren und einfrieren

**Priorität:** Sehr hoch  
**Horizont:** Sofort / nächste Iteration

**Ziel:** Alle verbleibenden `secretKey`-/IMEI-abhängigen Pfade werden vollständig sichtbar gemacht, gegen neue Ausweitung geschützt und als Migrationsscope fixiert.

**Konkrete Umsetzungen:**
- Vollständige Inventarliste aller Backend-, Android-, Web- und Desktop-Pfade mit `secretKey` oder IMEI-Abhängigkeit erstellen.
- "No new legacy auth"-Regel festlegen: neue Endpunkte dürfen keine `secretKey`-Pflicht mehr einführen.
- Altpfade in Kategorien aufteilen:
  - produktiv-kritisch,
  - migrierbar ohne Breaking Change,
  - breaking / rollout-pflichtig.
- Messpunkte/Logging ergänzen, um reale Restnutzung im Betrieb zu sehen.

**Deliverables:**
- Migrationsinventar je Oberfläche/Endpunkt.
- Deprecation-Matrix mit Besitzer, Risiko und Reihenfolge.
- Telemetrie-/Logging-Liste zur Restnutzungsmessung.

**Abhängigkeiten:**
- Bestehende Auth-Migrationsdokumente.
- Zugriff auf aktuelle API-/Client-Pfade.

**Exit-Kriterien:**
- Jeder Legacy-Pfad ist erfasst und priorisiert.
- Es gibt einen Freeze gegen neue `secretKey`-Einführungen.
- Migrationswelle AP-N2 kann ohne Discovery-Lücke starten.

---

### AP-N2 — Firebase-Auth-Migrationswelle 1 (Backend + Web-Control)

**Priorität:** Sehr hoch  
**Horizont:** Kurzfristig

**Ziel:** Die ersten produktiven Pfade werden von `secretKey`-Payloads auf `context.auth` / Claims umgestellt, beginnend mit den am besten kontrollierbaren Oberflächen.

**Konkrete Umsetzungen:**
- Web-Control-Login-/Session-Pfad auf Firebase Auth als Primärpfad umstellen.
- Callable Functions mit dualem Pfad ausstatten:
  - neuer Pfad: `context.auth`,
  - alter Pfad: nur temporär und klar markiert.
- Serverseitige Audit-/Warnlogs ergänzen, wenn Legacy-Auth verwendet wird.
- Admin-/Operator-Dokumentation für Token-/Claim-basierte Nutzung nachziehen.

**Deliverables:**
- Erste produktive Functions ohne Pflicht zu `masterImei + secretKey`.
- Web-Control-Migrationspfad dokumentiert.
- Legacy-Nutzung messbar im Logging.

**Abhängigkeiten:**
- AP-N1 abgeschlossen.
- Firebase Auth / Claims in betroffenen Flows verifiziert.

**Exit-Kriterien:**
- Mindestens ein zentraler produktiver Pfad nutzt standardmäßig Firebase Auth.
- Legacy-Pfad ist deprecate-fähig und überwacht.
- Kein neuer Web-Control-Flow hängt ausschließlich am `secretKey`.

---

### AP-N3 — Web-/Desktop-Sicherheitsbasis schließen

**Priorität:** Hoch  
**Horizont:** Kurzfristig

**Ziel:** Operator- und Web-Flächen erhalten eine klar definierte und prüfbare Mindesthärtung.

**Konkrete Umsetzungen:**
- CSP-Review je Webfläche (`web-control`, `admin-panel`, `desktop`).
- Session-Timeout- und Re-Auth-Konzept für Operator-Zugriffe definieren und umsetzen.
- Credential-Handling prüfen:
  - keine langlebigen sensiblen Tokens in unsicheren Browser-/Desktop-Kontexten,
  - keine Klartextspeicherung operatorischer Secrets.
- Operator-CLI-Pfad enger whitelisten und stärker auditieren.
- UI-Smoke-/Security-Smoke-Checks in CI vorbereiten.

**Deliverables:**
- Security-Baseline-Checkliste für Web/Desktop.
- Dokumentierte Session-/Re-Auth-Regeln.
- Review der CLI-Whitelist inkl. Restrisiken.

**Abhängigkeiten:**
- Bestehende Desktop-/Admin-Architektur.
- Operator-Flows und Security-Vorgaben.

**Exit-Kriterien:**
- CSP-/Session-/Credential-Themen sind nicht mehr als offene High-Risk-Lücken klassifiziert.
- Operator-Zugriffe sind nachvollziehbar eingeschränkt.

---

### AP-N4 — Child-Enforcement Härtungswelle 1

**Priorität:** Hoch  
**Horizont:** Kurz- bis mittelfristig

**Ziel:** Die technisch größten Bypass-Risiken im Child-Enforcement werden systematisch reduziert.

**Konkrete Umsetzungen:**
- OEM-/Gerätematrix für Referenztests definieren.
- Offline-Policy-Cache und Wiederanlaufverhalten spezifizieren.
- Anti-Tamper-/Disable-/Uninstall-Risiken priorisiert abarbeiten.
- App-Blocking-Regressionen mit reproduzierbaren Testfällen dokumentieren.
- Connected/E2E-Tests für Sperren, Sync und Wiederherstellung ausbauen.

**Deliverables:**
- Enforcement-Testmatrix.
- Priorisierte Bug-/Hardening-Liste.
- Nachweisbare Regressionstests für Kern-Enforcement.

**Abhängigkeiten:**
- Verfügbare Referenzgeräte / Emulatorabdeckung.
- QA-/Support-Feedback zu realen Umgehungsszenarien.

**Exit-Kriterien:**
- Kritische Bypass-Pfade sind dokumentiert und mindestens in erster Welle adressiert.
- Es gibt belastbare Reproduktions- und Verifikationstests.

---

### AP-N5 — Compliance-Enablement für erste Zielmärkte

**Priorität:** Hoch  
**Horizont:** Mittelfristig

**Ziel:** Die technischen und organisatorischen Voraussetzungen für echte Marktfreigaben werden für die erste Rollout-Welle operationalisiert.

**Konkrete Umsetzungen:**
- Startmärkte verbindlich festlegen (z. B. DE/EU, UK, USA als Arbeitsannahme).
- Für diese Märkte Pflichtartefakte bündeln:
  - Terms,
  - Privacy,
  - Consent-Texte,
  - DSAR-/Löschprozess,
  - Re-Consent-Trigger.
- Produktseitige Versionierung und Effective-Date-Logik gegen juristische Anforderungen spiegeln.
- Go-/No-Go-Checkliste pro Markt aufsetzen.

**Deliverables:**
- Marktweise Rollout-Dossiers.
- Juristische und technische Freigabechecklisten.
- Klare Owner für fehlende Country-Artefakte.

**Abhängigkeiten:**
- Product/Compliance/Legal Abstimmung.
- Bestehende Policy-/Consent-Spezifikationen.

**Exit-Kriterien:**
- Für die erste Marktgruppe gibt es keine unstrukturierten "Offen"-Punkte mehr, sondern owner-gebundene Restarbeiten.
- Rollout-Gates sind entscheidungsfähig.

---

### AP-N6 — Betriebsmetriken und Release-Gates operationalisieren

**Priorität:** Mittel bis hoch  
**Horizont:** Parallel laufend

**Ziel:** Betriebsreife wird messbar und Releases werden nicht nur dokumentiert, sondern anhand definierter Gates bewertet.

**Konkrete Umsetzungen:**
- Minimal-Set an Service Level Indicators definieren.
- Release-Gate-Checkliste in CI/Releaseprozess überführen.
- Audit-/Error-/Performance-Datenquellen vereinheitlichen.
- Betriebsdashboard für zentrale Signale definieren.

**Deliverables:**
- SLI-/SLO-Vorschlag.
- Release-Gate-Matrix.
- Monitoring-Backlog nach Metriktyp.

**Abhängigkeiten:**
- Runbook/Observability-Collections.
- Build-/CI-Pipeline.

**Exit-Kriterien:**
- Releases können gegen definierte Gates bewertet werden.
- Betriebssignale sind nicht mehr nur dokumentiert, sondern als messbare Kriterien vorhanden.

## 3. Empfohlene Umsetzungsreihenfolge

### Welle 1 — Sofort starten
1. **AP-N1** — Legacy-Auth inventarisieren und einfrieren.
2. **AP-N3** — Web-/Desktop-Sicherheitsbasis schließen.
3. **AP-N6** — Betriebsmetriken und Release-Gates operationalisieren.

### Welle 2 — Direkt im Anschluss
4. **AP-N2** — Firebase-Auth-Migrationswelle 1.
5. **AP-N4** — Child-Enforcement Härtungswelle 1.

### Welle 3 — Rollout-Vorbereitung
6. **AP-N5** — Compliance-Enablement für erste Zielmärkte.

## 4. Vorschlag für die nächste konkrete Umsetzungsiteration

### Sprint-Ziel
Die nächste konkrete Iteration sollte sich auf **AP-N1 + AP-N3** konzentrieren.

### Warum genau diese Kombination?
- **AP-N1** senkt das größte strategische Sicherheitsrisiko, weil es den Migrationsscope kontrollierbar macht.
- **AP-N3** reduziert kurzfristig reale Angriffs- und Fehlbedienungsflächen in den Operator-/Web-Oberflächen.
- Beide Pakete sind deutlich besser plan- und lieferbar als sofort mit der vollen Enforcement- oder Legal-Welle zu starten.

### Vorgeschlagene Iterationsergebnisse
- Vollständiges Legacy-Auth-Inventar.
- Liste der ersten umzustellenden Endpunkte/Clients.
- Dokumentierte Web-/Desktop-Security-Baseline.
- Konkreter Umsetzungsplan für Session-Timeout, Re-Auth und CLI-Restriktionen.

## 5. Definition of Ready für die nächste Implementierungsrunde

Ein Arbeitspaket gilt als implementierungsbereit, wenn:

1. Scope und betroffene Komponenten klar benannt sind.
2. Ein Owner benannt ist.
3. Risiken / Rollback-Folgen beschrieben sind.
4. Ein prüfbares Exit-Kriterium vorliegt.
5. Tests, Telemetrie oder Abnahmesignale definiert sind.

## 6. Definition of Done je Arbeitspaket

Ein Arbeitspaket gilt erst dann als abgeschlossen, wenn:

1. Code / Konfiguration / Dokumentation konsistent aktualisiert sind.
2. Auswirkungen auf CI, Ops und Security bewertet wurden.
3. Monitoring-/Audit-Bedarf berücksichtigt wurde.
4. Ein Rollback- oder Deaktivierungspfad dokumentiert ist.
5. Offene Restpunkte explizit in ein Folgepaket verschoben wurden.
