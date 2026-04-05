# Prioritized Gap Analysis 2026-04-05

## Zielbild

Die wichtigsten offenen Punkte wurden nach Sicherheitswirkung, Betriebsrisiko und technischer Hebelwirkung priorisiert. Bereits in dieser Arbeit geschlossene Punkte sind separat markiert.

## Bereits umgesetzt

### Closed now

- Nicht-Admin-Nutzung destruktiver Reset-Endpunkte blockiert in [src/auth.ts](src/auth.ts)
- Expliziter `diagnostic_logs`-Scope für Debug-Daten erzwungen in [src/support.ts](src/support.ts)
- Grant/Ticket-Bindung für Debug-Zugriff abgesichert in [src/support.ts](src/support.ts)
- Gemini-Testcall auf Header-basierte API-Key-Übertragung umgestellt in [src/admin.ts](src/admin.ts)
- Recovery-Token- und Legacy-Secret-Vergleiche gegen Timing-Angriffe gehärtet in [src/auth.ts](src/auth.ts)
- App Check auf mutierenden Device-Endpunkten konsistent erzwungen in [src/device.ts](src/device.ts)
- App Check auf privilegierten Admin-/Operator-Endpunkten konsistent erzwungen in [src/admin.ts](src/admin.ts)
- App-Check-Initialisierung im [admin-panel/appcheck-init.js](admin-panel/appcheck-init.js) an den Web-Control-Betriebsmodus angeglichen
- App Check auf sensiblen Support-Endpunkten konsistent erzwungen in [src/support.ts](src/support.ts)
- Operator-Assistent `aiExplainProblem` mit zusätzlichem Rate Limit abgesichert in [src/support.ts](src/support.ts)
- Un-authentifizierte Legacy-Auth-Zweige mit App Check abgesichert in [src/auth.ts](src/auth.ts)
- Legacy-Login- und Registrierungszweige mit lokalen Rate Limits begrenzt in [src/auth.ts](src/auth.ts)

## Offene Lücken nach Priorität

### P0 – als Nächstes umsetzen

1. Legacy-Auth abbauen
   Betroffene Stellen:
   [src/auth.ts](src/auth.ts), [docs/LEGACY_AUTH_INVENTORY.md](docs/LEGACY_AUTH_INVENTORY.md), [docs/AUTH_MIGRATION_PLAN.md](docs/AUTH_MIGRATION_PLAN.md)

   Warum hoch:
   Solange `secretKey`-/IMEI-Pfade produktiv mitlaufen, bleibt ein strukturelles Altlast-Risiko bestehen.

   Status:
   Die un-authentifizierten Altpfade sind jetzt durch App Check und lokale Rate Limits eingeengt. Offen bleibt weiterhin der eigentliche Abbau dieser Pfade aus den Web- und Client-Flows.

2. Reset-Endpunkte betrieblich härten
   Betroffene Stellen:
   [src/auth.ts](src/auth.ts)

   Warum hoch:
   Die Code-Härtung ist jetzt besser, aber Environment-Flags und Recovery-Token bleiben operativ kritisch.

   Status:
   App Check und eine Projekt-Allowlist-Barriere für Deployments sind jetzt eingezogen. Offen bleiben vor allem Recovery-Token-Rotation, klar getrennte Betriebsumgebungen und strengere organisatorische Freigabepfade.

3. Debug-Datensatz minimieren und explizit testen
   Betroffene Stellen:
   [src/support.ts](src/support.ts)

   Warum hoch:
   Der Scope-Check ist jetzt sauber, aber die Snapshot-Inhalte sollten explizit auf Notwendigkeit und Datenschutz geprüft werden.

### P1 – direkt danach

1. Device-Sync-Reihenfolge und Konfliktstrategie härten
   Betroffene Stellen:
   [src/device-sync.ts](src/device-sync.ts)

   Warum:
   Der Kontrollkanal ist funktional stark, aber Ordering- und Replay-Verhalten sind ein kritischer Langfrist-Hotspot.

2. Support-/AI-Fehlerpfade weiter begrenzen
   Betroffene Stellen:
   [src/support.ts](src/support.ts), [src/admin.ts](src/admin.ts), [src/triggers.ts](src/triggers.ts)

   Warum:
   Externe Provider, Timeout-Verhalten und Rohfehlertexte sollten weiter vereinheitlicht werden.

   Status:
   App Check und ein erstes Rate Limit sind jetzt auch auf der Support-Seite eingezogen. Offen bleiben vor allem persistentere Missbrauchsgrenzen, Reply-/Mail-Flows und ein konsequent minimiertes Fehler- und Provider-Logging.

3. Firestore-Migrationspfad vorbereiten
   Betroffene Stellen:
   [firestore.rules](firestore.rules), [ARCHITECTURE.md](ARCHITECTURE.md)

   Warum:
   Das flache Modell funktioniert, skaliert aber organisatorisch und sicherheitstechnisch schlechter als ein sauberes Familien-/Tenant-Modell.

### P2 – mittelfristig

1. iOS-Build-Kette operativ anheben
   Betroffene Stellen:
   [iosChildApp](iosChildApp), [iosMasterApp](iosMasterApp), [.github/workflows/ios-ci.yml](.github/workflows/ios-ci.yml)

2. Security-Regression-Sets systematisieren
   Betroffene Stellen:
   [test](test)

3. Admin-Funktionen mit strengeren Betriebsgrenzen versehen
   Betroffene Stellen:
   [src/admin.ts](src/admin.ts)

   Status:
   App Check wird jetzt für die wichtigsten privilegierten Admin-Callables erzwungen. Offen bleiben vor allem weitere betriebliche Grenzen wie feinere Rate Limits, engere Allowlists und klarere Trennung zwischen Lese- und Mutationspfaden.

## Empfohlene Reihenfolge

1. Legacy Auth aus Client- und Web-Login-Flows herausziehen
2. Recovery-Token-Rotation und Deploy-Barrieren für Reset-Endpunkte einführen
3. Debug-Snapshot auf minimales Datenmodell reduzieren und mit Privacy-Tests absichern
4. Device-Sync-Konflikt- und Ordering-Modell schärfen
5. Firestore-Modellmigration vorbereiten

## Validierungsstand

Die in dieser Arbeit geänderten Hochrisiko-Pfade wurden mit folgenden Suiten geprüft:

- [test/auth-operator-coverage.test.ts](test/auth-operator-coverage.test.ts)
- [test/branch-coverage-auth.test.ts](test/branch-coverage-auth.test.ts)
- [test/legal-admin-support-coverage.test.ts](test/legal-admin-support-coverage.test.ts)
- [test/branch-coverage-support-gaps.test.ts](test/branch-coverage-support-gaps.test.ts)
- [test/branch-coverage-boost.test.ts](test/branch-coverage-boost.test.ts)
- [test/branch-coverage-wave3.test.ts](test/branch-coverage-wave3.test.ts)
- [test/branch-coverage-support.test.ts](test/branch-coverage-support.test.ts)
- [test/branch-coverage-legacy-auth.test.ts](test/branch-coverage-legacy-auth.test.ts)
- [test/branch-coverage-auth-gaps.test.ts](test/branch-coverage-auth-gaps.test.ts)

Ergebnis zum Zeitpunkt der Analyse:

- 18 gezielte Test-Suiten grün
- 612 gezielte Tests grün
