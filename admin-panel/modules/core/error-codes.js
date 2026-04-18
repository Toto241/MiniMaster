// MiniMaster Admin-Panel – Error-Codes-Modul (Welle 1 Step 5)
// Pure Helfer fuer die Normalisierung von Cloud-Functions/Auth-Fehlercodes
// und die Abbildung auf operatorfreundliche Hinweise.
// 1:1 Spiegelung von normalizeCallableErrorCode, normalizeAuthErrorCode,
// getAccessKeyErrorHint und getAuthErrorHint aus admin-panel/app.js.

import { register } from "./registry.js";

function _normalizeCode(error) {
  const raw = typeof error?.code === "string" ? error.code.trim().toLowerCase() : "";
  if (!raw) return "";
  return raw.startsWith("functions/") ? raw.slice("functions/".length) : raw;
}

function _getAccessKeyErrorHint(error, fallbackMessage) {
  const code = _normalizeCode(error);
  const message = (fallbackMessage || error?.message || "").toString();

  if (message.includes("Unexpected token") || message.includes("JSON")) {
    return {
      title: "Dateiformat ungültig",
      tip: "Die Datei ist kein valides JSON. Bitte nur eine unveränderte .json-Schlüsseldatei aus dem Admin-Panel verwenden.",
    };
  }

  const map = {
    "invalid-argument": { title: "Ungültige Eingabe", tip: "Schlüsseldatei, Rolle oder Ablaufzeit sind ungültig. Bitte Eingaben prüfen und erneut versuchen." },
    "unauthenticated": { title: "Nicht angemeldet", tip: "Sie müssen im Operator-Konto angemeldet sein, bevor Schlüssel erzeugt oder eingelöst werden können." },
    "permission-denied": { title: "Keine Berechtigung", tip: "Dieser Schlüssel ist ungültig/widerrufen oder Ihr Konto darf aktuell keine Schlüssel erzeugen." },
    "deadline-exceeded": { title: "Schlüssel abgelaufen", tip: "Die Schlüsseldatei hat das Ablaufdatum überschritten. Bitte eine neue Datei erzeugen." },
    "failed-precondition": { title: "Bereits verwendet", tip: "Die Schlüsseldatei wurde bereits eingelöst (One-Time-Key). Bitte neue Datei generieren." },
    "not-found": { title: "Schlüssel nicht gefunden", tip: "Zum Schlüssel existiert kein passender Eintrag mehr im Backend. Bitte neue Datei erzeugen." },
    "unavailable": { title: "Backend nicht erreichbar", tip: "Cloud Functions sind aktuell nicht erreichbar. Netzwerk/Deployment prüfen und erneut versuchen." },
    "internal": { title: "Interner Serverfehler", tip: "Im Backend ist ein interner Fehler aufgetreten. Bitte Logs prüfen und Vorgang wiederholen." },
  };

  return map[code] || {
    title: "Allgemeiner Fehler",
    tip: "Bitte Eingaben und Verbindung prüfen. Falls der Fehler bleibt, Debug-Code und Logs auswerten.",
  };
}

function _getAuthErrorHint(error, fallbackMessage, scope) {
  const code = _normalizeCode(error);
  const message = (fallbackMessage || error?.message || "").toString();

  if (message.includes("Unexpected token") || message.includes("JSON")) {
    return {
      title: "Datenformat ungültig",
      tip: "Die empfangenen Daten konnten nicht korrekt verarbeitet werden. Seite neu laden und Vorgang erneut ausführen.",
    };
  }

  const map = {
    "auth/email-already-in-use": { title: "E-Mail bereits vergeben", tip: "Diese E-Mail existiert bereits. Nutzen Sie den Login-Tab oder Passwort-Reset." },
    "auth/weak-password": { title: "Passwort zu schwach", tip: "Verwenden Sie ein längeres Passwort mit Buchstaben, Zahlen und Sonderzeichen." },
    "auth/invalid-email": { title: "E-Mail ungültig", tip: "Bitte E-Mail-Format prüfen, z. B. name@domain.tld." },
    "auth/user-not-found": { title: "Konto nicht gefunden", tip: "Für diese E-Mail existiert kein Passwort-Konto oder Enumeration-Protection ist aktiv." },
    "auth/wrong-password": { title: "Passwort falsch", tip: "Passwort erneut eingeben oder den Reset-Flow verwenden." },
    "auth/invalid-credential": { title: "Ungültige Zugangsdaten", tip: "E-Mail/Passwort prüfen. Bei wiederholtem Fehler Passwort zurücksetzen." },
    "auth/too-many-requests": { title: "Zu viele Versuche", tip: "Bitte kurz warten und erneut versuchen. Bei Bedarf Passwort-Reset nutzen." },
    "auth/network-request-failed": { title: "Netzwerkproblem", tip: "Internetverbindung, Firewall/Proxy und Firebase-Konfiguration prüfen." },
    "auth/operation-not-allowed": { title: "Methode deaktiviert", tip: "In Firebase Authentication ist die gewünschte Anmeldemethode nicht aktiviert." },
    "permission-denied": { title: "Keine Berechtigung", tip: "Der Vorgang ist mit dem aktuellen Konto nicht erlaubt." },
    "unauthenticated": { title: "Nicht angemeldet", tip: "Bitte anmelden und Vorgang erneut ausführen." },
    "invalid-argument": { title: "Ungültige Eingabe", tip: "Bitte Eingabefelder prüfen und erneut versuchen." },
  };

  if (map[code]) return map[code];

  const defaults = {
    registration: { title: "Registrierung fehlgeschlagen", tip: "E-Mail/Passwort und Firebase Auth-Einstellungen prüfen." },
    adminActivation: { title: "Admin-Aktivierung fehlgeschlagen", tip: "Berechtigungen und Bootstrap-Status prüfen, dann Vorgang erneut ausführen." },
    providerCheck: { title: "Provider-Prüfung fehlgeschlagen", tip: "Verbindung und Firebase Auth-Konfiguration prüfen." },
    reset: { title: "Reset fehlgeschlagen", tip: "E-Mail prüfen und bei Bedarf nach kurzer Wartezeit erneut versuchen." },
    login: { title: "Anmeldung fehlgeschlagen", tip: "Zugangsdaten prüfen oder Passwort-Reset verwenden." },
  };

  return defaults[scope] || {
    title: "Allgemeiner Fehler",
    tip: "Bitte Eingaben und Verbindung prüfen. Falls der Fehler bleibt, Debug-Code auswerten.",
  };
}

export const normalizeCallableErrorCode = _normalizeCode;
export const normalizeAuthErrorCode = _normalizeCode;
export const getAccessKeyErrorHint = _getAccessKeyErrorHint;
export const getAuthErrorHint = _getAuthErrorHint;

register("errorCodes", {
  normalizeCallable: _normalizeCode,
  normalizeAuth: _normalizeCode,
  accessKeyHint: _getAccessKeyErrorHint,
  authHint: _getAuthErrorHint,
});
