// MiniMaster Admin-Panel - Firebase-Deployment Pure Helfer (Welle 2 Step 3)
// Vertikaler Schnitt fuer Tab "Firebase / Bootstrap-Recovery". Enthaelt nur
// DOM-freie, deterministische Helfer rund um Recovery- und Deploy-Befehle.
// UI-/IO-Funktionen (executeBridgeCommandWithRetry, copyRolloutBundleScript,
// downloadRolloutBundleScript, appendRecoveryLog) bleiben in app.js.
//
// Spiegelt 1:1: buildFirebaseRecoveryCommands, buildFirebaseRecoveryScript,
// isRetryableFirebaseQueueConflict, buildDeployCommand.
import { register } from "../core/registry.js";

function _buildRecoveryCommands(projectId) {
  return [
    "npm install",
    `firebase use ${projectId}`,
    "firebase deploy --only firestore:rules,firestore:indexes,storage",
    "firebase deploy --only functions",
  ];
}

function _buildRecoveryScript(projectId) {
  return _buildRecoveryCommands(projectId).join("\n");
}

function _isRetryableQueueConflict(command, output, code) {
  if (Number(code) === 0) return false;
  const normalizedCommand = String(command || "").toLowerCase();
  if (!normalizedCommand.includes("firebase deploy")) return false;
  const normalizedOutput = String(output || "").toLowerCase();
  return (
    normalizedOutput.includes("http error: 409") ||
    normalizedOutput.includes("unable to queue the operation")
  );
}

function _buildDeployCommand(projectId) {
  const trimmedProjectId = String(projectId == null ? "" : projectId).trim();
  const base =
    "firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting";
  return trimmedProjectId ? `${base} --project ${trimmedProjectId}` : base;
}

export const buildFirebaseRecoveryCommands = _buildRecoveryCommands;
export const buildFirebaseRecoveryScript = _buildRecoveryScript;
export const isRetryableFirebaseQueueConflict = _isRetryableQueueConflict;
export const buildDeployCommand = _buildDeployCommand;

register("firebaseDeployment", {
  buildRecoveryCommands: _buildRecoveryCommands,
  buildRecoveryScript: _buildRecoveryScript,
  isRetryableQueueConflict: _isRetryableQueueConflict,
  buildDeployCommand: _buildDeployCommand,
});
