# Final Readiness Workplan (2026-03-18)

Stand: 2026-03-18

Dieses Dokument leitet aus den aktuellen Findings einen priorisierten Arbeitspaketeplan ab und trennt zwischen:

- **Go-Live-Blockern**,
- **kurzfristig umsetzbaren Härtungsmaßnahmen**,
- **mittelfristiger Betriebs- und Skalierungsreife**.

## 1. Priorisierte Arbeitspakete

### AP-1 — Child-Enforcement finalisieren (**Blocker**)

**Ziel:** Die Child-App muss Regeln zuverlässig und bypass-resistent durchsetzen.

**Umfang:**
- Wirksames App-Blocking auf OEM-/Android-Varianten prüfen.
- Overlay-Sicherheit und Schutz gegen Abschalten/Deinstallation härten.
- Offline-Regelcache und Wiederanlaufverhalten belastbar machen.
- Device-Level-E2E-Regressionen für zentrale Sperr-/Freigabe-Flows ausbauen.

**Abnahmekriterien:**
- Keine bekannten triviale Bypass-Pfade mehr.
- Reproduzierbare E2E-Nachweise auf Referenzgeräten.
- Support/QA-Checkliste für Enforcement vorhanden.

### AP-2 — Legacy-Auth auf Token-/Claim-Modell migrieren (**Blocker**)

**Ziel:** Das verbleibende `secretKey`-Modell wird kontrolliert durch Firebase Auth / Claims ersetzt.

**Umfang:**
- Bestandsaufnahme aller verbleibenden `secretKey`-Abhängigkeiten.
- Migrationspfad für Web-Control und Android-Clients abschließen.
- Backend-Endpunkte konsequent auf `context.auth` + Claims umstellen.
- Altpfade messen, deprecaten und anschließend entfernen.

**Abnahmekriterien:**
- Keine produktiven privilegierten Flows mehr mit client-passed `secretKey`.
- Monitoring für Restnutzung des Legacy-Modells vorhanden.
- Migrations-/Rollback-Plan dokumentiert.

### AP-3 — Country Compliance & Store-Go-Live schließen (**Blocker**)

**Ziel:** Rechtliche und Store-seitige Go-/No-Go-Kriterien werden pro Zielmarkt nachweisbar erfüllt.

**Umfang:**
- Play-Policy-Self-Check, Data-Safety-Validierung und Disclosure-Konsistenz.
- Country Reviews inkl. Terms/Privacy/Consent/DSAR-Artefakte.
- Re-Consent- und Policy-Versionierung vor Rollout verifizieren.
- Juristische Sign-offs und betriebliche Nachweise bündeln.

**Abnahmekriterien:**
- Für jeden Rollout-Markt: Status nicht mehr "Offen".
- Freigabepaket pro Markt vollständig.
- Store Listing, In-App-Texte und Policies konsistent.

### AP-4 — CI, Toolchain und Security-Gates härten (**hoch, sofort umsetzbar**)

**Ziel:** Reproduzierbare Qualitätssicherung mit echten Sicherheits- und Integrations-Gates.

**Umfang:**
- Node-/JDK-Versionen zwischen Repo und CI angleichen.
- Firestore-Regeln im Emulator automatisiert testen.
- Bestehende Strukturtests beibehalten, aber nicht als einziges Gate nutzen.
- Artefakte und Check-Sequenzen in CI-Dokumentation verankern.

**Abnahmekriterien:**
- CI läuft mit gepinnter Laufzeit passend zum Repo.
- Firestore-Regeln werden in CI gegen den Emulator geprüft.
- Fehlerhafte Rollen-/Ownership-Regeln brechen die Pipeline.

### AP-5 — Runbook, Monitoring und Incident Response produktionsreif machen (**hoch, sofort umsetzbar**)

**Ziel:** Operativer Betrieb ist nicht nur beschrieben, sondern mit klaren Reaktionswegen hinterlegt.

**Umfang:**
- Alerting-/SLO-Basis definieren.
- Konkrete Log-/Monitoring-Queries ergänzen.
- Incident-Abläufe für FCM, Firestore, Billing, Deployments und Abuse dokumentieren.
- Rollback-, Kommunikations- und Evidence-Sammlung standardisieren.

**Abnahmekriterien:**
- Runbook enthält belastbare Erstmaßnahmen und Eskalationspfade.
- Support/Ops können häufige Störungen ohne Tribal Knowledge bearbeiten.

### AP-6 — Desktop-/Web-Sicherheitsbasis schließen (**hoch**)

**Ziel:** Operator- und Web-Flächen erfüllen eine robuste Mindesthärtung.

**Umfang:**
- CSP/SRI-Review, Session-Timeout, Credential-Handling.
- Operator-CLI-Zugriffe weiter einschränken und auditieren.
- UI-Smoke-Checks automatisieren.

**Abnahmekriterien:**
- Web-/Desktop-Oberflächen haben definierte Security-Baseline.
- Kritische Operator-Aktionen sind nachweisbar eingeschränkt und auditierbar.

## 2. Umsetzung in dieser Iteration

In dieser Iteration werden die **kurzfristig umsetzbaren High-Impact-Pakete AP-4 und AP-5** gestartet, weil sie ohne tiefen Produktumbau direkt im Repository umgesetzt und in der Pipeline verankert werden können.

### Iterationsziel

1. **CI/Toolchain angleichen**
2. **Firestore-Regeltests im Emulator automatisieren**
3. **Runbook von Placeholder auf produktionsnahe Fassung anheben**

## 3. Nächste Iterationen

### Iteration 2
- AP-2: `secretKey`-Restflächen inventarisieren und Migrations-Rollout vorbereiten.
- AP-6: Session- und Desktop-Härtung konkretisieren.

### Iteration 3
- AP-1: Child-Enforcement-Fokus (Bypass-Tests, OEM-Matrix, Anti-Tamper).
- AP-3: Marktweise Legal-/Store-Freigaben abschließen.

## 4. Detaillierter Folgeplan

Die konkretisierten nächsten Umsetzungswellen, Deliverables und Exit-Kriterien sind im Detailplan `docs/NEXT_IMPLEMENTATION_WORKPACKAGES_2026-03-18.md` beschrieben.
