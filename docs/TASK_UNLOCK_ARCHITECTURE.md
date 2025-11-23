# Architektur-Design: Aufgaben-basierte Handy-Freischaltung

Die neue Funktion ermöglicht es Eltern (MasterApp/Web-Control), Aufgaben zuzuweisen, deren Erledigung durch das Kind (ChildApp) nachgewiesen werden muss, um die Gerätesperre aufzuheben.

## 1. Datenmodell-Erweiterung (Firestore)

Eine neue Top-Level-Collection `tasks` wird eingeführt, die hierarchisch mit der `families` oder `children` Collection verknüpft ist. Angesichts der bestehenden Struktur wird eine Verknüpfung über die `childId` in der `tasks` Collection vorgeschlagen.

| Feld | Typ | Beschreibung |
| :--- | :--- | :--- |
| `taskId` | String | Eindeutige ID (Dokument-ID) |
| `childId` | String | ID des Kindes, dem die Aufgabe zugewiesen ist. |
| `masterId` | String | ID des Elternteils, der die Aufgabe zugewiesen hat. |
| `title` | String | Kurze Beschreibung der Aufgabe (z.B. "Zimmer aufräumen"). |
| `description` | String | Detaillierte Anweisungen. |
| `assignedAt` | Timestamp | Zeitpunkt der Zuweisung. |
| `status` | String | **`ASSIGNED`**, **`SUBMITTED`**, **`APPROVED`**, **`REJECTED`**. |
| `proofUrl` | String | URL zum Nachweis (z.B. Foto in Firebase Storage). Nur bei Status `SUBMITTED`. |
| `unlockDuration` | Number | Dauer (in Minuten), für die das Handy nach Genehmigung freigeschaltet wird. |

## 2. API-Erweiterung (Firebase Functions / `index.ts`)

Es werden neue Endpunkte/Funktionen benötigt, um die Aufgaben zu verwalten und den Status zu aktualisieren.

| Funktion | Methode | Beschreibung | Aufrufer |
| :--- | :--- | :--- | :--- |
| `createTask` | HTTPS/Callable | Erstellt eine neue Aufgabe und setzt den Status auf `ASSIGNED`. | MasterApp / Web-Control |
| `submitTaskProof` | HTTPS/Callable | Kind lädt den Nachweis hoch (Foto/Text) und setzt den Status auf `SUBMITTED`. | ChildApp |
| `reviewTask` | HTTPS/Callable | Elternteil genehmigt (`APPROVED`) oder lehnt ab (`REJECTED`). Bei `APPROVED` wird der Freischalt-Timer gestartet. | MasterApp / Web-Control |
| `getPendingTask` | HTTPS/Callable | Ruft die aktuell zugewiesene Aufgabe für ein Kind ab. | ChildApp |

## 3. ChildApp (Android) Logik

Die Kernlogik basiert auf der bestehenden Geräte-Sperrfunktion (vermutlich über einen **Accessibility Service** oder **Device Policy Manager**).

1.  **Sperr-Trigger:** Wenn die ChildApp feststellt, dass die zugewiesene Aufgabe den Status `ASSIGNED` oder `REJECTED` hat, wird die Sperre aktiviert.
2.  **Freischalt-UI:** Anstelle des normalen Sperrbildschirms wird ein spezieller "Aufgaben-Sperrbildschirm" angezeigt, der die Details der Aufgabe und einen Button zum "Nachweis einreichen" enthält.
3.  **Nachweis-Einreichung:** Der Button führt zu einer Oberfläche, auf der das Kind ein Foto aufnehmen/hochladen oder einen Textnachweis eingeben kann. Der Nachweis wird in Firebase Storage gespeichert und die `proofUrl` sowie der Status `SUBMITTED` werden über `submitTaskProof` an Firestore übermittelt.
4.  **Freischaltung:** Die ChildApp überwacht den `status` der Aufgabe. Sobald der Status auf `APPROVED` wechselt, wird die Gerätesperre für die Dauer von `unlockDuration` aufgehoben.

## 4. MasterApp / Web-Control Logik

1.  **Aufgaben-Zuweisung:** UI zur Eingabe von Titel, Beschreibung und `unlockDuration`. Ruft `createTask` auf.
2.  **Review-Dashboard:** Eine Liste aller Aufgaben mit dem Status `SUBMITTED`.
3.  **Genehmigung:** UI zur Anzeige des `proofUrl` (Foto-Nachweis). Buttons für "Genehmigen" (`APPROVED`) oder "Ablehnen" (`REJECTED`). Ruft `reviewTask` auf.

Dieses Design stellt sicher, dass die kritische Sperrlogik auf dem Gerät des Kindes verbleibt, aber durch den zentralen Aufgabenstatus in Firestore gesteuert wird. Die Nutzung von Firebase Storage für den Nachweis ist notwendig.
