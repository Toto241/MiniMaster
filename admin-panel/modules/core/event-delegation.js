// MiniMaster Admin-Panel - Event Delegation (Welle 3 Vorbereitung)
// Bereitstellung eines wiederverwendbaren Click-Delegations-Helfers fuer
// die schrittweise Migration der 194 Inline-onclick-Handler im Admin-Panel
// (siehe build/reports/onclick-audit.md).
//
// Diese Iteration registriert nur das Modul. Es wird nicht automatisch
// aktiviert; die schrittweise Migration aktiviert es kontrolliert pro
// Tab-Bereich, sobald die jeweiligen Buttons auf data-action umgestellt
// sind.
import { register } from "./registry.js";

// Resolved den Handler aus einem Lookup (z.B. window oder MM-Registry).
// Default-Lookup: globalThis (Browser-Window).
function _resolveHandler(name, lookup) {
  const scope = lookup || (typeof globalThis !== "undefined" ? globalThis : {});
  const fn = scope[name];
  return typeof fn === "function" ? fn : null;
}

// Erzeugt einen Delegations-Listener, der auf Klicks innerhalb von root
// hoert und Funktionen aus lookup ausfuehrt, deren Name aus dem
// data-action-Attribut des naechsten passenden Vorfahren stammt.
function _createDelegatedClickHandler(options) {
  const opts = options || {};
  const lookup = opts.lookup || null;
  const attribute = opts.attribute || "data-action";
  const selector = `[${attribute}]`;

  return function handleDelegatedClick(event) {
    const target = event && event.target && typeof event.target.closest === "function"
      ? event.target.closest(selector)
      : null;
    if (!target) return false;
    const name = target.getAttribute(attribute);
    if (!name) return false;
    const fn = _resolveHandler(name, lookup);
    if (!fn) return false;
    if (typeof event.preventDefault === "function") event.preventDefault();
    try {
      fn.call(target, event);
      return true;
    } catch (err) {
      // Fehler werden bewusst nicht geschluckt - logge defensiv und re-throw,
      // damit echte Bugs nicht im Delegator versteckt werden.
      if (typeof console !== "undefined" && console && typeof console.error === "function") {
        console.error("[event-delegation] handler", name, "threw", err);
      }
      throw err;
    }
  };
}

// Bindet den Delegator an root (Default: document) und liefert eine
// detach-Funktion zurueck.
function _attachDelegatedClicks(root, options) {
  const node = root || (typeof document !== "undefined" ? document : null);
  if (!node || typeof node.addEventListener !== "function") {
    return function noop() { /* no-op */ };
  }
  const handler = _createDelegatedClickHandler(options);
  node.addEventListener("click", handler);
  return function detach() {
    node.removeEventListener("click", handler);
  };
}

export const createDelegatedClickHandler = _createDelegatedClickHandler;
export const attachDelegatedClicks = _attachDelegatedClicks;

register("eventDelegation", {
  createDelegatedClickHandler: _createDelegatedClickHandler,
  attachDelegatedClicks: _attachDelegatedClicks,
});
