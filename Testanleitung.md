# Testanleitung für Mini-Master

Dieses Dokument beschreibt, wie das Mini-Master-System, bestehend aus `masterApp`, `childApp` und dem Firebase-Backend, getestet werden kann. Es umfasst Anleitungen für die Einrichtung der Umgebung, manuelle End-to-End-Tests und eine Strategie für automatisierte Tests.

## 1. Einrichtung der Testumgebung

Um den vollständigen Kopplungs-Flow zu testen, müssen beide Apps und das Backend konfiguriert werden.

### 1.1. Firebase-Backend
Das Backend verwaltet die Geräteregistrierung und den Kopplungsprozess.

1.  **Abhängigkeiten installieren:** Führen Sie im Stammverzeichnis des Projekts den folgenden Befehl aus:
    ```bash
    npm install
    ```
2.  **Cloud Functions bereitstellen:** Stellen Sie die Functions in Ihrem Firebase-Projekt bereit:
    ```bash
    firebase deploy --only functions
    ```

### 1.2. Android Apps (`masterApp` & `childApp`)

1.  **Firebase-Konfiguration:**
    *   **Neu:** Wenn Sie noch kein Firebase-Projekt haben, folgen Sie der detaillierten Anleitung in [FIREBASE_EINRICHTUNG.md](./FIREBASE_EINRICHTUNG.md)
    *   Laden Sie die Konfigurationsdateien `google-services.json` von Ihrem Firebase-Projekt herunter.
    *   Kopieren Sie diese Datei sowohl in das `masterApp/`- als auch in das `childApp/`-Verzeichnis. **Dieser Schritt ist für die Kommunikation mit dem Backend zwingend erforderlich.**

2.  **Gradle Wrapper generieren (falls nicht vorhanden):**
    Der Gradle Wrapper stellt sicher, dass für das Projekt eine einheitliche Gradle-Version verwendet wird. Falls die `gradlew`-Datei im Stammverzeichnis fehlt, führen Sie diesen Befehl aus:
    ```bash
    gradle wrapper --gradle-version 8.5 --distribution-type all
    ```
    *Hinweis: Dies erfordert, dass `gradle` auf Ihrem System installiert ist.*

3.  **Projekt öffnen und ausführen:**
    *   Öffnen Sie das **Stammverzeichnis** des gesamten Projekts in Android Studio. Das IDE sollte beide Module (`masterApp` und `childApp`) erkennen.
    *   Wählen Sie in der Build-Konfiguration die `masterApp` aus und starten Sie sie auf einem Emulator oder physischen Gerät (Gerät A).
    *   Wählen Sie die `childApp` aus und starten Sie sie auf einem zweiten Emulator oder Gerät (Gerät B).

## 2. Manuelle End-to-End-Testszenarien

Diese Tests überprüfen den gesamten Kopplungs-Flow aus Benutzersicht.

Hinweis: Neben dem im Dokument beschriebenen Token-Flow (einmaliger `pairingToken`, 5 Minuten gültig) existiert ein alternativer 6-stelliger Kopplungscode (`createPairingCode` / `validatePairingCode`), der 24 Stunden gültig ist. Dieser ist aktuell nicht für den UI-Fluss dokumentiert, kann aber über direkte Funktionsaufrufe (z.B. Firebase Emulator / callable Function Invocation) getestet werden.

---

**Testfall M-01: Erfolgreiche Kopplung (Happy Path)**

1.  Starten Sie die `masterApp` auf Gerät A.
3.  Klicken Sie auf **"Register Device"**. In der Debug-Ansicht sollten die Geräte-ID und ein `secretKey` erscheinen.
4.  Klicken Sie auf **"Generate Pairing Link"**. Ein `pairingToken` wird in der Debug-Ansicht angezeigt.
5.  Öffnen Sie auf Gerät B ein Terminal und führen Sie den folgenden `adb`-Befehl aus, um die `childApp` über den Deep Link zu starten. Ersetzen Sie `{TOKEN}` durch den eben generierten `pairingToken`.
    ```bash
    adb shell am start -a android.intent.action.VIEW -d "minimaster://pair/{TOKEN}" com.google.pairing
    ```
6.  Die `childApp` startet auf Gerät B.
7.  **Erwartetes Ergebnis:** Die `childApp` zeigt kurz eine Ladeanzeige und navigiert anschließend zum Sperrbildschirm (`LockScreen`). Die Kopplung war erfolgreich.

---

**Testfall M-02: Ungültiger Token**

1.  Führen Sie die Schritte 1-4 aus Testfall M-01 aus.
2.  Modifizieren Sie den `pairingToken` leicht (z.B. eine Ziffer ändern).
3.  Verwenden Sie diesen ungültigen Token im `adb`-Befehl aus Schritt 5.
4.  **Erwartetes Ergebnis:** Die `childApp` startet, zeigt eine Ladeanzeige und anschließend eine Fehlermeldung wie "Ungültiger Kopplungscode". Sie verbleibt im Kopplungsbildschirm.

---

**Testfall M-03: Abgelaufener Token**

