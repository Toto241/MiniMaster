# MiniMaster Operator Dashboard

Web-Dashboard fuer Betreiber/Admins.

## Funktionen

- KPI Uebersicht (Users, Tasks, Tickets, Errors)
- User- und Subscription-Verwaltung
- Support-Ticket-Management
- Compliance-Exports (DSAR, Audit)
- Cloud Setup & Assistant Tab (Health Checks, Checkliste, Setup-Report)
- Recht & Datenschutz Tab mit Legal-Policy-Management (laden, veröffentlichen, Re-Consent)
- Google Play Store Readiness Modul (Pflicht-Checks, Status, JSON-Export)
- P0 Blocker Cockpit (Go-Live): Security/Play/Commissioning/Operations-Blocker mit Evidenz, Export und Reset
- Automatisches Markieren von P0-Checks bei erfolgreichen Support-/Compliance-Aktionen und Readiness-Signalen

## Setup

1. Firebase-Konfiguration über das Bootstrap-Formular im Dashboard speichern (lokal in `operatorFirebaseConfigOverride`).
2. Sicherstellen, dass der Benutzer in Firebase Auth existiert und den Claim `role: "admin"` besitzt.
3. Hosting bereitstellen oder lokal statisch ausliefern.

## Admin-User anlegen

Mit lokalem `serviceAccountKey.json` im Projektroot:

```bash
node scripts/setup-admin.js <email> <passwort>
```

## Lokal starten

Das Panel ist statisch und kann mit einem beliebigen HTTP-Server gestartet werden, z. B.:

```bash
python -m http.server 8080
```

Dann `http://localhost:8080/admin-panel/` aufrufen.

## Troubleshooting

- Login erfolgreich, aber "Access Denied": Admin-Claim fehlt oder Token nicht erneuert.
- Firebase init Fehler: Platzhalter in `firebaseConfig` wurden nicht ersetzt.
- Keine Daten sichtbar: Firestore Rules/Collections oder Berechtigungen pruefen.
- P0-Cockpit aktualisiert sich nicht: Browser-Cache leeren und sicherstellen, dass Aktionen erfolgreich durchlaufen (nur erfolgreiche Flows auto-markieren).
