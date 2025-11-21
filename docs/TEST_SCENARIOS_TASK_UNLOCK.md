# Test-Szenarien: Aufgaben-basierte Handy-Freischaltung

Dieses Dokument beschreibt die notwendigen Schritte, um die korrekte Funktion der neu implementierten Aufgaben-basierten Handy-Freischaltung zu verifizieren.

## Voraussetzungen

1.  Die Firebase-Funktionen (`createTask`, `submitTaskProof`, `reviewTask`) sind deployed.
2.  Die Firestore Security Rules sind aktualisiert.
3.  Die ChildApp und MasterApp/Web-Control sind mit den neuen API-Aufrufen und der Lock-Logik (gemäß `CHILDAPP_LOCK_LOGIC.md`) implementiert.
4.  Ein Master-Account (Elternteil) und ein Child-Account (Kind) sind gepaart und authentifiziert.

## Testfall 1: Erfolgreicher Aufgaben-Zyklus (Freischaltung)

| Schritt | Akteur | Aktion | Erwartetes Ergebnis |
| :--- | :--- | :--- | :--- |
| **1. Zuweisung** | Master | Ruft `createTask` auf (z.B. über Web-Control) mit `unlockDuration: 30` Minuten. | Die Aufgabe erscheint in der ChildApp. Der Status in Firestore ist `ASSIGNED`. |
| **2. Sperre** | Child | Versucht, eine andere App zu öffnen. | Die ChildApp leitet sofort zur **Lock-Activity** um. Die Lock-Activity zeigt die Aufgabendetails an. |
| **3. Nachweis** | Child | Klickt auf "Nachweis einreichen", lädt ein Foto hoch und ruft `submitTaskProof` auf. | Das Foto wird in Firebase Storage gespeichert. Der Status in Firestore wechselt zu `SUBMITTED`. Die Lock-Activity zeigt "Warte auf Genehmigung..." an. |
| **4. Genehmigung** | Master | Ruft `reviewTask` mit `approved: true` auf. | Der Status in Firestore wechselt zu `APPROVED`. |
| **5. Freischaltung** | Child | | Die Lock-Activity verschwindet. Der Task-Monitoring-Service startet einen 30-Minuten-Timer. Das Handy ist für 30 Minuten normal nutzbar. |
| **6. Timer-Ende** | System | 30 Minuten sind vergangen. | Die Sperrlogik wird reaktiviert. Die Lock-Activity erscheint wieder, falls keine neue Aufgabe zugewiesen wurde oder die Standard-Sperrregeln greifen. |

## Testfall 2: Ablehnung der Aufgabe (Sperre bleibt aktiv)

| Schritt | Akteur | Aktion | Erwartetes Ergebnis |
| :--- | :--- | :--- | :--- |
| **1-3. Zuweisung & Nachweis** | Master/Child | Wie in Testfall 1. Status ist `SUBMITTED`. | |
| **4. Ablehnung** | Master | Ruft `reviewTask` mit `approved: false` auf. | Der Status in Firestore wechselt zu `REJECTED`. |
| **5. Reaktivierung** | Child | | Die Lock-Activity bleibt aktiv und zeigt die Aufgabendetails an. Der Button "Nachweis einreichen" ist wieder verfügbar, um eine erneute Einreichung zu ermöglichen. |

## Testfall 3: Sicherheitsprüfung (Unautorisierter Zugriff)

| Schritt | Akteur | Aktion | Erwartetes Ergebnis |
| :--- | :--- | :--- | :--- |
| **1. Master-Zugriff** | Child | Versucht, `createTask` oder `reviewTask` aufzurufen. | Die Cloud Function gibt einen `permission-denied` oder `unauthenticated` Fehler zurück (basierend auf der Authentifizierung des Child-Tokens). |
| **2. Child-Zugriff** | Master | Versucht, `submitTaskProof` aufzurufen. | Die Cloud Function gibt einen `permission-denied` oder `unauthenticated` Fehler zurück. |
| **3. Falsche Child-ID** | Child A | Ruft `submitTaskProof` für eine Aufgabe auf, die Child B zugewiesen ist. | Die Cloud Function gibt einen `permission-denied` Fehler zurück. |