1.  Führen Sie die Schritte 1-4 aus Testfall M-01 aus.
2.  Warten Sie **mehr als 5 Minuten**.
3.  Verwenden Sie den nun abgelaufenen `pairingToken` im `adb`-Befehl.
4.  **Erwartetes Ergebnis:** Die `childApp` startet und zeigt eine Fehlermeldung wie "Kopplungscode ist abgelaufen".

---

**Testfall M-04: Wiederverwendeter Token**

1.  Führen Sie Testfall M-01 vollständig und erfolgreich durch.
2.  Versuchen Sie, den gleichen `pairingToken` erneut für ein drittes Gerät (oder nach Zurücksetzen von Gerät B) zu verwenden.
3.  **Erwartetes Ergebnis:** Der zweite Kopplungsversuch schlägt fehl, da der Token nach der ersten erfolgreichen Verwendung vom Backend gelöscht wird. Die `childApp` zeigt eine Fehlermeldung.

---

**Testfall M-05: Verweigerte Berechtigungen**

1.  Starten Sie die `childApp` und öffnen Sie den Onboarding-/Permission-Flow.
2.  Verweigern Sie die für Enforcement relevanten Berechtigungen (z. B. Accessibility/Overlay je nach Gerät).
3.  **Erwartetes Ergebnis:** Die App bleibt in einem eingeschränkten Zustand und zeigt an, dass ohne Freigabe keine vollständige Schutzfunktion aktiv ist.

---

## 3. Manuelle Tests für Kernfunktionen

Nachdem die Geräte erfolgreich gekoppelt wurden, können die folgenden Kernfunktionen getestet werden.

**Testfall F-01: Gerät sperren und entsperren**

1.  Starten Sie die `masterApp` auf Gerät A. Nach der Registrierung sollte das Dashboard mit dem gekoppelten Kindergerät (Gerät B) erscheinen.
2.  Auf dem Dashboard sehen Sie neben der ID des Kindes einen Schalter für "Locked". Betätigen Sie diesen Schalter.
3.  **Erwartetes Ergebnis:** In der `masterApp` wird der Status des Schalters aktualisiert. Auf der `childApp` (Gerät B) sollte fast in Echtzeit der Sperrbildschirm erscheinen oder, falls bereits gesperrt, eine sichtbare Änderung stattfinden (dies hängt von der finalen UI-Implementierung ab). Das Entsperren funktioniert auf die gleiche Weise.

**Testfall F-02: Aufgabe für ein Kind erstellen**

1.  Klicken Sie in der `masterApp` auf dem Dashboard beim gewünschten Kind auf **"Create Task"**.
2.  Sie werden zum "Create Task"-Bildschirm weitergeleitet.
3.  Geben Sie eine Aufgabenbeschreibung (z.B. "Zimmer aufräumen") und eine Deadline (als Unix-Timestamp, z.B. `1735689600000` für 1. Jan 2025) ein.
4.  Klicken Sie auf **"Create Task"**.
5.  **Erwartetes Ergebnis:** Sie werden zum Dashboard zurückgeleitet. In der `childApp` (Gerät B) sollte nach dem Navigieren zum Aufgabenbildschirm die neue Aufgabe in der Liste erscheinen.

**Testfall F-03: Aufgabe als Kind erledigen (mit Fotonachweis)**

1.  Starten Sie die `childApp` auf Gerät B und navigieren Sie zum Aufgabenbildschirm.
2.  Suchen Sie eine offene Aufgabe und klicken Sie auf **"Complete"**.
3.  **Erwartetes Ergebnis:** Die Kamera-App des Geräts öffnet sich.
4.  Machen Sie ein Foto als Nachweis und bestätigen Sie es.
5.  **Erwartetes Ergebnis:** Sie kehren zur App zurück. Der Status der Aufgabe ändert sich zu "Pending Approval". Im Hintergrund wird das Foto in Firebase Storage hochgeladen und die Aufgabe im Backend aktualisiert.

**Testfall F-04: Aufgabe als Elternteil genehmigen**

1.  Führen Sie Testfall F-03 erfolgreich aus.
2.  Klicken Sie in der `masterApp` auf dem Dashboard auf **"Review Tasks"**.
3.  **Erwartetes Ergebnis:** Sie sehen eine Liste der Aufgaben, die auf Genehmigung warten.
4.  Klicken Sie auf eine Aufgabe. Das von Kind B hochgeladene Foto wird angezeigt.
5.  Klicken Sie auf **"Approve Task"**.
6.  **Erwartetes Ergebnis:** Die Aufgabe verschwindet aus der Review-Liste. In der `childApp` wird der Status der Aufgabe als "Approved" angezeigt.

**Testfall F-05: Internationalisierung (i18n)**

1.  Ändern Sie die Gerätesprache auf Gerät A und B (z.B. auf Deutsch, Französisch oder Chinesisch).
2.  Führen Sie die Apps aus.
3.  **Erwartetes Ergebnis:** Alle Texte in der Benutzeroberfläche (Titel, Buttons, Fehlermeldungen) werden in der eingestellten Sprache korrekt angezeigt. Bei einer nicht unterstützten Sprache fallen die Texte auf Englisch zurück.

