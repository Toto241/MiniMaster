# Firebase-Projekt Einrichtung und Konfiguration

Schritt-für-Schritt-Anleitung: Firebase-Projekt einrichten und `google-services.json` herunterladen

## Vorbemerkung
Sie benötigen ein Google-Konto, um auf die Firebase Console zuzugreifen.

## Teil 1: Neues Firebase-Projekt erstellen

### 1. Zur Firebase Console gehen
- Öffnen Sie Ihren Webbrowser und navigieren Sie zu: **https://console.firebase.google.com/**
- Melden Sie sich mit Ihrem Google-Konto an.

### 2. Projekt hinzufügen
- Auf der Startseite der Firebase Console klicken Sie auf die große Kachel **"+ Projekt hinzufügen"**.

### 3. Projektnamen eingeben
- Geben Sie einen Namen für Ihr Firebase-Projekt ein (z. B. **"MiniMasterApp"**).
- Klicken Sie auf **"Weiter"**.

### 4. Google Analytics aktivieren (optional, aber empfohlen)
- Lassen Sie die Option **"Google Analytics für dieses Projekt aktivieren"** eingeschaltet und klicken Sie auf **"Weiter"**.
- Wählen Sie ein Google Analytics-Konto (oder erstellen Sie ein neues) und klicken Sie auf **"Projekt erstellen"**.
- Warten Sie einen Moment, bis Firebase Ihr Projekt erstellt hat. Klicken Sie dann auf **"Weiter"**.

## Teil 2: Firebase-Services aktivieren

### 1. Authentication (Authentifizierung) aktivieren
- Gehen Sie in der linken Seitenleiste zu **"Authentication"**
- Klicken Sie auf **"Loslegen"**
- Wechseln Sie zum Tab **"Sign-in method"**
- Aktivieren Sie die gewünschten Anmeldeverfahren (z.B. **"E-Mail/Passwort"**)

### 2. Firestore Database einrichten
- Gehen Sie in der linken Seitenleiste zu **"Firestore Database"**
- Klicken Sie auf **"Datenbank erstellen"**
- Wählen Sie **"Im Produktionsmodus starten"** (empfohlen für Sicherheit)
- Wählen Sie eine Region aus (idealerweise die Ihren Benutzern nächstgelegene, z.B. **"europe-west1"**)

### 3. Cloud Storage aktivieren
- Gehen Sie in der linken Seitenleiste zu **"Storage"**
- Klicken Sie auf **"Loslegen"**
- Wählen Sie dieselbe Region wie bei Firestore

### 4. Cloud Functions (wird automatisch aktiviert)
- Cloud Functions werden automatisch aktiviert, wenn Sie das Backend bereitstellen

## Teil 3: Android Apps zum Projekt hinzufügen

### 1. Master App (Eltern-App) hinzufügen

1. Klicken Sie auf der Projektübersicht auf das **Android-Symbol** oder gehen Sie zu **"Projekteinstellungen"** > **"Allgemein"** > **"Ihre Apps"**
2. Klicken Sie auf **"App hinzufügen"** > **Android**
3. Geben Sie die **Package-Name** ein: `com.minimaster.masterapp`
4. Geben Sie einen **App-Spitznamen** ein: `Master App`
5. Klicken Sie auf **"App registrieren"**

### 2. google-services.json für Master App herunterladen

1. Klicken Sie auf **"google-services.json herunterladen"**
2. Speichern Sie die Datei auf Ihrem Computer
3. **WICHTIG:** Kopieren Sie diese Datei in das `masterApp/` Verzeichnis Ihres Mini-Master Projekts
4. Klicken Sie auf **"Weiter"** und **"Weiter zur Konsole"**

### 3. Child App (Kinder-App) hinzufügen

1. Wiederholen Sie die Schritte 1-2 aus dem vorherigen Abschnitt
2. Verwenden Sie diesmal den **Package-Name**: `com.google.pairing.child`
3. Geben Sie den **App-Spitznamen** ein: `Child App`
4. Laden Sie die **zweite** `google-services.json` Datei herunter
5. **WICHTIG:** Kopieren Sie diese Datei in das `childApp/` Verzeichnis Ihres Mini-Master Projekts

## Teil 4: Projekt-Konfiguration abschließen

### 1. Blaze-Tarif aktivieren (für Cloud Functions erforderlich)
- Gehen Sie zu **"Projekteinstellungen"** > **"Nutzung und Abrechnung"**
- Klicken Sie auf **"Plan ändern"**
- Wählen Sie den **"Blaze"-Tarif** (nutzungsabhängig)
- **Hinweis:** Für Entwicklung und Tests entstehen meist keine Kosten, da großzügige kostenlose Kontingente verfügbar sind

### 2. Cloud Messaging (FCM) konfigurieren
- Gehen Sie zu **"Projekteinstellungen"** > **"Cloud Messaging"**
- Notieren Sie sich den **Server-Schlüssel** für spätere Verwendung

## Teil 5: Dateien korrekt platzieren

Nach dem Download der `google-services.json` Dateien:

```
MiniMaster/
├── masterApp/
│   └── google-services.json    ← Erste heruntergeladene Datei
├── childApp/
│   └── google-services.json    ← Zweite heruntergeladene Datei
└── ...
```

**Kritisch wichtig:** Beide Apps benötigen ihre eigene `google-services.json` Datei mit den korrekten Package-Namen!

## Teil 6: Firebase CLI einrichten (für Backend-Deployment)

### 1. Firebase CLI installieren
```bash
npm install -g firebase-tools
```

### 2. Bei Firebase anmelden
```bash
firebase login
```

### 3. Projekt verknüpfen
```bash
cd /pfad/zum/MiniMaster/projekt
firebase use --add
```
- Wählen Sie Ihr soeben erstelltes Firebase-Projekt aus der Liste

## Nächste Schritte

Nach der Firebase-Einrichtung können Sie:

1. **Backend bereitstellen:** Siehe [README.md](./README.md) für Anweisungen
2. **Android Apps testen:** Siehe [Testanleitung.md](./Testanleitung.md) für umfassende Testszenarien
3. **Produktions-Deployment:** Siehe [PRODUCTION_DEPLOYMENT.md](./PRODUCTION_DEPLOYMENT.md) für Production-Konfiguration

## Fehlerbehebung

### Problem: "google-services.json nicht gefunden"
- **Lösung:** Stellen Sie sicher, dass jede App ihre eigene `google-services.json` Datei im entsprechenden Verzeichnis hat
- Prüfen Sie die Package-Namen in den JSON-Dateien

### Problem: "Firebase projekt nicht gefunden"
- **Lösung:** Führen Sie `firebase use --add` aus und wählen Sie das korrekte Projekt

### Problem: Cloud Functions Deployment schlägt fehl
- **Lösung:** Aktivieren Sie den Blaze-Tarif in der Firebase Console

---

**Hinweis:** Diese Anleitung ergänzt die bestehende englische Dokumentation und richtet sich speziell an deutschsprachige Benutzer. Für technische Details siehe die entsprechenden englischen Dokumentationsdateien.