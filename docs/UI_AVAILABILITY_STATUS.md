# UI Availability Status

<!-- markdownlint-disable MD022 MD029 MD032 -->

Stand: 2026-06-19

## Ziel

Sicherstellen, dass Benutzeroberflächen fuer Besitzer/Eltern, Kindgeraete und Betreiber auf Android, iPhone/iOS und PC vorhanden und testbar sind.

## Umgesetzter Status

1. Android Mobil (Parent App)
- Status: Verfuegbar
- Pfad: `masterApp/`
- Nutzung: Native Android-App fuer Eltern/Besitzer

2. Android Mobil (Child App)
- Status: Verfuegbar
- Pfad: `childApp/`
- Nutzung: Native Android-App fuer Kindgeraet mit Enforcement

3. Native iOS Parent
- Status: Verfuegbar, repo-seitig automatisiert geprueft
- Pfad: `iosMasterApp/`
- Nutzung: Native SwiftUI-App fuer Eltern/Besitzer mit Dashboard, Pairing, Aufgaben und Abo
- Hinweis: App Store/TestFlight Build benoetigt macOS, Xcode 26+ und App Store Connect

4. Native iOS Child
- Status: Verfuegbar, repo-seitig automatisiert geprueft; externe Apple-/Device-Gates offen
- Pfad: `iosChildApp/`
- Nutzung: Native SwiftUI-App fuer Kindgeraet mit Pairing, Policy-Sync, Offline-Policy, FamilyControls/ManagedSettings-Anbindung und Aufgabenliste
- Hinweis: Vollstaendiger Enforcement-Nachweis benoetigt Family Controls entitlement und echtes iPhone/iPad

5. Mobile Browser (Android/iOS)
- Status: Verfuegbar als Zusatz-/Fallback-Oberflaeche
- Pfade: `web-control/`, `admin-panel/`
- Umsetzung: Beide Web-UIs als PWA installierbar (Manifest + Service Worker + Icon)
- Hinweis: iOS ist nicht mehr nur PWA; native Swift-Apps liegen zusaetzlich unter `iosMasterApp/` und `iosChildApp/`

6. PC Browser
- Status: Verfuegbar
- Pfade: `web-control/index.html`, `admin-panel/index.html`
- Nutzung: Direkter Zugriff ueber Browser

7. PC Native Desktop App
- Status: Verfuegbar
- Pfad: `desktop/`
- Umsetzung: Electron-Launcher mit Einstieg fuer Parent-Panel und Operator-Dashboard
- Startbefehl: `npx electron desktop/main.js`

## Technische Ergaenzungen

- iOS Native:
  - `iosMasterApp/Package.swift`
  - `iosMasterApp/Sources/MiniMasterParent/App/RootView.swift`
  - `iosChildApp/Package.swift`
  - `iosChildApp/Sources/MiniMasterChild/Views/MainChildView.swift`
  - `iosChildApp/MiniMasterChild.entitlements`
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

- iOS Repo-Gate: `npm run ios:readiness:gate`
- Play/Android Repo-Gate: `npm run playstore:protocol:gate`
- Gesamttests: `npm run test:ci -- --silent`
- iOS Runtime-Nachweis: offen bis Remote-Mac-Agent/Xcode Cloud oder manueller Mac + echtes iPhone/iPad angebunden ist
