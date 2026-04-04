# UI Availability Status

<!-- markdownlint-disable MD022 MD029 MD032 -->

Stand: 2026-04-04

## Ziel
Sicherstellen, dass die Nutzeroberflächen auf Mobiltelefonen und PCs verfügbar und nutzbar sind.

## Umgesetzter Status

1. Android Mobil (Parent App)
- Status: Verfuegbar
- Pfad: `masterApp/`
- Nutzung: Native Android-App fuer Eltern

2. Android Mobil (Child App)
- Status: Verfuegbar
- Pfad: `childApp/`
- Nutzung: Native Android-App fuer Kindgeraet mit Accessibility-Enforcement

3. Mobile Browser (Android/iOS)
- Status: Verfuegbar
- Pfade: `web-control/`, `admin-panel/`
- Umsetzung: Beide Web-UIs als PWA installierbar (Manifest + Service Worker + Icon)
- Hinweis: Auf iOS erfolgt Nutzung als installierbare Web-App (Add to Home Screen), nicht als native Swift-App

4. PC Browser
- Status: Verfuegbar
- Pfade: `web-control/index.html`, `admin-panel/index.html`
- Nutzung: Direkter Zugriff ueber Browser

5. PC Native Desktop App
- Status: Verfuegbar
- Pfad: `desktop/`
- Umsetzung: Electron-Launcher mit Einstieg fuer Parent-Panel und Operator-Dashboard
- Startbefehl: `npx electron desktop/main.js`

## Technische Ergaenzungen
- PWA Parent Panel:
  - `web-control/manifest.webmanifest`
  - `web-control/service-worker.js`
  - `web-control/pwa-register.js`
  - `web-control/icon.svg`
- PWA Admin Panel:
  - `admin-panel/manifest.webmanifest`
  - `admin-panel/service-worker.js`
  - `admin-panel/pwa-register.js`
  - `admin-panel/icon.svg`
- Desktop-Komponenten:
  - `desktop/main.js`
  - `desktop/preload.js`
  - `desktop/launcher.html`
  - `desktop/README.md`

## Validierung
- Lint: erfolgreich
- Aktueller Repo-Stand: Branch identisch zu `main` zum Zeitpunkt dieser Aktualisierung
- Tests: `npm run test:ci` erfolgreich mit 41/41 Suites und 1506/1506 Tests, inklusive `test/admin-panel-helpers.test.ts`, `test/web-control-ui.test.ts` und `test/start-page.test.ts`
- Hinweis: Die UI-Verfügbarkeit wird damit aktuell sowohl über den statischen Startpfad als auch über die Web-UI-Testabdeckung abgesichert