**Testfall F-06: Sprachwahl beim Erststart (beide Apps)**

1.  Deinstallieren Sie `masterApp` und `childApp` oder löschen Sie jeweils die App-Daten.
2.  Starten Sie die `masterApp` auf Gerät A.
3.  **Erwartetes Ergebnis:** Vor Registrierung/Dashboard erscheint die Sprachwahl.
4.  Wählen Sie eine Sprache und bestätigen Sie mit **Continue/Weiter/Continuer**.
5.  **Erwartetes Ergebnis:** Die App navigiert in den regulären Flow (Registrierung oder Dashboard).
6.  Wiederholen Sie die Schritte 2-5 für die `childApp` auf Gerät B.

**Testfall F-07: Persistenz der Sprachwahl nach Neustart**

1.  Wählen Sie beim Erststart in beiden Apps eine nicht-default Sprache (z.B. Deutsch oder Französisch).
2.  Beenden Sie beide Apps vollständig (Swipe aus Recents) und starten Sie sie erneut.
3.  **Erwartetes Ergebnis:** Die Sprachwahl wird nicht erneut angezeigt, und die gewählte Sprache bleibt aktiv.

**Testfall F-08: RTL-Schnelltest (Arabisch/Hebräisch)**

1.  Wählen Sie in der Sprachwahl Arabisch oder Hebräisch.
2.  Starten Sie den Erstflow in beiden Apps.
3.  **Erwartetes Ergebnis:** Texte und Layout sind lesbar, keine abgeschnittenen Buttons, keine überlappenden Elemente.

## 4. Automatisierte Tests

Das Projekt enthält bereits eine Reihe von automatisierten Tests und kann um einen End-to-End-Test erweitert werden.

### 3.1. Backend Unit-Tests
Diese Tests validieren die Logik der Cloud Functions (in `index.ts`) isoliert.
*   **Befehl:** `npm test`
*   **Abdeckung:** Testet die Registrierung, Token-Erstellung und -Validierung auf logischer Ebene.

### 3.2. Android Unit-Tests
Diese Tests laufen schnell auf der lokalen JVM und prüfen einzelne Komponenten wie ViewModels oder Repositories, ohne dass ein Emulator benötigt wird.

*Hinweis: Die folgenden Befehle können über die Kommandozeile ausgeführt werden, sofern eine funktionierende Android SDK-Umgebung konfiguriert ist. Alternativ können sie direkt innerhalb von Android Studio für die jeweiligen Module (`childApp`, `masterApp`) gestartet werden.*

*   **Befehl (Child-App):** `./gradlew :childApp:test`
*   **Befehl (Master-App):** `./gradlew :masterApp:test`

### 3.3. Automatisierte UI-Tests (Instrumentiert)
Diese Tests laufen auf einem Emulator/Gerät und prüfen UI-Flows innerhalb einer einzelnen App.
*   **Befehl (Child-App):** `./gradlew :childApp:connectedDebugAndroidTest`
*   **Befehl (Master-App):** `./gradlew :masterApp:connectedDebugAndroidTest`

### 3.4. Automatisierter End-to-End-Test (Kit)
Für das Projekt wurde ein vollautomatischer End-to-End-Test implementiert, der den gesamten Kopplungs-Flow über beide Apps hinweg überprüft. Dieser Test wird durch das Skript `run_e2e_test.sh` im Hauptverzeichnis des Projekts gesteuert.

**Funktionsweise:**
Das Skript automatisiert die folgenden Schritte:
1.  Es führt einen instrumentierten Test auf der `masterApp` aus, der einen echten Kopplungs-Token vom Backend generiert.
2.  Der Token wird aus den Geräte-Logs (`logcat`) ausgelesen.
3.  Die `childApp` wird per `adb`-Befehl über einen Deep-Link mit dem erhaltenen Token gestartet.
4.  Zuletzt wird ein weiterer instrumentierter Test auf der `childApp` ausgeführt, der verifiziert, dass die App erfolgreich gekoppelt wurde und den Sperrbildschirm anzeigt (`DeepLinkE2ETest`).

**Voraussetzungen:**
*   Ein Android-Gerät oder Emulator ist via `adb` verbunden.
*   Das Firebase-Backend ist erreichbar.
*   Beide Apps (`masterApp` und `childApp`) sind auf dem Gerät installiert.

**Ausführung:**
1.  Machen Sie das Skript zuerst ausführbar (falls noch nicht geschehen):
    ```bash
    chmod +x run_e2e_test.sh
    ```
2.  Führen Sie das Skript vom Projekt-Stammverzeichnis aus:
    ```bash
    ./run_e2e_test.sh
    ```

Das Skript gibt den Fortschritt der einzelnen Schritte aus und wird mit einer Erfolgsmeldung beendet oder bricht bei einem Fehler ab. Dieses "Kit" stellt sicher, dass die Kernfunktionalität der App-Kopplung durchgehend funktioniert.
