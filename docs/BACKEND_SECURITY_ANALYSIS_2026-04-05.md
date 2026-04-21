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

In einer zweiten Härtungsrunde wurden zusätzlich zwei weitere Maßnahmen umgesetzt:

1. Recovery- und Legacy-Secret-Vergleiche in [src/auth.ts](src/auth.ts) laufen jetzt über einen konstanten Vergleich statt einfacher String-Gleichheit.
2. Mehrere mutierende Device-Endpunkte in [src/device.ts](src/device.ts) erzwingen jetzt konsistent App Check.

In einer dritten Härtungsrunde wurden zusätzlich zwei weitere Maßnahmen umgesetzt:

1. Privilegierte Admin- und Operator-Callables in [src/admin.ts](src/admin.ts) erzwingen jetzt konsistent App Check.
2. Die App-Check-Initialisierung im [admin-panel/appcheck-init.js](admin-panel/appcheck-init.js) wurde an den produktionsnäheren Modus aus [web-control/appcheck-init.js](web-control/appcheck-init.js) angeglichen.

In einer vierten Härtungsrunde wurden zusätzlich zwei weitere Maßnahmen umgesetzt:

1. Sensible Support-Callables in [src/support.ts](src/support.ts) erzwingen jetzt ebenfalls konsistent App Check.
2. Der Operator-Assistent `aiExplainProblem` wurde zusätzlich mit einem dedizierten Rate Limit versehen.

In einer fünften Härtungsrunde wurden zusätzlich zwei weitere Maßnahmen umgesetzt:

1. Die un-authentifizierten Legacy-Branches in [src/auth.ts](src/auth.ts) erzwingen jetzt App Check.
2. Die Legacy-Pfade `generateCustomToken` und `registerMasterDevice` haben zusätzliche Missbrauchsgrenzen über lokale Rate Limits erhalten.

In einer sechsten Härtungsrunde wurden zusätzlich zwei weitere Maßnahmen umgesetzt:

1. Die destruktiven Reset-Endpunkte in [src/auth.ts](src/auth.ts) sind jetzt zusätzlich über eine Projekt-Allowlist für Deployments abgesichert.
2. Auch Reset-Aufrufe mit Admin-Kontext oder Recovery-Token erzwingen jetzt App Check, und [src/auth.ts](src/auth.ts) stellt den Guard-Status im Health-Endpunkt transparenter bereit.

In einer siebten Härtungsrunde wurde zusaetzlich ein unmittelbar bestaetigter Web-Pfad entschaerft:

1. Das Ticket-Rendering im [child-panel/index.html](child-panel/index.html) verwendet fuer Support-Tickets und Fehlerzustaende jetzt DOM-APIs statt zusammengebauter `innerHTML`-Strings.

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
- Beide destruktiven Reset-Endpunkte erzwingen jetzt zusätzlich App Check.
- Außerhalb von Emulator/Test werden destruktive Resets nur noch erlaubt, wenn das aktuelle Projekt explizit in `MINIMASTER_RESET_ALLOWED_PROJECTS` bzw. `RESET_ALLOWED_PROJECTS` freigeschaltet ist.
- `resetAllAuthUsersHealth` liefert jetzt zusätzlich Informationen zum aktuellen Projekt und zum aktiven Deployment-Guard.

Restrisiko:

- Die Endpunkte bleiben grundsätzlich gefährlich, solange sie deployt und nur per Environment Flag gesteuert werden.
- Der Recovery-Token bleibt ein Single-Secret-Kontrollmechanismus und braucht saubere Rotation und Secret-Härtung.
- Die Projekt-Allowlist ist ein wichtiger Betriebsriegel, ersetzt aber keine Secret-Rotation und keine getrennten Administrationsumgebungen.

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

### 4. Support- und Ticket-Callables

Betroffene Stellen:

- [src/support.ts](src/support.ts)

Konkrete Pfade:

- `createSupportTicket`
- `grantSupportAccess`
- `revokeSupportAccess`
- `analyzeWithDebugData`
- `grantDebugAccess`
- `skipDebugMode`
- `processUserReplyMessage`
- `getDebugInfo`
- `provideSolutionFeedback`
- `getTicketUserData`
- `aiExplainProblem`

Bewertung:

- Diese Callables verarbeiten entweder sensible Support- und Diagnosedaten oder triggern externe KI-/Mail-Pfade.
- Vor der Härtung war die Rollen- und Ownership-Logik weitgehend vorhanden, aber die Herkunft des Aufrufs war nicht über App Check abgesichert.
- Besonders `createSupportTicket` und `aiExplainProblem` waren dadurch anfälliger für Missbrauch durch automatisierte oder nicht legitimierte Clients.

