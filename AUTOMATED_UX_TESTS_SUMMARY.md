# Zusammenfassung der automatisierten UX-Tests

Dieser Bericht dokumentiert die im Rahmen des Projekts "Mini-Master Kind-App – Gerätekopplung" automatisierten UX-Testszenarien und deren bekannte Einschränkungen.

## 1. Automatisierte Testszenarien

### Pairing-Prozess

*   **UX-CP-001: Erfolgreiche Kopplung (Happy Path)**
    *   **Testklasse:** `PairingFlowEndToEndTest.kt`
    *   **Testmethode:** `testSuccessfulPairingFlow_navigateToLockScreen`
    *   **Beschreibung:** Simuliert die Eingabe eines "magischen" gültigen Codes (`FakePairingViewModel.MAGIC_TEST_CODE_SUCCESS`), den Klick auf den Kopplungsbutton und verifiziert die Navigation zum `LockScreen` sowie die Anzeige der korrekten, vordefinierten `childId` (`FakePairingViewModel.TEST_CHILD_ID_HAPPY_PATH`).
    *   **Abhängigkeiten-Simulation:**
        *   `PairingViewModel` wird durch `FakePairingViewModel` ersetzt (via Hilt `@BindValue`). Der `FakePairingViewModel` simuliert einen erfolgreichen Cloud Function Aufruf für den magischen Code und stößt die Speicherung der `childId` an.
        *   `ChildIdRepository` wird gemockt (via Hilt `@BindValue`). Das Mock wird so konfiguriert, dass `saveChildId` den internen `childIdFlow` (ein `MutableStateFlow`) aktualisiert, was die `MainActivity` beobachtet und zur Navigation zum `LockScreen` veranlasst.

*   **UX-CP-002: Ungültiger Kopplungscode**
    *   **Testklasse:** `PairingFlowEndToEndTest.kt`
    *   **Testmethode:** `testInvalidCode_showsErrorAndStaysOnPairingScreen`
    *   **Beschreibung:** Simuliert die Eingabe eines spezifischen "ungültigen" Codes (`FakePairingViewModel.MAGIC_TEST_CODE_INVALID`), den Klick auf den Kopplungsbutton und verifiziert die Anzeige der Fehlermeldung "Ungültiger Kopplungscode" (`R.string.error_invalid_code`) sowie den Verbleib im `PairingScreen`. Es wird auch geprüft, ob Eingabefeld und Button wieder aktiv sind.
    *   **Abhängigkeiten-Simulation:** `FakePairingViewModel` simuliert einen Fehlerzustand (`showInvalidCodeError = true`) für den spezifischen ungültigen Code. Es wird sichergestellt, dass keine `childId` gespeichert wird.

### App-Start

*   **UX-AS-001: App-Start mit gespeicherter `childId`**
    *   **Testklasse:** `MainActivityNavigationTest.kt`
    *   **Testmethode:** `testAppStart_withExistingChildId_navigateToLockScreen`
    *   **Beschreibung:** Simuliert eine im `ChildIdRepository` gespeicherte `childId` und verifiziert, dass die App direkt im `LockScreen` mit der korrekten `childId` startet.
    *   **Abhängigkeiten-Simulation:** `ChildIdRepository` wird gemockt (via Hilt `@BindValue`). `mockChildIdRepository.getChildId()` wird so konfiguriert, dass es einen Flow mit einer existierenden `childId` zurückgibt.

*   **UX-AS-002: App-Start ohne gespeicherte `childId`**
    *   **Testklasse:** `MainActivityNavigationTest.kt`
    *   **Testmethode:** `testAppStart_withoutChildId_navigateToPairingScreen`
    *   **Beschreibung:** Simuliert eine nicht vorhandene `childId` im `ChildIdRepository` und verifiziert, dass die App im `PairingScreen` startet.
    *   **Abhängigkeiten-Simulation:** `ChildIdRepository` wird gemockt. `mockChildIdRepository.getChildId()` wird so konfiguriert, dass es einen Flow mit `null` (keine `childId`) zurückgibt.

## 2. Verwendete Test-Frameworks und Techniken
    *   AndroidX Test (JUnit 4, AndroidJUnitRunner)
    *   Jetpack Compose Test Framework (`createAndroidComposeRule`, `onNodeWithText`, `performTextInput`, `performClick`, etc.)
    *   Hilt Android Testing (`@HiltAndroidTest`, `HiltAndroidRule`, `@BindValue`) für Dependency Injection in Instrumentierungstests.
    *   Mockito (`mockito-kotlin`) zum Erstellen von Mock-Objekten für Abhängigkeiten wie `ChildIdRepository`.
    *   `FakePairingViewModel` (erbt von `PairingViewModel`): Eine Fake-Implementierung zur Steuerung der ViewModel-Zustände und zur Simulation des Verhaltens der Cloud Function Aufrufe für UI-Tests.
    *   Coroutinen und `MutableStateFlow` in Tests zur Simulation von Datenflüssen aus dem `ChildIdRepository`.

