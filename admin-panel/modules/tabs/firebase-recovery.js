// MiniMaster Admin-Panel - Firebase Recovery Utilities (Welle 2 Step 15)
// Spiegelt drei Pure-Helfer aus admin-panel/app.js:
//  - buildFirebaseRecoveryCommands(projectId)  (Z.8242)
//  - buildFirebaseRecoveryScript(projectId)    (Z.8251)
//  - isRetryableFirebaseQueueConflict(...)     (Z.8263)
// Alle drei sind im Test-Harness exportiert.
import { register } from "../core/registry.js";

function _commands(projectId) {
  return [
    "npm install",
    `firebase use ${projectId}`,
    "firebase deploy --only firestore:rules,firestore:indexes,storage",
    "firebase deploy --only functions",
  ];
}

function _script(projectId) {
  return _commands(projectId).join("\n");
}

function _isRetryableConflict(command, output, code) {
  if (Number(code) === 0) return false;
  const normalizedCommand = String(command || "").toLowerCase();
  if (!normalizedCommand.includes("firebase deploy")) return false;

  const normalizedOutput = String(output || "").toLowerCase();
  return normalizedOutput.includes("http error: 409")
    || normalizedOutput.includes("unable to queue the operation");
}

export const buildFirebaseRecoveryCommands = _commands;
export const buildFirebaseRecoveryScript = _script;
export const isRetryableFirebaseQueueConflict = _isRetryableConflict;

register("firebaseRecovery", {
  buildCommands: _commands,
  buildScript: _script,
  isRetryableConflict: _isRetryableConflict,
});
