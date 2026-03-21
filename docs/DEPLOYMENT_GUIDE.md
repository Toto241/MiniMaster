# MiniMaster Deployment Guide (aktualisiert)

Stand: 2026-03-15

Diese Anleitung beschreibt den aktuellen Deploy- und Inbetriebnahmepfad fuer Backend, Hosting und Operator-Setup.

## 1. Voraussetzungen

1. Firebase-Projekt mit Blaze-Tarif
2. Firebase CLI installiert (`npm install -g firebase-tools`)
3. Node.js 22
4. Lokaler Checkout von `main`

## 2. Lokale Vorbereitung

```bash
npm install
npm run build
npm run lint
npm test
firebase login
firebase use --add
```

## 3. Firebase-Konfiguration

In der Firebase Console aktivieren:

1. Authentication
2. Firestore
3. Storage
4. Functions

Android Apps registrieren:

1. `com.minimaster.masterapp`
2. `com.google.pairing`

## 4. Web-Konfiguration

Die Platzhalter in `admin-panel/app.js` und `web-control/app.js` muessen mit dem echten `firebaseConfig` ersetzt werden.

Optionales Hilfsskript (Bash/WSL/Git Bash):

```bash
./scripts/update-firebase-config.sh
```

## 5. Umgebungsvariablen (Cloud Functions)

Alle Variablen sind in [`.env.example`](../.env.example) dokumentiert. Für den Produktionsbetrieb müssen sie als **Firebase Secrets** oder **Umgebungsvariablen** gesetzt werden.

### Variablen-Übersicht

| Variable | Erforderlich | Fallback | Verwendung |
|----------|:---:|---------|-----------|
| `GEMINI_API_KEY` | ✅ ja | – | Gemini-Assistent, Support-KI, FCM-Analyse |
| `GEMINI_MODEL` | nein | `gemini-2.0-flash` | Modellauswahl Gemini |
| `OPENAI_API_KEY` | nein | – | Support-Ticket-Fallback |
| `OPENAI_FALLBACK_ENABLED` | nein | `false` | OpenAI-Fallback einschalten |
| `LEGAL_POLICY_BASE_URL` | nein | `https://minimaster.app/legal` | Privacy-Policy / AGB Basis-URL |
| `PAIRING_LINK_BASE_URL` | nein | `https://minimaster.app/pair` | Kopplungslink-Basis-URL |
| `DISABLE_LEGACY_SECRETKEY_AUTH` | nein | `false` | Legacy-IMEI-Auth abschalten |
| `KNOWLEDGE_BASE_PATH` | nein | `./knowledge_base.txt` | Support-Wissensbasis |

### Variablen setzen (Firebase Gen 1)

```bash
# Secrets (empfohlen für API-Keys) – verschlüsselt in Secret Manager
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set OPENAI_API_KEY

# Konfigurationsvariablen (nicht-sensitiv) – als functions.config oder .env
# Option A: .env-Datei (lokal + Deployment via --dotenv)
cp .env.example .env
# .env befüllen, dann:
firebase deploy --only functions

# Option B: firebase functions:config (Legacy, weiterhin unterstützt)
firebase functions:config:set \
  app.legal_policy_base_url="https://minimaster.app/legal" \
  app.pairing_link_base_url="https://minimaster.app/pair"
```

### Lokal (Emulator)

```bash
cp .env.example .env
# .env befüllen (GEMINI_API_KEY etc.)
firebase emulators:start
```

## 6. AI-Konfiguration (Support)

Fuer automatische Ticket-Loesung:

1. Primär: `GEMINI_API_KEY`
2. Optional: `GEMINI_MODEL` (Default: `gemini-2.0-flash`)
3. Fallback: `OPENAI_API_KEY`

## 6. Deployment ausfuehren

Alles zusammen:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

Oder per Script:

```bash
./deploy.sh
```

## 7. Operator/Admin freischalten

Erstadmin erstellen (lokaler Service Account Key als `serviceAccountKey.json` im Projektroot erforderlich):

```bash
node scripts/setup-admin.js <email> <passwort>
```

Danach Login im Operator-Dashboard pruefen (`admin-panel/index.html`).

## 8. Validierung nach Deploy

1. Operator-Dashboard Login (Admin-Claim)
2. Cloud Setup & Assistant Tab: Full Validation starten
3. Parent Web Panel Login und Device-Sync pruefen
4. Support-Ticket-Workflow inkl. Feedback-Pflicht pruefen

## 9. CI/CD Hinweise

1. Gradle-Wrapper-Validierung laeuft ueber `gradle/actions/wrapper-validation@v3`
2. Workflows:
   - `.github/workflows/ci.yml`
   - `.github/workflows/android-ci.yml`
   - `.github/workflows/deploy.yml`

## 10. Bekannte Grenzen

1. Child-App-Blocking ist weiterhin als Prototype gekennzeichnet (siehe `ACCESSIBILITY_SERVICE_GUIDE.md` und `ARCHITECTURE.md`).
2. Firestore-Datenmodell ist bewusst flat (`masters`, `children`, ...), kein `families/*`.
