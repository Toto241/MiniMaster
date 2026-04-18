// MiniMaster Admin-Panel – Format-Helper (Welle 1 Step 3)
// Pure Helfer fuer Datums-/Status-Formatierung. Spiegelt die in admin-panel/app.js
// definierten Wrapper formatQaRefreshTimestamp / formatPythonAutomationTimestamp,
// indem ein generischer Kern + zwei Aliase mit eigenem Fallback-Text exportiert
// werden. Originalfunktionen in app.js bleiben als Fallback bestehen.

import { register } from "./registry.js";

function _formatTimestamp(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("de-DE");
}

function _formatQaRefreshTimestamp(value) {
  return _formatTimestamp(value, "noch nicht");
}

function _formatPythonAutomationTimestamp(value) {
  return _formatTimestamp(value, "noch nicht protokolliert");
}

export const formatTimestamp = _formatTimestamp;
export const formatQaRefreshTimestamp = _formatQaRefreshTimestamp;
export const formatPythonAutomationTimestamp = _formatPythonAutomationTimestamp;

register("format", {
  timestamp: _formatTimestamp,
  qaRefreshTimestamp: _formatQaRefreshTimestamp,
  pythonAutomationTimestamp: _formatPythonAutomationTimestamp,
});
