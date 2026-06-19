# Component Interface Contract

Stand: 2026-06-19

## Zweck

Dieser Vertrag beschreibt die gemeinsamen Felder, die Android Child, iOS Child, Backend, Parent-UIs, Admin-Panel und Release-Gates verwenden. Er erweitert die bestehende Control-Plane, ohne alte Clients zu brechen.

## Endpoint Registration

Callable Function: `registerDeviceEndpoint`

Pflichtfelder:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `childId` | string | Firestore-ID des Kindgeraets |
| `platform` | `android` oder `ios` | Runtime-Plattform |
| `provider` | `fcm` oder `apns` | Push-Anbieter |
| `token` | string | Push-/Wakeup-Token |
| `appVersion` | string | Anzeigenversion der App |

Optionale Contract-Felder:

| Feld | Typ | Bedeutung |
| --- | --- | --- |
| `component` | string | z. B. `android-child`, `ios-child`, `ios-parent` |
| `interfaceVersion` | number | Version des Client/Backend-Vertrags; aktuell `2` |
| `buildNumber` | string | Build-Code/CFBundleVersion |
| `releaseChannel` | string | `development`, `internal`, `beta`, `production`, `unknown` |
| `capabilities` | string[] | Technische Faehigkeiten des Clients |
| `supportedProtocols` | string[] | Konkrete Protokolle, die der Client spricht |
| `runtime` | object | Sanitisierter Runtime-Kontext |

Backend speichert die Metadaten am `children/{childId}`-Dokument und am jeweiligen `pushEndpoints[]`-Eintrag. Alte Clients ohne optionale Felder werden weiter angenommen.

## Capabilities

Akzeptierte Capabilities:

- `lock`
- `appBlacklist`
- `usageRules`
- `screenTime`
- `screenTimeTokens`
- `offlinePolicy`
- `pushWakeup`
- `foregroundHeartbeat`
- `deviceActivityMonitor`
- `tamperDetection`
- `heartbeat`
- `taskProof`
- `taskPhotoUpload`

Aktuelle Client-Meldung:

| Komponente | Capabilities |
| --- | --- |
| Android Child | `lock`, `appBlacklist`, `usageRules`, `tamperDetection`, `heartbeat`, `taskProof`, `offlinePolicy`, `pushWakeup` |
| iOS Child | `lock`, `appBlacklist`, `usageRules`, `screenTime`, `screenTimeTokens`, `offlinePolicy`, `pushWakeup`, `foregroundHeartbeat`, `heartbeat` |

iOS meldet `taskProof` bewusst nicht, bis Foto-Proof dort implementiert ist.

## Supported Protocols

Akzeptierte Protokolle:

- `control-plane/v1`
- `device-events/v1`
- `android-accessibility-enforcement/v1`
- `android-task-proof/v1`
- `screen-time-token/v1`
- `device-activity-monitor/v1`
- `foreground-heartbeat/v1`
- `remote-mac-evidence/v1`

Aktuelle Client-Meldung:

| Komponente | Protokolle |
| --- | --- |
| Android Child | `control-plane/v1`, `device-events/v1`, `android-accessibility-enforcement/v1`, `android-task-proof/v1` |
| iOS Child | `control-plane/v1`, `device-events/v1`, `screen-time-token/v1`, `foreground-heartbeat/v1` |

## Event Context

`publishDeviceEvent` schreibt zusaetzlich zum Event:

- `senderPlatform`
- `senderComponent`
- `senderInterfaceVersion`
- `senderAppVersion`
- `senderBuildNumber`

Dadurch koennen Admin-Panel, Support und Release-Auswertung Events einer konkreten Client-Version zuordnen.

## Policy Snapshot

`syncPolicySnapshot` liefert in `fullPolicy` neben Policy-Daten auch:

- `platform`
- `capabilities`
- `component`
- `componentInterfaceVersion`
- `supportedProtocols`
- `appVersion`
- `buildNumber`
- `releaseChannel`

Parent-UIs koennen dadurch anzeigen, welche Schnittstelle ein Child aktuell verwendet.

## Akzeptanz

Repo-Gates:

```bash
npm run test:ci -- --silent test/device-sync.test.ts
npm run ios:readiness:gate
```

Release-Gates:

- Android und iOS Child registrieren Endpoint mit `interfaceVersion=2`.
- Admin/Support sieht App-Version, Build, Release-Kanal und Protokolle.
- iOS `taskProof` wird erst gemeldet, wenn Foto-Proof implementiert und getestet ist.
