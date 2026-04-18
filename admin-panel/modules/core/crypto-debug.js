// MiniMaster Admin-Panel - Crypto/Debug Utilities (Welle 2 Step 14)
// Spiegelt drei kleine Pure-Helfer aus admin-panel/app.js:
//  - toBase64Url(bytes)            (Z.9584)
//  - buildKeyFingerprint(keyHash)  (Z.9601)
//  - safeDebugStringify(value)     (Z.10198)
// Plus getPriorityWeight(severity) (Z.6652) als triviale Severity-Skala.
// Alle vier sind im Test-Harness exportiert.
import { register } from "./registry.js";

function _toBase64Url(bytes) {
  const arr = bytes || [];
  let binary = "";
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i]);
  }
  // btoa kann im Browser fehlen (Node-Test): fallback ueber Buffer
  const b64 = typeof btoa === "function"
    ? btoa(binary)
    : (typeof Buffer !== "undefined"
      ? Buffer.from(binary, "binary").toString("base64")
      : "");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function _buildKeyFingerprint(keyHash) {
  const normalized = (keyHash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return "unbekannt";
  return `${normalized.slice(0, 12)}...${normalized.slice(-8)}`;
}

function _safeDebugStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
}

function _getPriorityWeight(severity) {
  if (severity === "critical") return 300;
  if (severity === "high") return 200;
  if (severity === "medium") return 100;
  return 50;
}

export const toBase64Url = _toBase64Url;
export const buildKeyFingerprint = _buildKeyFingerprint;
export const safeDebugStringify = _safeDebugStringify;
export const getPriorityWeight = _getPriorityWeight;

register("cryptoDebug", {
  toBase64Url: _toBase64Url,
  buildKeyFingerprint: _buildKeyFingerprint,
  safeDebugStringify: _safeDebugStringify,
  getPriorityWeight: _getPriorityWeight,
});
