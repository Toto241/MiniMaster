# PC Admin App – KI-Support-Workflow

Stand: 2026-02-13

## Ziel
Supportprobleme mit KI schneller lösen, ohne Governance, Datenschutz oder Qualität zu verletzen.

## End-to-End Ablauf
1. Ticket wird erstellt (Problemtext + Metadaten)
2. Klassifikation (Kategorie, Schweregrad, Jurisdiktion)
3. KI erzeugt Lösungsvorschlag auf Basis freigegebener Wissensquellen
4. Confidence-Scoring
5. Entscheidung:
   - Confidence >= Schwelle: Vorschlag an Agent
   - Confidence < Schwelle: automatische Eskalation
6. Agent prüft, editiert, versendet
7. Nutzerfeedback erfassen (gelöst/nicht gelöst)
8. Ticket schließen oder weiter eskalieren

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

## Mindesttests
- Unit: Klassifikation, Confidence-Grenzen, Eskalationsentscheidung
- Integration: Ticket -> KI -> Agent -> Close
- System: End-to-end inklusive Audit-Log und Rollenrechte

## Hinweis
Die finale Entscheidung bleibt beim menschlichen Support. KI ist assistiv, nicht autoritativ.
