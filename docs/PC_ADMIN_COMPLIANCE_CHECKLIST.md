# PC Admin App – Compliance Checklist

Stand: 2026-02-13

## Nutzung
Checkliste pro Zielmarkt durchgehen (z. B. DE/EU, US) und vor Go-Live abzeichnen.

## A) Governance & Verantwortlichkeiten
- [ ] Verantwortliche Person/Team für Compliance benannt
- [ ] Rollen und Rechte dokumentiert (Admin/Support/Auditor)
- [ ] Incident- und Breach-Workflow definiert

## B) Datenschutz & Rechtsgrundlagen
- [ ] Rechtsgrundlage pro Verarbeitung dokumentiert
- [ ] Consent-Texte versioniert und protokolliert
- [ ] Widerrufspfad implementiert
- [ ] Datenminimierung nachweisbar
- [ ] Aufbewahrungs- und Löschregeln umgesetzt

## C) Kinder-/Familienkontext
- [ ] Eltern-/Erziehungsberechtigten-Flow dokumentiert
- [ ] Altersbezogene Schutzmechanismen aktiv
- [ ] Keine Profilbildung außerhalb erlaubter Zwecke

## D) Google/Plattform-Vorgaben
- [ ] Permissions und Datennutzung transparent dokumentiert
- [ ] Accessibility-Nutzung nur für legitimen Zweck
- [ ] Play-Policy-/Family-Policy-Konformität geprüft
- [ ] Store-Listing und Datenschutzangaben konsistent

## E) Sicherheit
- [ ] Keine Secrets im Repository (z. B. google-services.json)
- [ ] RBAC serverseitig erzwungen
- [ ] Audit-Logs unveränderbar oder manipulationsgeschützt
- [ ] Security-Scanning aktiv (SAST/Dependency/CodeQL)
- [ ] Zugriff auf Supportdaten zeitlich und inhaltlich begrenzt

## F) KI-Compliance
- [ ] KI-Nutzung transparent erklärt
- [ ] Human-in-the-loop bei niedrigem Confidence-Wert
- [ ] Kritische Kategorien werden nicht autonom entschieden
- [ ] Prompt/Output Logging mit PII-Reduktion
- [ ] Halluzinationsschutz über Knowledge-Base/RAG

## G) Betroffenenrechte (DSAR)
- [ ] Auskunftsprozess (Export) vorhanden
- [ ] Löschprozess vorhanden
- [ ] Korrekturprozess vorhanden
- [ ] SLA und Nachweise vorhanden

## H) Operative Nachweise
- [ ] Release-Checkliste signiert
- [ ] Systemreview durchgeführt
- [ ] Penetrationstest/Review geplant oder durchgeführt
- [ ] Monitoring/Alerting aktiv

## Freigabe
- Markt/Region:
- Datum:
- Freigebende Person:
- Einschränkungen/Restpunkte:
