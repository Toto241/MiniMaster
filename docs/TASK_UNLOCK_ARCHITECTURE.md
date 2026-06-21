# Architektur-Design: Aufgaben-basierte Handy-Freischaltung

Die neue Funktion ermöglicht es Eltern (MasterApp/Web-Control), Aufgaben zuzuweisen, deren Erledigung durch das Kind (ChildApp) nachgewiesen werden muss, um die Gerätesperre aufzuheben.

## 1. Datenmodell-Erweiterung (Firestore)

Aufgaben werden als Subcollection unter dem Kind gespeichert: `/children/{childId}/tasks/{taskId}`. Dieses Modell entspricht den Firestore-Regeln, den Cloud Functions und den Android/iOS-Clients.

| Feld | Typ | Beschreibung |
| :--- | :--- | :--- |
| `taskId` | String | Eindeutige ID (Dokument-ID) |
| `description` | String | Detaillierte Anweisungen. |
| `masterImei` | String | ID des Elternteils, der die Aufgabe zugewiesen hat. |
| `createdAt` | Timestamp | Zeitpunkt der Zuweisung. |
| `deadline` | Timestamp | Fälligkeit. |
| `status` | String | **`pending`**, **`pending_approval`**, **`approved`**, **`rejected`**. |
| `photoUrl` | String | URL zum Nachweis (z.B. Foto in Firebase Storage). Nur bei Status `pending_approval`. |
| `unlockDuration` | Number | Dauer (in Minuten), für die das Handy nach Genehmigung freigeschaltet wird. |
| `unlockUntil` | Timestamp | Optionaler serverseitiger Endzeitpunkt nach Genehmigung. |

## 2. API-Erweiterung (Firebase Functions / `index.ts`)

Es werden neue Endpunkte/Funktionen benötigt, um die Aufgaben zu verwalten und den Status zu aktualisieren.

| Funktion | Methode | Beschreibung | Aufrufer |
| :--- | :--- | :--- | :--- |
| `createTask` | HTTPS/Callable | Erstellt eine neue Aufgabe und setzt den Status auf `pending`. | MasterApp / Web-Control |
| `getTasksForChild` | HTTPS/Callable | Ruft die neuesten Aufgaben für ein Kind ab. | ChildApp / MasterApp |
| `completeTask` | HTTPS/Callable | Kind lädt den Nachweis hoch und setzt den Status auf `pending_approval`. | ChildApp |
| `approveTask` | HTTPS/Callable | Elternteil genehmigt (`approved`). Bei `approved` wird `unlockUntil` gesetzt, wenn `unlockDuration` vorhanden ist. | MasterApp / Web-Control |
| `rejectTask` | HTTPS/Callable | Elternteil lehnt ab (`rejected`). | MasterApp / Web-Control |

## 3. ChildApp (Android) Logik

Die Kernlogik basiert auf der bestehenden Geräte-Sperrfunktion (vermutlich über einen **Accessibility Service** oder **Device Policy Manager**).

1.  **Sperr-Trigger:** Wenn die ChildApp feststellt, dass die zugewiesene Aufgabe den Status `pending`, `pending_approval` oder `rejected` hat, wird die Sperre aktiviert.
2.  **Freischalt-UI:** Anstelle des normalen Sperrbildschirms wird ein spezieller "Aufgaben-Sperrbildschirm" angezeigt, der die Details der Aufgabe und einen Button zum "Nachweis einreichen" enthält.
3.  **Nachweis-Einreichung:** Der Button führt zu einer Oberfläche, auf der das Kind ein Foto aufnehmen/hochladen kann. Der Nachweis wird in Firebase Storage unter `proofs/{childId}/{taskId}/...` gespeichert und die `photoUrl` sowie der Status `pending_approval` werden über `completeTask` an Firestore übermittelt.
4.  **Freischaltung:** Die ChildApp überwacht den `status` der Aufgabe. Sobald der Status auf `approved` wechselt, wird die Gerätesperre für die Dauer von `unlockDuration` aufgehoben.

## 4. MasterApp / Web-Control Logik

1.  **Aufgaben-Zuweisung:** UI zur Eingabe von Beschreibung, Deadline und `unlockDuration`. Ruft `createTask` auf.
2.  **Review-Dashboard:** Eine Liste aller Aufgaben mit dem Status `pending_approval`.
3.  **Genehmigung:** UI zur Anzeige des `photoUrl` (Foto-Nachweis). Buttons für "Genehmigen" (`approved`) oder "Ablehnen" (`rejected`). Ruft `approveTask` oder `rejectTask` auf.

Dieses Design stellt sicher, dass die kritische Sperrlogik auf dem Gerät des Kindes verbleibt, aber durch den zentralen Aufgabenstatus in Firestore gesteuert wird. Die Nutzung von Firebase Storage für den Nachweis ist notwendig.
