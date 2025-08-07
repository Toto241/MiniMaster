# MiniMaster Kind-App & Backend

Dieses Repository enthält die experimentelle Implementierung der Kind-Anwendung des **Mini-Master**-Projekts sowie die zugehörigen Firebase Cloud Functions für den Kopplungsprozess.

## Funktionsübersicht

Die Android-App ermöglicht es, ein Kindergerät über einen 6-stelligen Code mit einem Elterngerät (nicht Teil dieses Repos) zu koppeln. Nach erfolgreicher Kopplung zeigt das Kindergerät einen Sperrbildschirm mit seiner zugewiesenen ID an.

- **Geräte-Registrierung (Eltern-App)**: Die `masterApp` kann sich über ihre IMEI beim Backend registrieren, um eine permanente Identität mit einem `secretKey` zu erstellen.
- **Link-basierter Kopplungs-Flow**: Die `masterApp` kann einen einmalig gültigen Kopplungs-Token anfordern. Die `childApp` wird über einen Deep Link (`minimaster://pair/{token}`) geöffnet, um den Kopplungsprozess zu starten, der das Kind-Gerät mit dem Eltern-Gerät verknüpft.
- **Lokaler Speicher**: Die `childApp` speichert die ID des gekoppelten Elterngeräts persistent mit Jetpack DataStore.
- **Backend-Integration**: Cloud Functions in `index.ts` implementieren die gesamte Logik für die Geräteregistrierung (`registerMasterDevice`), Token-Erstellung (`generatePairingLink`) und Token-Validierung (`validatePairingToken`).
- **Dependency Injection**: Die App nutzt Hilt für Dependency Injection.
- **Internationalisierung (i18n)**: Alle Texte sind in Englisch, Deutsch, Französisch und vereinfachtem Chinesisch vorhanden.
- **Testing**: Das Projekt umfasst Unit-Tests für die Backend-Logik, sowie Unit-, Integrations- und UI-Tests für die Android-App.

---

## Bedienungsanleitung & Entwickler-Setup

### 1. Backend (Firebase Cloud Functions)

Die Cloud Functions verwalten die Erstellung und Validierung der Kopplungscodes.

**Voraussetzungen:**
*   Node.js und npm
*   Firebase CLI (für das Deployment)

**Setup:**
1.  Installieren Sie die Abhängigkeiten im Stammverzeichnis des Projekts:
    ```bash
    npm install
    ```

**Testen der Cloud Functions:**
Das Projekt enthält Unit-Tests für die Cloud Functions. Führen Sie diese mit dem folgenden Befehl aus:
```bash
npm test
```
*Hinweis: In einigen Testumgebungen gab es Probleme mit der Ausführung dieses Befehls. Das Skript `test` in `package.json` wurde so konfiguriert, dass es zuerst den TypeScript-Code kompiliert (`npm run build`) und dann die Tests ausführt. Sollten Probleme auftreten, stellen Sie sicher, dass `./node_modules/.bin/tsc` korrekt ausgeführt werden kann.*

**Deployment:**
Um die Functions bereitzustellen, verwenden Sie die Firebase CLI:
```bash
firebase deploy --only functions
```

### 2. Android App (childApp)

Die `childApp` ist die native Android-Anwendung für das Kindergerät.

**Voraussetzungen:**
*   Android Studio (aktuellste Version empfohlen)
*   Java Development Kit (JDK)

**Setup und Bauen:**
1.  **Gradle Wrapper generieren (Wichtiger erster Schritt):** Dem Projekt fehlt der Gradle Wrapper (`gradlew`). Dieser ist für einheitliche Builds unerlässlich. Falls Sie Gradle auf Ihrem System installiert haben, können Sie den Wrapper aus dem `childApp`-Verzeichnis heraus generieren:
    ```bash
    cd childApp
    gradle wrapper
    ```
    Falls Sie Gradle nicht installiert haben, müssen Sie es zuerst einrichten, um diesen Schritt auszuführen.

2.  **Projekt in Android Studio öffnen:** Öffnen Sie das `childApp`-Verzeichnis als eigenständiges Projekt in Android Studio.

3.  **App bauen:** Android Studio sollte das Projekt automatisch synchronisieren. Sie können die App über `Build > Make Project` bauen oder direkt auf einem Emulator/Gerät ausführen.

**Testen der Android-App:**
Nachdem der Gradle Wrapper generiert wurde, können Sie die Tests über die Kommandozeile aus dem `childApp`-Verzeichnis ausführen:
*   **Unit Tests:**
    ```bash
    ./gradlew test
    ```
*   **Instrumented Tests (UI-Tests):**
    ```bash
    ./gradlew connectedAndroidTest
    ```

### 3. Android App (masterApp)

Die `masterApp` ist die neue, in Entwicklung befindliche Anwendung für das Elterngerät. Sie kann das Gerät beim Backend registrieren (basierend auf der IMEI) und anschließend einmalig verwendbare Kopplungs-Token für die `childApp` generieren.

**Setup und Bauen:**
Das Projekt ist nun als Multi-Modul-Projekt konfiguriert.
1.  **Firebase-Konfiguration hinzufügen:** Um die App mit Ihrem Firebase-Projekt zu verbinden, müssen Sie die Konfigurationsdatei `google-services.json` von Ihrem Firebase-Projekt herunterladen und in das `masterApp/`-Verzeichnis kopieren. **Dieser Schritt ist für die Kommunikation mit dem Backend zwingend erforderlich.**
2.  **Projekt in Android Studio öffnen:** Öffnen Sie das **Stammverzeichnis** des Repositories in Android Studio. Das IDE sollte beide Module (`childApp` and `masterApp`) erkennen.
3.  **App bauen:** Sie können die `masterApp` als Ziel in der Build-Konfiguration auswählen und sie auf einem Emulator/Gerät ausführen.

