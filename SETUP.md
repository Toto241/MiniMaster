# MiniMaster Inbetriebnahme – Konsolidierte Checkliste

Dieses Dokument fasst alle Schritte zusammen, die für eine produktive
Inbetriebnahme zwingend notwendig sind. Es ersetzt das verteilte Lesen in
`README.md`, `QUICK_START_GUIDE.md`, `FIREBASE_EINRICHTUNG.md` und
`PRODUCTION_DEPLOYMENT.md`.

> **Schnelltest:** `npm run preflight` (bzw. `python scripts/preflight.py`)
> sagt jederzeit, was noch fehlt. Exit-Code 0 = Inbetriebnahme bereit.

## TL;DR

```bash
# 1. Lokale Toolchain & Bootstrap
npm run setup            # ruft scripts/setup_init.py
# 2. Externe Schritte (Browser / Firebase-Konsole) – siehe unten
# 3. Erneut prüfen
npm run preflight        # alle Pflichtchecks grün?
# 4. Deploy
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
node scripts/setup-admin.js <email> <pw>
# 5. Betreiber-Dashboard starten
./start.sh               # Linux/macOS
start.bat                # Windows
```

## Lokale Toolchain (Pflicht)

| Tool | Mindestversion | Installation |
|---|---|---|
| Node.js | 22.x | https://nodejs.org/ oder `nvm install 22` |
| npm | 10.x | wird mit Node.js mitinstalliert |
| Python | 3.8+ | https://python.org/ oder Distributionsmanager |
| Firebase CLI | aktuell | `npm install -g firebase-tools` |
| JDK | 17 | nur für Android-Builds (Temurin/AdoptOpenJDK) |
| PowerShell | 7.x (`pwsh`) | Windows oder https://github.com/PowerShell/PowerShell (nur für Release-Gate-Skripte) |

## Externe Schritte (kann das Setup-Skript nicht für dich erledigen)

Diese Schritte erfordern einen Browser, einen Google-Account und teilweise
gebührenpflichtige Verträge. Sie sind im Repo nicht abbildbar.

### A. Firebase-Projekt anlegen
1. https://console.firebase.google.com/ → **+ Projekt hinzufügen**.
2. **Blaze**-Tarif aktivieren (Cloud Functions Pflicht).
3. Aktivieren: **Authentication**, **Firestore**, **Storage**, **Cloud Functions**, **Cloud Messaging**.
4. Android-Apps anlegen:
   - `com.minimaster.masterapp` → `google-services.json` in `masterApp/` speichern.
   - `com.google.pairing` → `google-services.json` in `childApp/` speichern.
5. Web-App anlegen → Konfigurationswerte (apiKey, authDomain, …) notieren.

### B. Service-Account-Key (für `setup-admin.js` und Notfall-Recovery)
**Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel** → Datei als
`serviceAccountKey.json` im Repo-Root ablegen. Wird durch `.gitignore`
ausgeschlossen.

### C. App Check (reCAPTCHA v3)
Firebase Console → **App Check** → reCAPTCHA-v3 für Web-App registrieren →
Site-Key im Setup-Wizard eintragen (landet in `.env` und in jeder
`firebase-config.js`).

### D. AI-Provider
- Google AI Studio: https://aistudio.google.com/ → API-Key generieren →
  `GEMINI_API_KEY` setzen.
- Optional: OpenAI als Fallback (`OPENAI_API_KEY`).

### E. Hosting-Targets (falls noch nicht in Firebase-Console angelegt)
`.firebaserc` referenziert die Sites `minimaster-web-control`,
`minimaster-admin-panel`, `minimaster-parent-panel`, `minimaster-child-panel`.
Falls sie noch nicht existieren: Firebase Hosting → Site hinzufügen, dann
`firebase target:apply hosting <key> <site>`.

## Schritte, die das Setup-Skript automatisiert

`python scripts/setup_init.py` führt der Reihe nach durch:

