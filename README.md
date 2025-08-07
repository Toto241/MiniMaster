# MiniMaster Kind-App & Backend

Dieses Repository enthält die experimentelle Implementierung der Kind-Anwendung des **Mini-Master**-Projekts sowie die zugehörigen Firebase Cloud Functions für den Kopplungsprozess.

## Funktionsübersicht

Die Android-App ermöglicht es, ein Kindergerät über einen 6-stelligen Code mit einem Elterngerät (nicht Teil dieses Repos) zu koppeln. Nach erfolgreicher Kopplung zeigt das Kindergerät einen Sperrbildschirm mit seiner zugewiesenen ID an.

- **Kopplungs-Flow**: Ein `PairingScreen` sammelt den Code, der von der Cloud Function `validatePairingCode` überprüft wird. Bei Erfolg wird die `childId` lokal gespeichert und die App navigiert zum `LockScreen`.
- **Lokaler Speicher**: `ChildIdRepository` verwendet Jetpack DataStore, um die `childId` persistent zu speichern. Ein globaler `ChildIdProvider` stellt die ID als reaktiven `StateFlow` für die gesamte App bereit.
- **Backend-Integration**: Cloud Functions in `index.ts` implementieren die Logik zur Erstellung (`createPairingCode`) und Validierung (`validatePairingCode`) von Kopplungscodes unter Verwendung von Firestore.
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

---

## Funktionsweise des Kopplungsprozesses

1.  **Code-Erstellung (Eltern-Seite):** Ein externes System (z.B. eine Eltern-App) ruft die `createPairingCode`-Cloud-Function mit einer `childId` auf. Die Funktion generiert einen einzigartigen, 6-stelligen Code, speichert ihn mit einem Ablaufdatum (24 Stunden) in Firestore und gibt den Code zurück.
2.  **Code-Eingabe (Kind-Seite):** Das Kind (oder der Elternteil) gibt diesen 6-stelligen Code in der `childApp` ein.
3.  **Code-Validierung (Kind-Seite):** Die App ruft die `validatePairingCode`-Cloud-Function auf.
4.  **Ergebnis:**
    *   **Erfolg:** Wenn der Code gültig und nicht abgelaufen ist, gibt die Funktion die `childId` zurück. Der Code wird aus Firestore gelöscht, um eine Wiederverwendung zu verhindern. Die `childApp` speichert die `childId` lokal und zeigt den `LockScreen` an.
    *   **Fehlschlag:** Bei einem ungültigen, abgelaufenen oder bereits verwendeten Code gibt die Funktion einen entsprechenden Fehler zurück, den die App dem Benutzer anzeigt.

## Firestore Datenstruktur

Die Kopplungscodes werden in der `pairingCodes`-Collection gespeichert. Jedes Dokument hat den 6-stelligen Code als ID.

- **Struktur eines Dokuments (`/pairingCodes/{code}`):**
  ```json
  {
    "childId": "string",
    "createdAt": "Timestamp",
    "expiresAt": "Timestamp"
  }
  ```
- **Sicherheitsregeln:** Der direkte Zugriff auf diese Collection durch die Client-App wird durch `firestore.rules` vollständig blockiert. Nur die Cloud Functions haben über das Admin SDK die Berechtigung, Dokumente zu lesen und zu schreiben.
