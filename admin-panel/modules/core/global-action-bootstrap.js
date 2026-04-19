// MiniMaster Admin-Panel - Global Action Bootstrap (F6 CSP-Refactor Stufe 2)
//
// Ergaenzung zu nav-bootstrap.js: registriert einen globalen Click-Handler
// auf document, der Buttons mit `data-action="funcName"` an `window[funcName]`
// delegiert. Optionale Argumente koennen als JSON-Array in `data-args` uebergeben
// werden, z.B. `data-args='["checkExpiredSubscriptions"]'`.
//
// Reservierte Aktionen, die eigene Handler haben (z.B. "logout"), werden
// uebersprungen, damit kein Doppelaufruf entsteht.
import { register } from "./registry.js";

const RESERVED_ACTIONS = new Set(["logout"]);

let _bound = false;

function _resolveDoc() {
  return (typeof document !== "undefined" && document)
    || (typeof window !== "undefined" && window && window.document)
    || null;
}

function _parseArgs(raw) {
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_err) {
    return [String(raw)];
  }
}

function _onDocClick(event) {
  const target = event && event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-action]")
    : null;
  if (!target) return;
  const action = target.getAttribute("data-action");
  if (!action || RESERVED_ACTIONS.has(action)) return;
  const fn = (typeof window !== "undefined" && typeof window[action] === "function")
    ? window[action]
    : null;
  if (!fn) return;
  const args = _parseArgs(target.getAttribute("data-args"));
  if (typeof event.preventDefault === "function") event.preventDefault();
  try {
    fn.apply(target, args);
  } catch (err) {
    if (typeof console !== "undefined" && console && typeof console.warn === "function") {
      console.warn("[global-action-bootstrap] action failed", action, err);
    }
  }
}

function _bind() {
  if (_bound) return;
  const doc = _resolveDoc();
  if (!doc || typeof doc.addEventListener !== "function") return;
  doc.addEventListener("click", _onDocClick);
  _bound = true;
}

(function _autoBind() {
  const doc = _resolveDoc();
  if (!doc) return;
  if (doc.readyState === "loading" && typeof doc.addEventListener === "function") {
    doc.addEventListener("DOMContentLoaded", _bind);
  } else {
    _bind();
  }
})();

register("globalActionBootstrap", {
  bind: _bind,
  // Exportiert fuer Tests:
  _onDocClick,
  _parseArgs,
  RESERVED_ACTIONS,
});
