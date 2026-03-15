# MiniMaster - Quick Start (aktueller Stand)

Diese Anleitung bringt ein neues Operator-Setup schnell auf einen lauffaehigen Stand.

## 1. Repository klonen

```bash
git clone https://github.com/Toto241/MiniMaster.git
cd MiniMaster
```

## 2. Abhaengigkeiten installieren und Projekt pruefen

```bash
npm install
npm run build
npm run lint
npm test
```

## 3. Firebase-Projekt vorbereiten

1. Projekt in der Firebase Console erstellen.
2. Services aktivieren:
    - Authentication
    - Firestore
    - Storage
    - Functions
3. Android-Apps registrieren:
    - Master App: `com.minimaster.masterapp`
    - Child App: `com.google.pairing`
4. Je App die passende `google-services.json` lokal ablegen:
    - `masterApp/google-services.json`
    - `childApp/google-services.json`

Wichtig: Die JSON-Dateien sind geheim und bleiben lokal.

## 4. Web-Konfiguration setzen

Option A (Script, Bash/WSL/Git Bash):

```bash
./scripts/update-firebase-config.sh
```

Option B (manuell):

1. `admin-panel/app.js` und `web-control/app.js` oeffnen.
2. Die Platzhalter in `firebaseConfig` durch echte Projektwerte ersetzen.

## 5. AI Provider konfigurieren (Support-Automation)

MiniMaster nutzt Gemini bevorzugt, OpenAI als Fallback.

Setze die Umgebungsvariablen lokal oder in deinem Deploy-Umfeld:

```bash
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash

# optionaler Fallback
OPENAI_API_KEY=...
```

## 6. Erstes Admin-Konto erstellen

Service Account Key lokal als `serviceAccountKey.json` im Projektroot ablegen und danach:

```bash
node scripts/setup-admin.js <admin-email> <admin-passwort>
```

## 7. Deployment

Schnellweg:

```bash
./deploy.sh
```

Oder gezielt mit Firebase CLI:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

## 8. UIs starten und pruefen

1. Operator Panel: `admin-panel/index.html` (Hosting-URL)
2. Parent Web Panel: `web-control/index.html` (Hosting-URL)
3. Desktop Launcher (Electron):

```bash
npm run desktop-start
```

## Weiterfuehrende Doku

- `README.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `PRODUCTION_DEPLOYMENT.md`
- `docs/SECURITY_BEST_PRACTICES.md`
