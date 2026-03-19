# Production Deployment Guide (Current)

Stand: 2026-03-15

Diese Anleitung beschreibt den aktuellen, produktionsnahen Rollout fuer MiniMaster.

## 1. Voraussetzungen

- Firebase Projekt (Blaze Plan)
- Node.js 22
- Firebase CLI (`npm install -g firebase-tools`)
- Zugriff auf GitHub Repo und Secrets

## 2. Projekt vorbereiten

```bash
git clone https://github.com/Toto241/MiniMaster.git
cd MiniMaster
npm install
npm run build
npm run lint
npm test
firebase login
firebase use --add
```

## 3. Firebase Services aktivieren

Im Firebase-Projekt aktivieren:

- Authentication
- Firestore
- Storage
- Cloud Functions
- Cloud Messaging (falls Push genutzt wird)

Android App Registrierungen:

- `com.minimaster.masterapp`
- `com.google.pairing`

## 4. Konfigurationen setzen

### 4.1 Web Konfiguration

In beiden Panels die Platzhalter ersetzen:

- `admin-panel/app.js`
- `web-control/app.js`

Optionales Skript (Bash/WSL/Git Bash):

```bash
./scripts/update-firebase-config.sh
```

### 4.2 AI Support Konfiguration

Empfohlen (primaer):

- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional, Default: `gemini-2.0-flash`)

Fallback:

- `OPENAI_API_KEY`

## 5. Deploy ausfuehren

### Option A: Direkter CLI Deploy

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

### Option B: Repository Skript

```bash
./deploy.sh
```

## 6. Admin Inbetriebnahme

1. Service Account Key lokal als `serviceAccountKey.json` ablegen.
1. Erstadmin erstellen:

```bash
node scripts/setup-admin.js <email> <passwort>
```

1. Login im Operator Dashboard pruefen (`admin-panel/index.html`).

## 7. Produktions-Checks

Nach Deploy mindestens diese Checks ausfuehren:

1. Operator Login und Admin-Claim funktionieren.
1. Cloud Setup & Assistant > Full Validation ohne kritische Fehler.
1. Parent Web Panel Login und Device-Sync funktionieren.
1. Support Ticket Flow inkl. Pflichtfeedback/Kommentar funktioniert.
1. Firestore/Storage Rules sind aktiv und erzwingen Besitz-/Rollenlogik.

## 8. CI/CD Hinweise

Wichtige Workflows:

- `.github/workflows/ci.yml`
- `.github/workflows/android-ci.yml`
- `.github/workflows/deploy.yml`

Hinweis: Gradle Wrapper Validation laeuft ueber `gradle/actions/wrapper-validation@v3`.

## 9. Sicherheit

- Keine Secrets/Keys ins Repo committen (`google-services.json`, Service Account JSON, API Keys).
- GitHub Secrets fuer produktive Deployments verwenden.
- Access Token in Remote URLs vermeiden und bei Leak rotieren.

## 10. Bekannte Grenzen

- Child-App Blocking bleibt als Prototype gekennzeichnet, bis die Enforcement-Phase finalisiert ist.
- Datenmodell bleibt aktuell bewusst "flat" (`masters`, `children`, `subscriptions`, ...), kein `families/*`.

## Referenzen

- `README.md`
- `QUICK_START_GUIDE.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/SECURITY_BEST_PRACTICES.md`
- `FIREBASE_EINRICHTUNG.md`