1. `.env` aus `.env.example` anlegen (idempotent).
2. `npm install` (falls `node_modules/` fehlt).
3. `npm install -g firebase-tools` (falls CLI fehlt).
4. `firebase login` (falls noch nicht eingeloggt).
5. `firebase use --add` (falls `.firebaserc` leer).
6. Firebase-/Secret-Wizard (`scripts.config_transfer_cli`):
   - Schreibt Werte in `.env` und in `firebase-config.js` aller vier Panels
     (`admin-panel/`, `web-control/`, `parent-panel/`, `child-panel/`).
7. Abschluss-Pre-Flight (`scripts/preflight.py`).

Alle Schritte sind opt-in (Y/n) und können einzeln übersprungen werden
(`--skip-install`, `--skip-cli`, `-y` für komplett ohne Rückfragen).

## Pre-Flight (Health-Check)

```bash
python scripts/preflight.py            # menschenlesbar
python scripts/preflight.py --json     # für CI / Skripte
python scripts/preflight.py --strict   # Warnungen zählen als Fehler
```

Geprüft werden:

| Kategorie | Checks |
|---|---|
| Toolchain | Node ≥22, npm, Python ≥3.8, Firebase CLI, JDK 17 |
| Repo-Build | `node_modules/`, `lib/index.js` |
| Konfiguration | `.env`, `serviceAccountKey.json`, `.firebaserc`, App-Check-Key |
| Mobile | `masterApp/google-services.json`, `childApp/google-services.json` |
| Frontend | `firebase-config.js` in allen 4 Panels, keine Platzhalterwerte |
| Firebase | CLI eingeloggt |

Exit-Code 0 = alles grün (oder nur Warnungen). Exit-Code 1 = mindestens
ein Pflichtfehler.

## Erst-Admin anlegen

```bash
node scripts/setup-admin.js admin@example.com SecurePassword123
```

Setzt den Custom-Claim `role: "admin"` am Firebase-Auth-User. Voraussetzung
ist `serviceAccountKey.json` im Repo-Root (siehe **B**).

## Deployment

```bash
# Empfohlen: explizites Teildeploy in der richtigen Reihenfolge
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions
firebase deploy --only hosting
# Oder: Repo-Skript (interaktiv, alle vier Schritte)
./deploy.sh
```

## Betreiber-Dashboard starten

| Plattform | Befehl |
|---|---|
| Windows | `start.bat` |
| Linux / macOS | `./start.sh` |
| Nur Pre-Flight | `./start.sh --preflight` |
| Acceptance-Run | `start.bat --acceptance` bzw. `./start.sh --acceptance` |

Beide Skripte starten den Python-Admin-Server auf `127.0.0.1:8765` und
öffnen `http://127.0.0.1:8765/admin-panel/` im Browser.

## Sicherheits-Konventionen

Niemals committen:
- `.env`, `.env.local`
- `serviceAccountKey.json`
- `masterApp/google-services.json`, `childApp/google-services.json`
- `firebase-config.js` (in jedem Panel-Verzeichnis – enthält API-Keys)

Diese Pfade stehen alle in `.gitignore`. Versioniert bleiben nur die
Templates (`*.template.json`, `*.template.js`).

## Bekannte Grenzen / Restpunkte

- **GitHub-Actions-Billing**: muss vor CodeQL-/Android-CI manuell freigeschaltet werden.
- **Legacy `secretKey`-Cutover** (Stufe 3): wartet auf 14 Tage Nullnutzung
  (automatischer Monitor).
- **iOS-Builds**: erfordern macOS + Xcode + Apple-Team-IDs (siehe
  `iOS_SETUP.md`).
- **OEM-Hardware-E2E** (Samsung/Xiaomi): manuelle Tests laut
  `Testanleitung.md`.

## Referenzen

- `README.md` – Architektur & Feature-Übersicht
- `FIREBASE_EINRICHTUNG.md` – Schritt-für-Schritt Firebase-Konsole (DE)
- `PRODUCTION_DEPLOYMENT.md` – CI/CD-Workflows & Production-Notes
- `RUNBOOK.md` – Betrieb, Incident Response, Rotation
- `docs/SECURITY_BEST_PRACTICES.md` – Sicherheits-Empfehlungen
