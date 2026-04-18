// MiniMaster Admin-Panel – Security-Helfer (Welle 1 Step 6)
// Pure Helfer fuer Operator-Access-Keys: Fingerprint-Bildung aus SHA-256-Hashes.
// Spiegelt buildKeyFingerprint aus admin-panel/app.js. Crypto-Operationen
// (sha256HexBrowser) bleiben in app.js, weil sie auf window.crypto angewiesen sind.

import { register } from "./registry.js";

function _buildKeyFingerprint(keyHash) {
  const normalized = (keyHash || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return "unbekannt";
  return `${normalized.slice(0, 12)}...${normalized.slice(-8)}`;
}

export const buildKeyFingerprint = _buildKeyFingerprint;

register("security", {
  buildKeyFingerprint: _buildKeyFingerprint,
});