**Wichtiger Hinweis zur IMEI:**
Das Auslesen der IMEI erfordert die `READ_PHONE_STATE`-Berechtigung. Auf Android-Versionen 10 (API 29) und höher ist der Zugriff auf die IMEI für normale Apps stark eingeschränkt und wird in der Regel eine `SecurityException` auslösen oder `null` zurückgeben. Die App versucht, dies zu handhaben und eine entsprechende Meldung anzuzeigen. Für eine produktive Anwendung müsste ein alternativer, datenschutzfreundlicherer Mechanismus zur eindeutigen Geräteidentifikation in Betracht gezogen werden (z.B. `ANDROID_ID` oder eine bei der Installation generierte UUID).

---

## Funktionsweise des neuen Kopplungsprozesses

Der neue Prozess ist IMEI- und Link-basiert und ersetzt den alten 6-stelligen Code vollständig.

1.  **Registrierung des Elterngeräts (`masterApp`):**
    *   Der Nutzer startet die `masterApp`.
    *   Die App fordert die Berechtigung `READ_PHONE_STATE` an.
    *   Nach Erteilung der Berechtigung liest die App die IMEI des Geräts aus und ruft die Cloud Function `registerMasterDevice` auf.
    *   Das Backend erstellt ein permanentes Profil für die IMEI in der `masters`-Collection und generiert einen `secretKey`, der an die App zurückgegeben wird.

2.  **Erstellung des Kopplungs-Links (`masterApp`):**
    *   Nach erfolgreicher Registrierung kann der Nutzer in der `masterApp` einen Kopplungs-Link anfordern.
    *   Die App ruft die `generatePairingLink`-Function auf und authentifiziert sich mit ihrer IMEI und dem `secretKey`.
    *   Das Backend generiert einen einmalig verwendbaren, kurzlebigen (5 Minuten) `pairingToken` und speichert ihn in der `pairingTokens`-Collection.
    *   Die `masterApp` erhält den Token und zeigt ihn an (in einer echten App würde hier ein klickbarer Link erstellt).

3.  **Kopplung des Kindergeräts (`childApp`):**
    *   Der `pairingToken` wird an das Kindergerät übermittelt (z.B. per Messenger).
    *   Auf dem Kindergerät wird ein Link der Form `minimaster://pair/{token}` geöffnet.
    *   Die `childApp` startet durch diesen Deep Link. Sie extrahiert den `token` aus der URL.
    *   Die `childApp` fordert ebenfalls die `READ_PHONE_STATE`-Berechtigung an, um ihre eigene IMEI zu lesen.
    *   Sie ruft die `validatePairingToken`-Function mit dem `token` und ihrer `childImei` auf.

4.  **Validierung im Backend:**
    *   Das Backend überprüft, ob der `pairingToken` gültig und nicht abgelaufen ist.
    *   Wenn ja, wird eine permanente Verbindung zwischen Eltern und Kind in der neuen `children`-Collection erstellt.
    *   Der `pairingToken` wird gelöscht, um eine Wiederverwendung zu verhindern.
    *   Das Backend gibt die `masterImei` als Bestätigung an die `childApp` zurück.

5.  **Abschluss in der `childApp`:**
    *   Die `childApp` speichert die erhaltene `masterImei` als ihre neue `childId` und zeigt den `LockScreen` an. Die Kopplung ist abgeschlossen.

## Firestore Datenstruktur

Die Datenstruktur wurde überarbeitet, um den neuen Kopplungs-Flow zu unterstützen. Die alte `pairingCodes`-Collection wird nicht mehr verwendet.

### `masters` Collection
Speichert die permanenten Profile für jedes registrierte Elterngerät.
- **Struktur (`/masters/{imei}`):**
  ```json
  {
    "imei": "string",
    "secretKey": "string (UUID)",
    "createdAt": "Timestamp"
  }
  ```

### `pairingTokens` Collection
Speichert die einmalig verwendbaren, kurzlebigen Tokens für den Kopplungsprozess.
- **Struktur (`/pairingTokens/{token}`):**
  ```json
  {
    "masterImei": "string",
    "createdAt": "Timestamp",
    "expiresAt": "Timestamp"
  }
  ```

### `children` Collection
Speichert die permanente Verbindung zwischen einem Kind- und einem Elterngerät.
- **Struktur (`/children/{childImei}`):**
  ```json
  {
    "childImei": "string",
    "masterImei": "string",
    "pairedAt": "Timestamp"
  }
  ```

- **Sicherheitsregeln:** Der direkte Client-Zugriff auf **alle** diese Collections ist vollständig gesperrt.
---

## Debug-Schnittstelle

Um die Entwicklung und Fehlersuche zu erleichtern, verfügen beide Apps über eine einfache Debug-Ansicht am unteren Bildschirmrand.

- **Zugriff:** Die Ansicht kann über einen "Show/Hide Debug Info"-Button ein- und ausgeblendet werden.
- **`masterApp`:** Zeigt die abgerufene IMEI des Elterngeräts, den erhaltenen `secretKey` und den Status der Kopplungs-Token-Erstellung an.
- **`childApp`:** Zeigt die abgerufene IMEI des Kindergeräts und den aktuellen Status des Kopplungsprozesses an.
