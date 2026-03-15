# PC Admin App – KI-Support-Workflow

<!-- markdownlint-disable MD022 MD029 MD032 MD047 -->

Stand: 2026-02-13

## Ziel

Supportprobleme mit KI schneller lösen, ohne Governance, Datenschutz oder Qualität zu verletzen.

## Modellstrategie

- Primärmodell: **Google Gemini** (Server-seitig über `GEMINI_API_KEY`)
- Fallback: OpenAI nur falls `GEMINI_API_KEY` nicht gesetzt ist und `OPENAI_API_KEY` vorhanden ist
- Für Audit/Analyse wird der verwendete Provider pro Ticket gespeichert (`aiProvider`, `aiModel`)

## End-to-End Ablauf

1. Ticket wird erstellt (Problemtext + Metadaten)
1. Klassifikation (Kategorie, Schweregrad, Jurisdiktion)
1. KI erzeugt Lösungsvorschlag auf Basis freigegebener Wissensquellen
1. Confidence-Scoring
1. Entscheidung:
- Confidence >= Schwelle: Vorschlag an Agent
- Confidence < Schwelle: automatische Eskalation
1. Agent prüft, editiert, versendet
1. Nutzerfeedback erfassen (gelöst/nicht gelöst)
1. Ticket schließen oder weiter eskalieren

## Verbindliche Nutzer-Rueckmeldung

- Wenn KI den Status **awaiting_user_feedback** setzt, muss der Nutzer explizit mit **Ja** oder **Nein** antworten.
- Bei **Nein** ist ein Kommentar verpflichtend.
- Ohne Kommentar wird die Rueckmeldung serverseitig abgelehnt (Validierungsfehler).

## Zugriffszustimmung (Mobilgeraete)

- Beim Erstellen eines Support-Tickets wird die Zustimmung zur temporaeren Support-Einsicht explizit abgefragt (**Ja/Nein**).
- Die Entscheidung wird im Ticket gespeichert (`supportAccessConsent`, `supportAccessConsentSource`, `supportAccessConsentAt`).
- Bei Zustimmung kann der Zugriff befristet (48h) erteilt werden.

## Datenfelder je Ticket

- Ticket-ID
- Nutzer-ID / betroffene Rolle
- Jurisdiktion
- Kategorie
- Priorität
- KI-Vorschlag
- KI-Confidence
- Escalation-Flag
- Agent-Entscheidung
- Abschlussgrund
- Zeitstempel (created/updated/closed)

## KI-Qualitätsregeln

- Keine rechtsverbindlichen Zusagen durch KI
- Keine sicherheitskritischen Anweisungen ohne Agent-Prüfung
- Keine Preis-/Vertragsauskunft ohne verifizierte Datenquelle
- Bei Unsicherheit: explizite Eskalation

## Prompting-Richtlinien

- Nur notwendige Kontextdaten
- Keine unnötigen personenbezogenen Daten im Prompt
- Standardisierte Struktur (Problem, Kontext, Zielantwort)

## Observability

- Metriken:
- Suggestion Acceptance Rate
- Escalation Rate
- MTTR
- Reopen Rate
- Alerts:
- Sprunghafter Anstieg Eskalationen
- Niedrige KI-Akzeptanzquote

## Failure-Handling

- KI-Service nicht verfügbar -> sofort Human-Queue
- Ungültige KI-Antwort -> fallback auf Standard-Playbook
- Compliance-Sperre ausgelöst -> Ticket nur manuell bearbeitbar

## Betreiber-Setup & Cloud-Integrations-Assistent (Neu)

Das Operator Dashboard enthält einen dedizierten Tab **Cloud Setup & Assistant** mit folgenden Funktionen:

1. **Integration Health Check**

- Validiert Firebase-Konfiguration (keine Platzhalter)
- Prüft Admin-Authentifizierung und Rolle (`role == admin`)
- Prüft Firestore-Zugriff auf Kernsammlungen (`masters`, `children`, `supportTickets`, `audit_logs`)
- Prüft Erreichbarkeit zentraler Callable Functions

1. **Operator Onboarding Checklist**

- Schrittweise Inbetriebnahme im UI (persistiert lokal im Browser)
- Standardpunkte: Config, Auth/RBAC, Firestore, Functions, Support-Flow, Compliance-Flow

1. **Operator Assistant**

- In-Panel Assistent für typische Betreiberfragen
- Themen: Firebase Setup, Claims/Rollen, Functions, Firestore Rules, Support-Tickets, DSAR/Audit
- Gibt konkrete Handlungsanweisungen statt allgemeiner Antworten

1. **Setup Report Export**

- Export als JSON (Zeitpunkt, Umgebung, Checklistenstatus, Validierungsergebnisse)
- Verwendbar als Betriebs-/Abnahme-Nachweis

Empfohlene Reihenfolge für Go-Live:

1. Full Validation ausführen
1. Alle ERRORs beseitigen
1. Support- und Compliance-Testfall durchlaufen
1. Setup Report exportieren und ablegen

## Mindesttests

- Unit: Klassifikation, Confidence-Grenzen, Eskalationsentscheidung
- Integration: Ticket -> KI -> Agent -> Close
- System: End-to-end inklusive Audit-Log und Rollenrechte

## Hinweis

Die finale Entscheidung bleibt beim menschlichen Support. KI ist assistiv, nicht autoritativ.
