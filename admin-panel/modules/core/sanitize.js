// MiniMaster Admin-Panel – Sanitize-Modul (Welle 1)
// Spiegelt die in admin-panel/app.js definierten Helfer 1:1 wider und registriert sie
// auf window.MM.sanitize. Die Originalfunktionen in app.js bleiben als Fallback bestehen,
// bis die kompletten Aufrufer in spaeteren Wellen migriert sind.

import { register } from "./registry.js";

function _sanitizeAdbSerial(value) {
  const serial = String(value || "").trim();
  if (!serial) return "";
  return /^[A-Za-z0-9._:-]+$/.test(serial) ? serial : "";
}

function _sanitizeApkPath(value, fallbackPath) {
  const apkPath = String(value || "").trim();
  if (!apkPath) return fallbackPath;
  if (!/\.apk$/i.test(apkPath)) return fallbackPath;
  if (/[\r\n`;&|<>$"']/.test(apkPath)) return fallbackPath;
  return apkPath;
}

function _escapePowerShellString(value) {
  return String(value || "").replace(/`/g, "``").replace(/"/g, "`\"");
}

export const sanitizeAdbSerial = _sanitizeAdbSerial;
export const sanitizeApkPath = _sanitizeApkPath;
export const escapePowerShellString = _escapePowerShellString;

register("sanitize", {
  adbSerial: _sanitizeAdbSerial,
  apkPath: _sanitizeApkPath,
  powerShellString: _escapePowerShellString,
});
