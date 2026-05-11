# Release Readiness: offene Stellen und Abschluss-Gates

Stand: 2026-05-11
Scope: MiniMaster Android Parent/Child, Firebase Backend, Web-/Admin-Panels, QA- und Release-Gates.

Diese Datei bündelt die noch offenen P0/P1-Stellen vor einem öffentlichen Release. Sie ergänzt die bestehenden Issues und verhindert, dass Go-Live-Blocker nur verteilt in CI-Logs, QA-Dokumenten oder Einzelissues stehen.

## Status-Legende

| Status | Bedeutung |
|--------|-----------|
| `blocked-external` | Nicht per Code lösbar; erfordert Repository-/Account-/Store-/Firebase-Einstellung |
| `code-ready` | Code-/Workflow-Vorbereitung vorhanden, wartet auf externe Aktivierung oder echten Lauf |
| `needs-evidence` | Implementierung vorhanden oder vorbereitet, aber belastbarer Nachweis fehlt |
| `open` | Umsetzung noch offen |
| `done` | Erledigt und nachgewiesen |

## P0/P1-Gates vor Release

| Gate | Priorität | Status | Quelle/Issue | Abschlusskriterium |
|------|-----------|--------|--------------|--------------------|
| GitHub Actions Billing/Spending Limit | P0 | `blocked-external` | #161 | Actions laufen wieder auf PRs und `main`; neue Workflow-Runs sind sichtbar |
| GitHub Code Scanning aktivieren | P0 | `blocked-external` | #158 | CodeQL SARIF-Upload akzeptiert; CodeQL-Jobs laufen ohne temporäres `continue-on-error` |
| Legacy `secretKey`-Auth vollständig abschalten | P1 | `needs-evidence` | #162 | `DISABLE_LEGACY_SECRETKEY_AUTH=true` ist produktiv gesetzt; Bootstrap-/Session-Flows funktionieren; Rollback-Flag dokumentiert |
| Android 10-16 Zwei-Geräte-QA | P1 | `needs-evidence` | #163 | Matrix enthält Parent+Child auf Android 10, 11, 12, 13, 14, 15, 16; Pairing, Lock/Unlock, Tasks, Offline, Push/Sync sind belegt |
| Production Firebase/App Check/Play Console | P1 | `blocked-external` | #164 | Produktionsprojekt, Secrets, App Check Provider, Billing-Produkte, RTDN/PubSub und echte `google-services.json` sind gesetzt |
| Rechtstexte und Market-Go/No-Go | P1 | `blocked-external` | #165 | AGB/Privacy/Impressum/Consent/Store Claims sind final geprüft; Policy-Versionen und Re-Consent sind gesetzt |
| iOS-Lokalisierung validieren | P2 | `blocked-external` | #166 | `swift test` und `swift build` für iOS Parent/Child laufen auf macOS/Xcode-Agent und Evidence ist angehängt |

## Bereits durch diesen Branch verbessert

| Bereich | Änderung | Erwarteter Nutzen |
|---------|----------|-------------------|
| Android CI | Instrumentation-Test-APKs werden jetzt im Android-CI-Workflow gebaut | Der bisherige reine Echo-Schritt wird zu einem echten Build-Gate; Artefakte können als QA-Nachweis verwendet werden |
| Android CI | APK-Ausgaben werden zusammen mit Reports hochgeladen | QA- und Release-Evidence kann aus dem Workflow-Lauf entnommen werden |

## Noch bewusst nicht automatisch geändert

### CodeQL `continue-on-error`

Das Entfernen von `continue-on-error` in `.github/workflows/codeql-analysis.yml` ist erst sinnvoll, nachdem Code Scanning im Repository aktiviert wurde. Solange GitHub SARIF-Uploads ablehnt, würde ein korrekt laufender CodeQL-Scan den PR weiterhin rot markieren. Nach Aktivierung muss diese temporäre Ausnahme entfernt werden.

Abschlussaktion nach Aktivierung:

```yaml
# .github/workflows/codeql-analysis.yml
# Entfernen:
continue-on-error: true
```

### Echte Produktions-Secrets und Firebase-Dateien

Echte `google-services.json`, App-Check-Schlüssel, Play-Console-/Billing-Konfigurationen und RTDN-/PubSub-Verknüpfungen dürfen nicht aus Platzhalterdaten generiert werden. Sie müssen aus den produktiven Konsolen stammen und dürfen nicht versehentlich als Secret im Repository landen, sofern sie dafür nicht vorgesehen sind.

## Manuelle Abschlussreihenfolge

1. GitHub Actions Billing/Spending Limit beheben.
2. Code Scanning aktivieren.
3. Diesen Branch/PR laufen lassen und Android-/Node-/CodeQL-Ergebnisse prüfen.
4. Nach erfolgreichem CodeQL-Upload `continue-on-error` aus CodeQL entfernen.
5. Lokale Sicherheits-Härtung finalisieren:
   - VS Code/Electron-Prozesse schließen.
   - Root: `npm install` oder `npm ci` je nach Lockfile-Strategie.
   - Desktop: `cd desktop && npm install`.
   - `npm run validate:readiness`.
6. Android 10-16 Zwei-Geräte-QA ausführen und Evidence im QA-Register ablegen.
7. Production Firebase/App Check/Play Console final konfigurieren.
8. Rechtstexte, Consent-Versionen und Store-Claims final freigeben.

## Definition of Done für öffentlichen Release

Ein Release gilt erst als freigabefähig, wenn alle folgenden Punkte erfüllt sind:

- Alle P0-Gates stehen auf `done`.
- Alle P1-Gates stehen auf `done` oder haben eine dokumentierte, akzeptierte Go/No-Go-Freigabe.
- `npm run ci:revalidate` und `npm run validate:readiness` laufen ohne offene Blocker.
- Android Parent/Child sind auf der geforderten Android-10-bis-16-Matrix nachgewiesen.
- Produktions-Firebase, App Check und Store/Billing sind nicht mehr mit Platzhaltern verbunden.
- Rechtliche Texte und Consent-Flows sind versioniert und in der App nachvollziehbar.
