# ChildApp (Android) Logik: Aufgaben-basierte Sperre und Freischaltung

Die Implementierung der Sperr- und Freischaltlogik erfolgt primär in der `childApp` (Android-Anwendung), da diese die Kontrolle über das Gerät des Kindes hat. Die Logik basiert auf der Überwachung des Aufgabenstatus in Firestore und der Nutzung eines **Accessibility Service** oder **Device Policy Manager** zur Gerätesperre.

## 1. Task-Monitoring-Service

Ein Hintergrunddienst (z.B. ein `Service` oder `Worker` in Android) muss die Firestore-Datenbank auf Änderungen im Aufgabenstatus überwachen.

**Überwachungsziel:** Die neueste Aufgabe für das aktuelle `childId` in der Collection `/children/{childId}/tasks`.

**Logik-Fluss:**

1.  **Initialisierung:** Der Dienst abonniert den Firestore-Listener für die neueste Aufgabe.
2.  **Status-Check:** Bei jeder Änderung der Aufgabe wird der `status` geprüft:
    *   **`pending` oder `rejected`:** Die Sperrlogik wird aktiviert.
    *   **`pending_approval`:** Die Sperre bleibt aktiv, aber die Benutzeroberfläche zeigt an, dass auf die Genehmigung des Elternteils gewartet wird.
    *   **`approved`:** Die Freischaltlogik wird aktiviert.

## 2. Sperr-Mechanismus (Lock Logic)

Die Sperre wird aktiviert, wenn eine Aufgabe zugewiesen oder abgelehnt wurde.

**Implementierung:**

*   **Accessibility Service:** Der Service muss erkennen, wenn eine App gestartet wird, die nicht die MiniMaster-App ist.
*   **Aktion:** Bei Erkennung einer nicht erlaubten App wird der Benutzer sofort auf eine spezielle **Lock-Activity** umgeleitet.
*   **Lock-Activity (Aufgaben-Sperrbildschirm):**
    *   Zeigt den `title` und die `description` der aktuellen Aufgabe an.
    *   Enthält einen Button **"Nachweis einreichen"**.
    *   **Kein** anderer Zugriff auf das Gerät ist möglich, bis die Aufgabe genehmigt wurde.

## 3. Nachweis-Einreichung (Proof Submission)

Die Lock-Activity muss die Funktionalität zur Einreichung des Nachweises bereitstellen.

**Ablauf:**

1.  Kind klickt auf **"Nachweis einreichen"**.
2.  Die App öffnet eine Oberfläche zur **Fotoaufnahme** oder **Dateiauswahl**.
3.  Das Foto wird in **Firebase Storage** hochgeladen (Pfad: `proofs/{childId}/{taskId}/{timestamp}.jpg`).
4.  Nach erfolgreichem Upload wird die Cloud Function `completeTask` mit der `taskId` und der generierten `photoUrl` aufgerufen.
5.  Der Task-Monitoring-Service erkennt den Statuswechsel zu `pending_approval` und die Lock-Activity ändert die Anzeige auf **"Warte auf Genehmigung durch Elternteil..."**.

## 4. Freischalt-Mechanismus (Unlock Logic)

Die Freischaltung erfolgt, wenn der Aufgabenstatus auf `approved` wechselt.

**Ablauf:**

1.  Der Task-Monitoring-Service erkennt den Status `approved`.
2.  Der Dienst liest den Wert von `unlockDuration` (in Minuten) aus der Aufgabe.
3.  Ein **Timer** wird gestartet, der für die Dauer von `unlockDuration` läuft.
4.  **Aktion:** Während der Timer läuft, **deaktiviert** der Accessibility Service die Sperrlogik. Das Kind kann das Handy normal nutzen.
5.  **Timer-Ende:** Nach Ablauf der `unlockDuration` wird die Sperrlogik **automatisch reaktiviert**. Der ChildApp-Dienst muss dann prüfen, ob eine neue Aufgabe zugewiesen wurde, oder ob die Standard-Sperrregeln (z.B. Zeitlimits) wieder greifen.

**Zusätzliche Logik:**

*   **Persistenz:** Der Freischalt-Timer muss auch nach einem Neustart des Geräts oder der App persistent sein (z.B. Speicherung des Endzeitpunkts in `SharedPreferences`).
*   **Benachrichtigung:** Eine temporäre Benachrichtigung sollte dem Kind die verbleibende Freischaltzeit anzeigen.

Dieses Dokument dient als Blaupause für die notwendigen Code-Änderungen in der `childApp/src/` Struktur.
