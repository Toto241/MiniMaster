// MiniMaster Admin-Panel – Encoding-Helfer (Welle 1 Step 4)
// Pure Funktionen fuer Base64-URL-Codierung, Inline-Argumente und sicheres
// JSON-Stringify fuer Debug-Ausgaben. Spiegelt die Originale aus admin-panel/app.js.

import { register } from "./registry.js";

function _toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function _encodeInlineArgument(value) {
  return encodeURIComponent(value == null ? "" : String(value)).replace(/'/g, "%27");
}

function _decodeInlineArgument(value) {
  try {
    return decodeURIComponent(value == null ? "" : String(value));
  } catch (_error) {
    return value == null ? "" : String(value);
  }
}

function _safeDebugStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

export const toBase64Url = _toBase64Url;
export const encodeInlineArgument = _encodeInlineArgument;
export const decodeInlineArgument = _decodeInlineArgument;
export const safeDebugStringify = _safeDebugStringify;

register("encoding", {
  toBase64Url: _toBase64Url,
  encodeInlineArgument: _encodeInlineArgument,
  decodeInlineArgument: _decodeInlineArgument,
  safeDebugStringify: _safeDebugStringify,
});
