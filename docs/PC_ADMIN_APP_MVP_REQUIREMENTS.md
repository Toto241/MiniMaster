# PC Admin App – MVP Requirements (MiniMaster)

Stand: 2026-02-13

## Ziel
Eine PC-Software (Desktop Admin Console) für Betreiber/Support, die mindestens Folgendes bereitstellt:
- Nutzeranzahl (aktive, inaktive, neue)
- Abomodell und Abostatus
- KI-gestützte Problemlösungsunterstützung für Supportfälle

Dieses Dokument definiert den MVP-Umfang, Datenfelder, Screens, Rollen, Sicherheitsanforderungen und Umsetzungsprioritäten.

## Nicht-Ziele (MVP)
- Keine direkte Geräte-Steuerung vom Desktop aus ohne bestehende Berechtigungslogik
- Kein automatisierter Rechtsentscheid durch KI
- Keine globale Multi-Cloud-Migration

## Rollenmodell
- **Operator Admin**: Vollzugriff auf Admin-Funktionen und Reports
- **Support Agent**: Zugriff auf Tickets und KI-Support, eingeschränkt auf freigegebene Fälle
- **Read-Only Auditor**: Einsicht in Audit-Logs und Compliance-Nachweise

## MVP-Funktionsumfang

### 1) Dashboard
- KPI-Karten:
  - Gesamtzahl Nutzer
  - Aktive Abos
  - Trial-Abos
  - Churn (30 Tage)
  - Offene Tickets
- Zeitfilter (7/30/90 Tage)
- Jurisdiktionsfilter (Land/Region)

### 2) Nutzer- und Abo-Übersicht
- Tabelle mit:
  - Nutzer-ID
  - Land/Jurisdiktion
  - Rolle
  - Abo-Modell
  - Abo-Status
  - Nächste Verlängerung/Kündigungsdatum
- Such- und Filterfunktionen
- Detailansicht je Nutzerkonto

### 3) Compliance-Status
- Einwilligungsstatus (Version, Zeitstempel)
- DSAR-Status (Export/Löschung angefragt, in Bearbeitung, abgeschlossen)
- Aufbewahrungsfrist / geplantes Löschdatum
- Policy-Versionen (Datenschutz, Nutzungsbedingungen)

### 4) KI-unterstützter Support
- Ticketliste mit Priorität/Status
- KI-Vorschlag für Antwort/Lösung
- Confidence-Anzeige
- Ein-Klick-Eskalation an Human-Agent
- Feedback-Loop (angenommen/abgelehnt)

### 5) Audit & Nachvollziehbarkeit
- Ereignislog für:
  - Admin-Aktionen
  - Support-Zugriffe
  - KI-Antworten und Eskalationen
- Exportierbarer Audit-Report

## UI-Screens (MVP)
1. Login + Rollenprüfung
2. Dashboard
3. Nutzer-/Abo-Liste
4. Nutzerdetail
5. Compliance-Detail
6. Ticketliste
7. Ticketdetail mit KI-Assistent
8. Audit-Log Viewer

## API-Anforderungen (Backend)
- `admin.getDashboardMetrics`
- `admin.listUsersWithSubscription`
- `admin.getUserComplianceState`
- `admin.listSupportTickets`
- `admin.getTicketAiSuggestion`
- `admin.submitTicketResolution`
- `admin.escalateTicket`
- `admin.listAuditEvents`

## Sicherheitsanforderungen
- Striktes RBAC (Admin/Support/Auditor)
- Keine Speicherung sensibler Secrets im Client
- Zugriff nur mit short-lived Sessions/Tokens
- Vollständige Auditierbarkeit aller sensitiven Aktionen
- Rate Limits auf Support-/KI-Endpunkte

## Datenschutzanforderungen (MVP)
- Datenminimierung
- Zweckbindung
- Lösch- und Exportpfad (DSAR)
- Versionierte Einwilligungsnachweise
- Jurisdiktionsgebundene Datenbehandlung

## KI-Governance (MVP)
- KI gibt nur Vorschläge, keine finalen erzwungenen Entscheidungen
- Confidence-Schwelle für automatische Antwortvorschläge
- Unterhalb Schwelle: automatische Eskalation
- Quellen-/Kontextnachweis je KI-Antwort speichern
- Prompt- und Antwort-Logging mit PII-Reduktion

## Metriken für Erfolg
- Mean Time to Resolution (MTTR) Support
- First Contact Resolution Rate
- Anteil eskalierter Tickets
- KI-Vorschlagsannahmequote
- Compliance SLA (DSAR, Consent-Nachweis)

## Technische Empfehlung (Start)
- Desktop UI: Electron + React (oder .NET WPF bei Windows-only)
- Backend: bestehende Firebase Functions erweitern
- Storage: Firestore (Audit/Tickets/Compliance-States)
- Auth: Firebase Auth + Custom Claims

## Delivery-Plan (Kurz)
- **Sprint 1**: Dashboard + Nutzer/Abo-Liste + RBAC Grundgerüst
- **Sprint 2**: Compliance-Screens + Audit-Log + Exporte
- **Sprint 3**: KI-Support-Workflow + Eskalation + Qualitätssicherung

## Wichtiger Hinweis
Dieses Dokument ist eine technische Grundlage und keine Rechtsberatung. Für produktive Freigabe muss eine rechtliche Prüfung pro Zielmarkt erfolgen.
