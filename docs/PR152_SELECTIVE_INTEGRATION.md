# Selective Integration of PR #152 — Admin Panel, Legal and QA Ideas

Stand: 2026-04-24

Dieser Patch uebernimmt PR #152 **nicht als Ganzes**. PR #152 ist gegenueber `main` divergiert, hat fehlgeschlagene CI-Laeufe und wuerde sicherheitsrelevante Verbesserungen aus spaeteren PRs teilweise zurueckdrehen. Stattdessen werden nur risikoarme und fachlich sinnvolle Bestandteile selektiv integriert.

## 1. Nicht als Ganzes mergen

PR #152 darf nicht direkt gemerged werden, solange folgende Punkte bestehen:

- Branch ist gegenueber `main` divergiert.
- CI, Android CI, Node CI, Firestore Rules CI und CodeQL waren auf dem PR-Head fehlgeschlagen.
- `.eslintrc.js` wird abgeschwaecht.
- Security-/Resilience-Dateien werden geloescht oder zurueckgebaut.
- Firestore Rules und Indexe werden massiv geaendert.
- Monetarisierungsfunktionen werden geloescht, obwohl diese fachlich nicht verbindlich abgekündigt wurden.

## 2. Selektiv uebernommen

| Bereich | Uebernahme | Begruendung |
|---|---|---|
| Country Rollout Roadmap | Ja, als Planungsdokument | Risikoarm, hilfreich fuer Internationalisierung und Release-Planung |
| P1 Legal-Dokumentenbedarf | Ja, als Draft-/Review-Inventar | Hilft, Laenderpakete zu strukturieren, aber nicht produktionsrechtlich final |
| QA Artifact Explorer Idee | Ja, als Folgeanforderung im Admin-QA-Audit-Kontext | Passt zum bestehenden QA-Reiter, muss aber gegen bestehende Suites umgesetzt werden |
| Release Evidence Export Idee | Ja, als Folgeanforderung | Passt zu `RELEASE_EVIDENCE_REGISTER.md` und Fertigungsstands-Gates |
| Keyboard Shortcuts / responsive nav | Ja, als Folgeanforderung | UI-Verbesserung, sofern sie keine alten Funktionen wieder aktiviert |
| FR/ES/IT Android Strings | Ja, als Folgeanforderung | Sinnvoll, aber nur nach Ressourcen-/Build-Pruefung |

## 3. Explizit nicht uebernommen

| Bereich | Entscheidung | Grund |
|---|---|---|
| `.eslintrc.js` aus PR #152 | Nicht uebernehmen | Wuerde Security- und TypeScript-Regeln abschwaechen |
| Loeschung von `src/validation.ts` | Nicht uebernehmen | Rueckbau des Security-Hardening |
| Loeschung von `src/resilience.ts` | Nicht uebernehmen | Rueckbau von Stabilitaetsmechanismen |
| Loeschung von `src/rate-limiter.ts` | Nicht uebernehmen | Rueckbau von Abuse-Schutz |
| Loeschung von `src/error-handler.ts` | Nicht uebernehmen | Rueckbau von Monitoring/Fehlerbehandlung |
| Loeschung der zugehoerigen Tests | Nicht uebernehmen | Wuerde Testabdeckung verschlechtern |
| Firestore Rules/Indexes Rueckbau | Nicht uebernehmen | Zu hohes Risiko fuer Zugriffsschutz und produktive Abfragen |
| Monetarisierungs-Tabs pauschal entfernen | Nicht uebernehmen | Nur nach fachlicher Abkuendigungsentscheidung |

## 4. Neue Schutzregel

`scripts/pr152_selective_guard.py` prueft, dass die gefaehrlichen Rueckschritte aus PR #152 nicht in `main` landen:

- Security-Module muessen vorhanden bleiben.
- Security-/Resilience-Tests muessen vorhanden bleiben.
- ESLint-Security- und TypeScript-Strictness duerfen nicht abgeschwaecht werden.
- Firestore Rules/Indexes duerfen nicht offensichtlich auf einen Minimalstand zurueckfallen.

Ausfuehrung:

```bash
npm run guard:pr152
```

## 5. Naechster Code-Schritt

Die funktionalen Ideen aus PR #152 sollen separat und klein umgesetzt werden:

1. `feat(admin-qa): QA Artifact Explorer auf bestehendem QA-Reiter`
2. `feat(release): Release Evidence Export als bestehende Evidence-Erweiterung`
3. `feat(admin-ui): Keyboard Shortcuts und responsive Navigation`
4. `docs(legal): P1 Legal Drafts nach juristischer Pruefung erweitern`
5. `feat(i18n): FR/ES/IT Android Strings mit Build-Test`

Jeder Folge-PR muss auf aktuellem `main` basieren, darf keine Security-Hardening-Dateien entfernen und muss `npm run guard:pr152` bestehen.
