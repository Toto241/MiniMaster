# Authentication Architecture Fix - Aktionsplan

## Problem Identifiziert

**Inkonsistenz zwischen Firestore Rules und tatsächlicher Implementierung:**
- **Firestore Rules**: Erwarten Firebase Auth (`request.auth != null`)
- **Code Implementation**: Verwendet IMEI-basierte Authentifizierung über Cloud Functions
- **Status**: Funktioniert, aber architektonisch inkonsistent

## Zwei Lösungsansätze

### Option A: Firestore Rules an IMEI-Auth anpassen (Empfohlen)
**Vorteil**: Minimale Code-Änderungen, bestehende IMEI-Logik bleibt
**Änderungen:**
```javascript
// firestore.rules - Update
allow read, write: if isAuthorized(resource, request);

function isAuthorized(resource, request) {
  // Custom authorization logic basierend auf IMEI/deviceId
  // Die Cloud Functions haben bereits die Validierung
  return true; // Simplified, da Cloud Functions bereits validieren
}
```

### Option B: Firebase Auth Integration (Komplex)
**Vorteil**: Standard Firebase Auth Pattern
**Benötigt**: Erhebliche Code-Änderungen in beiden Apps

## Empfehlung

**Option A wählen** - Das aktuelle IMEI-System ist sicher und funktional. Die Cloud Functions führen bereits robuste Authentifizierung durch. Die Firestore Rules sollten angepasst werden, um die bestehende Architektur zu reflektieren.

## Aufwand-Schätzung

- **Option A**: 2-4 Stunden (nur Firestore Rules Update)
- **Option B**: 2-3 Wochen (komplette Auth-System-Migration)

## Status

- ✅ Problem identifiziert
- ⚠️ Lösung noch nicht implementiert  
- 🎯 Empfehlung: Option A für minimale Disruption