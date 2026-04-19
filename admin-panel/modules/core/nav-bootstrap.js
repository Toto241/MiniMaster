// MiniMaster Admin-Panel - Nav Bootstrap (F6 CSP-Refactor Stufe 1)
//
// Ersetzt die 14 inline `onclick="switchTab(...)"`-Handler in der
// Top-Level-Navigation und den `onclick="logout()"`-Handler durch
// Event-Delegation. Reduziert die Zahl der Inline-Handler in
// admin-panel/index.html und ist Voraussetzung fuer
// `script-src 'self'` ohne `unsafe-inline`.
//
// Aktivierung: laeuft auf DOMContentLoaded (oder sofort, falls der
// DOM bereits bereit ist). Idempotent: mehrfache Aufrufe binden
// nicht doppelt.
import { register } from "./registry.js";

let _bound = false;

function _resolveSwitchTab() {
  if (typeof window !== "undefined" && typeof window.switchTab === "function") {
    return window.switchTab;
  }
  return null;
}

function _resolveLogout() {
  if (typeof window !== "undefined" && typeof window.logout === "function") {
    return window.logout;
  }
  return null;
}

function _onNavClick(event) {
  const target = event && event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-tab]")
    : null;
  if (!target) return;
  const tab = target.getAttribute("data-tab");
  if (!tab) return;
  const fn = _resolveSwitchTab();
  if (!fn) return;
  // switchTab nutzt evt.target zur active-Klasse - immer den Button uebergeben,
  // auch wenn der Klick von einem inneren Element kam.
  fn(tab, { target });
}

function _onLogoutClick(event) {
  const target = event && event.target && typeof event.target.closest === "function"
    ? event.target.closest("[data-action='logout']")
    : null;
  if (!target) return;
  const fn = _resolveLogout();
  if (!fn) return;
  if (typeof event.preventDefault === "function") event.preventDefault();
  fn();
}

function _bind() {
  if (_bound) return;
  const doc = (typeof document !== "undefined" && document)
    || (typeof window !== "undefined" && window && window.document)
    || null;
  if (!doc) return;
  const nav = doc.getElementById("dashboard-nav");
  if (nav && typeof nav.addEventListener === "function") {
    nav.addEventListener("click", _onNavClick);
  }
  const logoutBtn = doc.getElementById("logout-btn");
  if (logoutBtn && typeof logoutBtn.addEventListener === "function") {
    logoutBtn.addEventListener("click", _onLogoutClick);
  }
  _bound = true;
}

(function _autoBind() {
  const doc = (typeof document !== "undefined" && document)
    || (typeof window !== "undefined" && window && window.document)
    || null;
  if (!doc) return;
  if (doc.readyState === "loading" && typeof doc.addEventListener === "function") {
    doc.addEventListener("DOMContentLoaded", _bind);
  } else {
    _bind();
  }
})();

register("navBootstrap", {
  bind: _bind,
  // Exportiert fuer Tests:
  _onNavClick,
  _onLogoutClick,
});
