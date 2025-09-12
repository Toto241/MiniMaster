# Fehlercode Matrix (Cloud Functions)

| Code | Verwendet in | Bedingung | Bemerkung |
|------|--------------|-----------|-----------|
| invalid-argument | alle callable Eingänge | Fehlende oder falsche Typ-Argumente | Immer früh werfen |
| already-exists | registerMasterDevice | IMEI bereits registriert | Keine Wiederverwendung von Secret |
| unauthenticated | generatePairingLink, setDeviceLocked, updateAppBlacklist, setUsageRules, verifyPurchase, getSubscriptionStatus | Secret/IMEI Kombination ungültig | Auth-Ersatz mangels User Accounts |
| permission-denied | setDeviceLocked, updateAppBlacklist, setUsageRules, createTask, approveTask (indirekt via Master/Child Bindung) | Master nicht Besitzer des Child | AuthZ via masterImei Feld |
| resource-exhausted | createPairingCode | 10 Kollisionen bei Code-Generierung | Retry später |
| deadline-exceeded | validatePairingCode, validatePairingToken | Expired Timestamp > now | Dokument wird gelöscht |

| not-found | validatePairingCode, validatePairingToken, recordHeartbeat, registerFcmToken, approveTask (Task), completeTask (Task), setDeviceLocked (Child) | Dokument existiert nicht | Nicht mit invalid-argument verwechseln |

| internal | createPairingCode, validatePairingCode, validatePairingToken u.a. | Unerwarteter Fehler / Daten-Malformation | Mit DATA_CORRUPTION Log Präfix bei strukturellem Problem |
| failed-precondition | completeTask, approveTask | Ungültiger Status-Übergang | Neu eingeführt für State Machine |
| permission-denied | verifyPurchase | Kauf-Token ungültig | API Verifikation fehlgeschlagen |

Hinweis: `internal` und `DATA_CORRUPTION` Log Präfixe trennen zwischen externem Fehler (Stack) und inkonsistent gespeicherten Feldern. Künftige Hardening-Stufe: eigener Code `data-corruption` (Breaking Change!)

## Status Maschine (Tasks)

```text
pending -> pending_approval (completeTask)
pending_approval -> approved (approveTask)
Alle anderen Übergänge -> failed-precondition
```

## Kompatibilitäts-Altlast

`validatePairingToken` gibt `{ childId: masterImei }` zurück (historisch). Deprecation geplant: künftig `{ masterImei }`.
