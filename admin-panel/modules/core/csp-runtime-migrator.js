// MiniMaster Admin-Panel - CSP Runtime Migrator
//
// The admin panel has a large legacy surface that still renders some action
// buttons and layout details from string templates. Production hosting serves a
// strict CSP without script/style inline execution. This module converts those
// generated inline event/style attributes into external-script-managed listeners
// and stylesheet rules at runtime, without dynamic code compilation.
import { register } from "./registry.js";

const EVENT_ATTRIBUTES = [
  { attr: "onclick", eventName: "click", boundAttr: "data-mm-csp-click-bound" },
  { attr: "onchange", eventName: "change", boundAttr: "data-mm-csp-change-bound" },
];

let _bound = false;
let _styleCounter = 0;
const _styleClassByDeclaration = new Map();

function _resolveDoc() {
  return (typeof document !== "undefined" && document)
    || (typeof window !== "undefined" && window && window.document)
    || null;
}

function _decodeJsString(raw) {
  return String(raw)
    .replace(/\\'/g, "'")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function _splitArgs(rawArgs) {
  const args = [];
  let current = "";
  let quote = "";
  let escaped = false;
  let depth = 0;

  for (const char of String(rawArgs || "")) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") depth++;
    if (char === ")" || char === "]" || char === "}") depth--;
    if (char === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim() || String(rawArgs || "").trim()) {
    args.push(current.trim());
  }
  return args;
}

function _parseArg(raw, target) {
  const value = String(raw || "").trim();
  if (!value) return undefined;
  if (value === "this.checked") return Boolean(target && target.checked);
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const quoted = value.match(/^(['"])([\s\S]*)\1$/);
  if (quoted) return _decodeJsString(quoted[2] || "");
  return value;
}

function _parseCallExpression(expression, target) {
  const expr = String(expression || "").trim().replace(/;+\s*$/, "");
  const simple = expr.match(/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/);
  if (simple) {
    const action = simple[1];
    const args = _splitArgs(simple[2] || "").map((arg) => _parseArg(arg, target));
    return { action, args };
  }

  if (expr === "window.location.reload()") {
    return { action: "__reload", args: [] };
  }

  if (expr === "ensureAndroidCompatibilityPreflightLoaded({ forceRefresh: true }).then(() => rerenderQaExecutionGuideFromCache())") {
    return { action: "__refreshAndroidCompatibilityPreflight", args: [] };
  }

  if (expr === "window._resetBlocksPhaseChange=false;auth.signOut().then(function(){window.location.reload()})") {
    return { action: "__resetAndReloadAfterSignOut", args: [] };
  }

  return null;
}

function _executeParsed(parsed) {
  if (!parsed || !parsed.action || typeof window === "undefined") return false;
  if (parsed.action === "__reload") {
    window.location.reload();
    return true;
  }
  if (parsed.action === "__refreshAndroidCompatibilityPreflight") {
    if (typeof window.ensureAndroidCompatibilityPreflightLoaded !== "function") return false;
    window.ensureAndroidCompatibilityPreflightLoaded({ forceRefresh: true })
      .then(() => {
        if (typeof window.rerenderQaExecutionGuideFromCache === "function") {
          window.rerenderQaExecutionGuideFromCache();
        }
      });
    return true;
  }
  if (parsed.action === "__resetAndReloadAfterSignOut") {
    window._resetBlocksPhaseChange = false;
    const auth = window.auth;
    if (auth && typeof auth.signOut === "function") {
      auth.signOut().then(() => window.location.reload());
      return true;
    }
    window.location.reload();
    return true;
  }

  const fn = typeof window[parsed.action] === "function" ? window[parsed.action] : null;
  if (!fn) return false;
  fn.apply(window, parsed.args || []);
  return true;
}

function _migrateEventAttribute(node, spec) {
  if (!node || typeof node.getAttribute !== "function" || !node.hasAttribute(spec.attr)) return false;
  if (node.getAttribute(spec.boundAttr) === "true") {
    node.removeAttribute(spec.attr);
    return true;
  }

  const expression = node.getAttribute(spec.attr);
  node.removeAttribute(spec.attr);
  node.setAttribute(spec.boundAttr, "true");
  node.addEventListener(spec.eventName, (event) => {
    const parsed = _parseCallExpression(expression, event.currentTarget || node);
    if (!parsed) return;
    if (typeof event.preventDefault === "function") event.preventDefault();
    _executeParsed(parsed);
  });
  return true;
}

function _getWritableStylesheet(doc) {
  for (const sheet of Array.from(doc.styleSheets || [])) {
    try {
      if (sheet && typeof sheet.insertRule === "function") return sheet;
    } catch (_err) {
      // Cross-origin stylesheets may throw when inspected. Try the next one.
    }
  }
  return null;
}

function _classNameForStyle(doc, declaration) {
  if (_styleClassByDeclaration.has(declaration)) {
    return _styleClassByDeclaration.get(declaration);
  }
  const sheet = _getWritableStylesheet(doc);
  if (!sheet) return null;
  const className = `mm-csp-style-${++_styleCounter}`;
  try {
    sheet.insertRule(`.${className}{${declaration}}`, sheet.cssRules ? sheet.cssRules.length : 0);
  } catch (_err) {
    return null;
  }
  _styleClassByDeclaration.set(declaration, className);
  return className;
}

function _migrateStyleAttribute(node, doc) {
  if (!node || typeof node.getAttribute !== "function" || !node.hasAttribute("style")) return false;
  const declaration = String(node.getAttribute("style") || "").trim();
  if (!declaration) {
    node.removeAttribute("style");
    return true;
  }
  const className = _classNameForStyle(doc, declaration);
  if (!className) return false;
  node.classList.add(className);
  node.removeAttribute("style");
  return true;
}

function _migrateNode(node, doc = _resolveDoc()) {
  if (!node || !doc) return 0;
  let migrated = 0;
  if (node.nodeType === 1) {
    for (const spec of EVENT_ATTRIBUTES) {
      if (_migrateEventAttribute(node, spec)) migrated++;
    }
    if (_migrateStyleAttribute(node, doc)) migrated++;
  }
  if (typeof node.querySelectorAll === "function") {
    const selector = EVENT_ATTRIBUTES.map((spec) => `[${spec.attr}]`).concat("[style]").join(",");
    node.querySelectorAll(selector).forEach((child) => {
      migrated += _migrateNode(child, doc);
    });
  }
  return migrated;
}

function _bind() {
  if (_bound) return;
  const doc = _resolveDoc();
  if (!doc) return;
  _bound = true;
  _migrateNode(doc.documentElement || doc.body || doc, doc);
  if (typeof MutationObserver === "function") {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => _migrateNode(node, doc));
        if (mutation.type === "attributes" && mutation.target) {
          _migrateNode(mutation.target, doc);
        }
      }
    });
    observer.observe(doc.documentElement || doc.body || doc, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: EVENT_ATTRIBUTES.map((spec) => spec.attr).concat("style"),
    });
  }
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

register("cspRuntimeMigrator", {
  bind: _bind,
  _parseCallExpression,
  _splitArgs,
  _migrateNode,
});
