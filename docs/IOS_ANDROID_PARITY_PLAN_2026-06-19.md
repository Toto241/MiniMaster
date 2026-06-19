# iOS Android Parity Plan

Stand: 2026-06-19

## Ziel

iPhone/iOS soll auf ein mit Android vergleichbares Niveau gebracht werden. Repo-seitig bedeutet das: native Parent- und Child-Oberflaechen, Pairing, Policy-Sync, Sperren, App-Regeln, Aufgaben, Abo und automatisierte Readiness-Gates sind vorhanden. Release-seitig bedeutet das zusaetzlich: Apple-Entitlements, Xcode/TestFlight, App Store Connect und echte iPhone/iPad-Enforcement-Nachweise sind belegt.

## Aktueller Paritaetsstand

| Bereich | Android Stand | iOS Stand | Status |
| --- | --- | --- | --- |
| Besitzer/Parent UI | Native Android Parent App | Native iOS Parent App mit Dashboard, Pairing-Tab, Aufgaben, Abo | Repo-seitig vergleichbar |
| Kind UI | Native Android Child App | Native iOS Child App mit Pairing, Status, FamilyControls Recovery, Aufgabenliste | Repo-seitig vergleichbar |
| Pairing | Code/Link und Backend Pairing | Code/Token, persistierter childId, Endpoint Registration | Repo-seitig vergleichbar |
| Lock/Unlock | Android Enforcement | ManagedSettings Shield fuer Full Lock | Source vorhanden, Device-E2E offen |
| App-Blacklist | Android Bundle-ID Enforcement | iOS Screen-Time-Token Enforcement; Legacy Bundle IDs nur Hinweis | Source vorhanden, Device-E2E offen |
| Offline Policy | Lokale Policy bleibt aktiv | OfflinePolicyCache + persisted PolicyStore | Source vorhanden, Device-E2E offen |
| Heartbeat/Sync | Background/FCM/Command Ack | APNs/FCM Token, Command Ack, Foreground-Heartbeat | Source vorhanden, Background-Evidence offen |
| Usage Limit | Android usage enforcement | DeviceActivitySchedule vorhanden | P0 offen: DeviceActivityMonitor Extension |
| Aufgaben | Anzeige/Review/Proof Flow | Parent Review vorhanden, Child Task-Liste vorhanden | P0 offen: Task Photo Upload |
| Abo | Billing/Backend Verify | StoreKit2/Backend Verify | Source vorhanden, ASC Sandbox offen |
| Release Automation | Play-Gates und AAB-Build | `ios:readiness` Gate, Remote-Mac-Agent Vertrag | Repo-Gate vorhanden, Mac-Adapter offen |

## Bereits umgesetzt in diesem Pass

- Parent iOS: `PairingView` ist als eigener Tab in `MainTabView` sichtbar.
- Child iOS: FamilyControls/Screen-Time-Status und erneute Autorisierung sind in `MainChildView` sichtbar.
- Child iOS: Pairing fordert nach erfolgreicher Kopplung FamilyControls-Autorisierung an.
- Child iOS: Unpair entfernt lokale ManagedSettings-Shields, stoppt DeviceActivity-Monitoring und leert den PolicyStore.
- Child iOS: Foreground-Heartbeat laeuft nach Pairing/App-Start in 15-Minuten-Buckets.
- Child iOS: Commands wenden nach PolicyStore-Update die vollstaendige Policy an, damit Lock und App-Blacklist nicht gegeneinander arbeiten.
- Automatisierung: `scripts/ios_readiness.py`, `npm run ios:readiness`, `npm run ios:readiness:gate`.
- Tests: Python-Gate-Tests und Swift Source-Contract-Tests fuer FamilyControls Recovery, Safe-Unpair und Heartbeat.

## Geplante P0-Implementierungen vor iOS Release

1. DeviceActivityMonitor Extension
- Ziel: Daily usage limits wirklich erzwingen, nicht nur Schedule starten.
- Umsetzung: Xcode Target/Extension anlegen, Threshold Events verarbeiten, ManagedSettings bei Limit erreichen setzen, Events an `publishDeviceEvent` melden.
- Nachweis: Xcode Build, Unit/XCUITest soweit moeglich, physisches iPhone/iPad mit Limit-Ueberschreitung.

2. Task Photo Upload
- Ziel: Aufgaben-Proof wie auf Android.
- Umsetzung: PhotosUI/Kamera-Auswahl, Firebase Storage Upload, `task_proof` Event, Parent Review Anzeige pruefen.
- Nachweis: Child Upload, Backend Event, Parent Task Review, Storage Rules.

3. Remote-Mac-Agent oder Xcode Cloud
- Ziel: wiederholbarer iOS Build/Test/Upload-Nachweis.
- Umsetzung: vorhandenen Remote-Mac-Agent Vertrag an echten Mac-Runner anbinden oder Xcode Cloud nutzen.
- Nachweis: JSON/Markdown Run-Historie und App Store Connect Processing Evidence.

## Externe Apple-Gates

- Family Controls entitlement fuer `com.minimaster.childapp` genehmigen und provisionieren.
- App Store Connect Records fuer Parent und Child anlegen.
- Uploads mit Xcode 26+ und iOS 26 SDK erzeugen.
- TestFlight Internal Testing fuer beide Apps aktivieren.
- StoreKit Produkte/Sandbox fuer Parent Abo pruefen.
- App Privacy Labels, Age Rating, Review Notes und Support/Privacy URLs eintragen.
- Physical Device E2E fuer FamilyControls, Lock/Unlock, App-Blacklist, Offline-Policy und Aufgabenfluss dokumentieren.

## Akzeptanz-Gates

Repo-seitig:

```bash
npm run ios:readiness:gate
npm run test:ci -- --silent
```

Release-seitig:

- `build/ios-readiness/latest.json` zeigt `repoGateReady=true`.
- `releaseReady=false` bleibt korrekt, bis externe Apple- und Device-Nachweise belegt sind.
- Nach Mac/TestFlight/Device-Lauf werden die Nachweise in `docs/RELEASE_EVIDENCE_REGISTER.md` verlinkt.

## Apple-Referenzen

- Xcode 26/iOS 26 SDK Upload-Anforderung seit 2026-04-28: <https://developer.apple.com/news/upcoming-requirements/>
- App Store Connect Build Uploads und API: <https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/>
- FamilyControls: <https://developer.apple.com/documentation/familycontrols>
- App Store Connect API: <https://developer.apple.com/documentation/appstoreconnectapi>
- Privacy Labels: <https://www.apple.com/privacy/labels/>
