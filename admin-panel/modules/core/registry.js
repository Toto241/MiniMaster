// MiniMaster Admin-Panel – Module Registry (Welle 1 / Top-Down Step 1)
// Stellt einen window.MM-Namespace bereit, in dem ESM-Module ihre Exports registrieren.
// Klassisches admin-panel/app.js (Non-Module) behaelt seine Definitionen als Fallback,
// neue Module fuegen sich additiv ein, ohne Bestehendes zu brechen.

const NAMESPACE = "MM";

function _register(name, exportsObject) {
  if (typeof name !== "string" || !name) {
    throw new TypeError("MM.register: name muss ein nicht-leerer String sein");
  }
  if (!exportsObject || typeof exportsObject !== "object") {
    throw new TypeError("MM.register: exports muss ein Objekt sein");
  }
  const root = ensureNamespace(getGlobal());
  root.modules[name] = exportsObject;
  root[name] = exportsObject;
  return exportsObject;
}

function _get(name) {
  const root = ensureNamespace(getGlobal());
  return root.modules[name];
}

function _list() {
  const root = ensureNamespace(getGlobal());
  return Object.keys(root.modules);
}

function ensureNamespace(globalScope) {
  if (!globalScope[NAMESPACE]) {
    globalScope[NAMESPACE] = {
      version: "1.0.0",
      modules: Object.create(null),
      register: _register,
      get: _get,
      list: _list,
    };
  }
  return globalScope[NAMESPACE];
}

function getGlobal() {
  if (typeof window !== "undefined") return window;
  if (typeof globalThis !== "undefined") return globalThis;
  throw new Error("MM registry: kein globaler Scope verfuegbar");
}

export const register = _register;
export const get = _get;
export const list = _list;

// Auto-Initialisierung beim Modul-Import
ensureNamespace(getGlobal());
