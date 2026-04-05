# Backend Security Analysis 2026-04-05

## Scope

Analysiert wurden die sicherheitskritischen Backend-Module in [src/auth.ts](src/auth.ts), [src/support.ts](src/support.ts), [src/admin.ts](src/admin.ts), [src/device.ts](src/device.ts), [src/device-sync.ts](src/device-sync.ts), [src/tasks.ts](src/tasks.ts), [src/pairing.ts](src/pairing.ts), [src/triggers.ts](src/triggers.ts), [src/shared.ts](src/shared.ts), [firestore.rules](firestore.rules) und [storage.rules](storage.rules).

## Executive Summary

Das Backend ist insgesamt deutlich reifer als die übrigen Plattformteile. Positiv sind die zentrale Auth- und Audit-Infrastruktur, die konsistente Nutzung von `HttpsError`, Ownership-Prüfungen vor Mutationen und die relativ breite Testabdeckung im Ordner [test](test).

Die höchsten realen Risiken lagen nicht in den Standard-CRUD-Flows, sondern in administrativen und Support-nahen Pfaden:

1. Dev-Reset-Endpunkte waren bei aktivem Reset-Flag auch für beliebige authentifizierte Nicht-Admins nutzbar.
2. Debug-Datenzugriffe akzeptierten leere oder fehlende `debugScope`-Felder implizit als Vollzugriff.
3. Der Gemini-Testendpunkt übergab den API-Key in der Request-URL statt im Header.

Diese drei Punkte wurden im Rahmen dieser Arbeit direkt behoben.

## Angriffsflächen

### 1. Administrative Reset-Endpunkte

Betroffene Stellen:

- [src/auth.ts](src/auth.ts)

Konkrete Endpunkte:

- `resetOperatorAccounts`
- `resetAllAuthUsers`
- `resetAllAuthUsersHealth` als Informationsendpunkt

Bewertung:

- `resetOperatorAccounts` und `resetAllAuthUsers` sind hochkritische destruktive Operationen.
- Das Risiko war nicht die Existenz der Endpunkte, sondern die frühere Berechtigungslogik im aktivierten Dev-Reset-Modus.
- Ein versehentlich gesetztes Env-Flag hätte aus einem reinen Betriebswerkzeug einen privilegierten Missbrauchspfad gemacht.

Umgesetzt:

- `resetOperatorAccounts` verlangt jetzt immer Admin-Rechte.
- `resetAllAuthUsers` verlangt jetzt Admin-Rechte oder einen gültigen Recovery-Token.
- Nicht-Admin-Aufrufe werden explizit mit `permission-denied` abgewiesen.

Restrisiko:

- Die Endpunkte bleiben grundsätzlich gefährlich, solange sie deployt und nur per Environment Flag gesteuert werden.
- Der Recovery-Token bleibt ein Single-Secret-Kontrollmechanismus und braucht saubere Rotation und Secret-Härtung.

### 2. Support-Debug-Zugriff

Betroffene Stellen:

- [src/support.ts](src/support.ts)

Konkreter Pfad:

- `getDebugInfo`

Bewertung:

- Der frühere Code interpretierte fehlende oder leere `debugScope`-Angaben implizit als zulässig.
- Zusätzlich war die Bindung zwischen Ticket und Grant nicht defensiv genug validiert.
- Dadurch entstand ein unnötig großzügiger Datenzugriffspfad für diagnostische Daten.

Umgesetzt:

- `diagnostic_logs` muss jetzt explizit im Grant-Scope enthalten sein.
- Grant und Ticket müssen jetzt zusammenpassen (`ticketId`, `masterImei`).
- Fehlende Scope-Angaben werden nicht mehr als Vollzugriff interpretiert.

Restrisiko:

- Debug-Snapshots aggregieren weiterhin mehrere Datenquellen. Jede Erweiterung von `collectDebugSnapshot` sollte als eigener Privacy-Review behandelt werden.

### 3. Externe Provider-Anbindung

Betroffene Stellen:

- [src/admin.ts](src/admin.ts)
- [src/support.ts](src/support.ts)
- [src/triggers.ts](src/triggers.ts)

Bewertung:

- Die produktiven Gemini-Aufrufe in Support und Triggern verwenden bereits Header-basierte API-Key-Übertragung.
- `testGeminiConnection` war inkonsistent und übergab den Key als Query-Parameter.

Umgesetzt:

- `testGeminiConnection` nutzt jetzt ebenfalls `x-goog-api-key` statt URL-Query.

Restrisiko:

- Fehlertexte externer Provider werden teilweise direkt weitergereicht oder geloggt. Das ist für Admin-Funktionen vertretbar, sollte aber keine Secrets oder interne Details enthalten.

## Weitere Beobachtungen

### Legacy Auth bleibt strukturelles Risiko

Betroffene Stellen:

- [src/auth.ts](src/auth.ts)
- [docs/LEGACY_AUTH_INVENTORY.md](docs/LEGACY_AUTH_INVENTORY.md)
- [docs/AUTH_MIGRATION_PLAN.md](docs/AUTH_MIGRATION_PLAN.md)

Bewertung:

- Die Freeze-Richtlinie ist sauber dokumentiert.
- Technisch existieren die Legacy-Pfade aber weiter und müssen bis zum vollständigen Cutover als erhöhtes Risiko bewertet werden.

### Flaches Firestore-Modell

Betroffene Stellen:

- [firestore.rules](firestore.rules)

Bewertung:

- Das Regelwerk ist nicht schwach, aber die fachliche Trennung bleibt stark an Felder wie `masterImei` gebunden.
- Das erhöht die Bedeutung korrekter Ownership-Prüfungen in Callable Functions.

### Export- und Analyse-Endpunkte

Betroffene Stellen:

- [src/admin.ts](src/admin.ts)

Bewertung:

- `exportUserData`, `analyzeSystemErrors` und `executeAutoFix` sind stark privilegierte Operator-Funktionen.
- Die Zugriffskontrolle ist formal vorhanden, diese Endpunkte sollten aber dauerhaft als besonders sensibel behandelt werden.

## Priorisierte Empfehlungen

### P0

- Legacy-Auth-Cutover aus [docs/AUTH_MIGRATION_PLAN.md](docs/AUTH_MIGRATION_PLAN.md) fortsetzen und neue UI-/Client-Pfade auf reines Firebase Auth umstellen.
- Recovery-Token für All-User-Reset in Secret-Management und Betriebsprozess rotierbar machen.

### P1

- `getDebugInfo` und `collectDebugSnapshot` mit einem dedizierten Datenschutz-Testset absichern.
- Für Reset-Endpunkte zusätzliche Deploy-Barrieren einziehen, zum Beispiel per Projekt-/Environment-Allowlist.

### P2

- Provider-Fehlerbehandlung für Admin-AI-Funktionen vereinheitlichen und Logging auf Datenminimierung prüfen.
- Audit- und Error-Collections per TTL und Retention-Review regelmäßig evaluieren.

## In dieser Arbeit umgesetzte Fixes

- Admin-Pflicht für `resetOperatorAccounts`
- Admin- oder Recovery-Token-Pflicht für `resetAllAuthUsers`
- Explizite Scope-Pflicht und Grant-Bindung in `getDebugInfo`
- Header-basierte API-Key-Übergabe in `testGeminiConnection`