Umgesetzt:

- App Check wird jetzt auf den sensiblen Support-Callables konsistent erzwungen.
- `aiExplainProblem` hat zusätzlich ein dediziertes Rate Limit erhalten, um Missbrauch des externen KI-Pfads zu begrenzen.

Restrisiko:

- Rate Limits sind aktuell in-memory und damit instanzlokal. Für harte Missbrauchsgrenzen sollte mittelfristig ein persistenter oder edge-naher Mechanismus ergänzt werden.

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

Umgesetzt:

- Die un-authentifizierten Legacy-Zweige von `generateCustomToken` und `registerMasterDevice` erzwingen jetzt App Check.
- Beide Legacy-Zweige haben zusätzlich lokale Rate Limits erhalten, um Brute-Force- und Enumerationsdruck zu senken.

Restrisiko:

- Die Rate Limits sind wie an anderer Stelle aktuell in-memory und damit nicht global wirksam.
- Die Legacy-Pfade bleiben fachlich weiter vorhanden; die Härtung reduziert Missbrauch, ersetzt aber keinen vollständigen Cutover.
- Fuer den Web-Cutover existiert bereits der sichere Browser-Pfad ueber `createMasterWebBootstrapToken` und `redeemMasterWebBootstrapToken`, aber im aktuell geprueften Frontend ist noch kein vollstaendig belegter Erzeuger-Flow fuer Endnutzer sichtbar. Ein harter Backend-Schnitt ohne diesen UI-Pfad wuerde bestehende Browser-Anmeldungen still brechen.

### Korrigierte Einordnung angrenzender Frontend-Befunde

Bewertung:

- Die fruehere Annahme, im Electron-Desktop fehle eine explizite `contextIsolation`, trifft auf den geprueften Stand nicht zu. [desktop/main.js](desktop/main.js) setzt `contextIsolation: true` bereits explizit.
- Die pauschale SRI-Kritik fuer das Web-Control-Panel war zu breit. [web-control/index.html](web-control/index.html) nutzt fuer seine externen Skripte bereits Integrity-Attribute.
- Ein echter, unmittelbar bestaetigter DOM-XSS-Pfad lag dagegen im [child-panel/index.html](child-panel/index.html) vor und wurde deshalb priorisiert adressiert.

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

Umgesetzt:

- App Check wird jetzt zusätzlich auf privilegierten Admin-Callables wie `deleteUserAccount`, `adminHealthCheck`, `testGeminiConnection`, `getKnowledgeBase`, `updateKnowledgeBase`, `sendTestFcmMessage`, `triggerScheduledJob` und `analyzeSystemErrors` erzwungen.
- Das Admin-Panel kann denselben lokal konfigurierten Site-Key-Mechanismus wie das Web-Control-Panel verwenden und ist damit nicht mehr auf einen fest einkodierten Platzhalter angewiesen.

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
- Konstante Secret-Vergleiche für Recovery-Token und Legacy-`secretKey` in `generateCustomToken`
- App-Check-Erzwingung für mutierende Device-Callables wie `updateAppBlacklist`, `setUsageRules`, `recordHeartbeat`, `registerFcmToken`, `updateFCMToken`, `reportDailyUsage` und `reportTamperEvent`
- App-Check-Erzwingung für privilegierte Admin-Callables wie `deleteUserAccount`, `adminHealthCheck`, `testGeminiConnection`, `getKnowledgeBase`, `updateKnowledgeBase`, `sendTestFcmMessage`, `triggerScheduledJob` und `analyzeSystemErrors`
- Angleichung von [admin-panel/appcheck-init.js](admin-panel/appcheck-init.js) an die operative Site-Key-Konfiguration aus [web-control/appcheck-init.js](web-control/appcheck-init.js)
- App-Check-Erzwingung für sensible Support-Callables wie `createSupportTicket`, `analyzeWithDebugData`, `grantDebugAccess`, `processUserReplyMessage`, `getTicketUserData` und `aiExplainProblem`
- Dediziertes Rate Limit für den Operator-Assistenten `aiExplainProblem`
- App-Check-Erzwingung für die un-authentifizierten Legacy-Zweige von `generateCustomToken` und `registerMasterDevice`
- Lokale Rate Limits für die Legacy-Pfade `generateCustomToken` und `registerMasterDevice`
- Deployment-Allowlist und App-Check-Erzwingung für die destruktiven Reset-Endpunkte `resetOperatorAccounts` und `resetAllAuthUsers`
- Erweiterter Guard-Status im Health-Endpunkt `resetAllAuthUsersHealth`
