// MiniMaster Admin-Panel – Command-Helper (Welle 1 Step 2)
// Pure Helfer fuer die Befehlszentrale: PowerShell-Skript-Bau und URL-sichere
// Codierung von Command-Payloads. Spiegelt 1:1 die Originalfunktionen aus
// admin-panel/app.js. Diese bleiben dort als Fallback erhalten, bis Aufrufer
// in einer spaeteren Welle vollstaendig auf die Module umgestellt werden.

import { register } from "./registry.js";
import { escapePowerShellString } from "./sanitize.js";

function _buildPowerShellScript(command, cwd) {
  const lines = ['$ErrorActionPreference = "Stop"'];
  if (cwd) {
    lines.push(`Set-Location -Path "${escapePowerShellString(cwd)}"`);
  }
  lines.push(command);
  return lines.join("\n");
}

function _encodeCommandPayload(payload) {
  return encodeURIComponent(JSON.stringify(payload));
}

function _decodeCommandPayload(payload) {
  return JSON.parse(decodeURIComponent(payload));
}

export const buildPowerShellScript = _buildPowerShellScript;
export const encodeCommandPayload = _encodeCommandPayload;
export const decodeCommandPayload = _decodeCommandPayload;

register("command", {
  buildPowerShellScript: _buildPowerShellScript,
  encodePayload: _encodeCommandPayload,
  decodePayload: _decodeCommandPayload,
});