## 3. Bekannte Einschränkungen der automatisierten Tests

*   **Keine echte Backend-Interaktion:** Die Tests des Kopplungsprozesses (`PairingFlowEndToEndTest.kt`) verlassen sich auf einen `FakePairingViewModel`, der das Verhalten der Firebase Cloud Functions (Erfolg/Fehler für spezifische "magische" Codes) simuliert. Es finden keine echten Netzwerkaufrufe an Firebase Cloud Functions oder direkte Interaktionen mit einer Live-Firestore-Datenbank während dieser UI-Tests statt.
    *   *Empfehlung für Erweiterung:* Zukünftige Tests könnten die Firebase Emulator Suite verwenden, um echte Backend-Interaktionen in einer kontrollierten Umgebung zu testen.
*   **Netzwerkfehler-Simulation (Cloud Functions):** Echte Netzwerkfehlerbedingungen beim Aufruf der Cloud Functions (z.B. Timeout, keine Verbindung) werden durch die UI-Tests nicht explizit simuliert. Die Fehlerbehandlung im `PairingViewModel` für generische `FirebaseFunctionsException` oder andere Exceptions wird zwar durch Unit-Tests des ViewModels abgedeckt, aber die UI-Reaktion auf einen *echten* Netzwerkfehler im Cloud Function Call wird nicht in den UI-Tests verifiziert.
*   **Serverseitige Logik nicht direkt getestet:** Die korrekte Funktion der Cloud Functions selbst (z.B. das Erstellen, Validieren und Löschen des Codes in Firestore) wird durch diese Android UI-Tests nicht direkt überprüft. Hierfür sind separate serverseitige Unit- oder Integrationstests für die Cloud Functions (`index.ts`) notwendig.
*   **Performance und Timing:** Die Tests verwenden `composeTestRule.waitForIdle()`, um auf UI-Aktualisierungen zu warten. Bei sehr schnellen oder komplexen Animationen/Transitionen könnten robustere Synchronisationsmechanismen (wie Compose Idling Resources) notwendig werden. Aktuell scheint dies für die implementierten Tests auszureichen.
*   **Abdeckung der Internationalisierung (i18n) in End-to-End-Tests:** Die hier dokumentierten automatisierten End-to-End-Szenarien (`PairingFlowEndToEndTest.kt`, `MainActivityNavigationTest.kt`) fokussieren primär auf die englische UI. Spezifische i18n-Tests für verschiedene Sprachen wurden zwar in `PairingScreenUITest.kt` und `LockScreenUITest.kt` stichprobenartig implementiert, eine vollumfängliche i18n-Abdeckung aller Flows in allen Sprachen durch automatisierte UI-Tests ist nicht Teil dieser spezifischen Automatisierungsrunde. Die manuelle Überprüfung gemäß der `TRANSLATION_QA_CHECKLIST.md` bleibt hierfür entscheidend.
*   **Spezifische Fehlerfälle nicht alle als E2E-UI-Test automatisiert:** Szenarien wie "Abgelaufener Code" (UX-CP-003) oder "Fehler beim Speichern der childId nach erfolgreicher Cloud-Validierung" (UX-CP-005) wurden zwar manuell in der `UX_TEST_SCENARIOS.md` definiert und der `FakePairingViewModel` ist darauf vorbereitet, diese zu simulieren. Diese spezifischen Fehlerpfade wurden jedoch nicht alle als separate End-to-End UI-Tests in `PairingFlowEndToEndTest.kt` implementiert, um den Aufwand im Rahmen zu halten (UX-CP-002 wurde als Beispiel für einen Fehlerfall implementiert). Die Logik für diese Fehlerfälle wird primär durch Unit-Tests im `PairingViewModelTest.kt` (mit gemockten Antworten der Cloud Functions bzw. des Repositories) und durch UI-Tests in `PairingScreenUITest.kt` (die den `FakePairingViewModel` direkt verwenden, um Fehlerzustände zu setzen) abgedeckt.

Diese Dokumentation dient als Überblick über den aktuellen Stand der automatisierten UX-Tests und als Grundlage für mögliche zukünftige Erweiterungen der Testabdeckung.
