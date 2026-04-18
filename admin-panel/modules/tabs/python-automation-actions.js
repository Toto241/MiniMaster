// MiniMaster Admin-Panel - Python-Automation Run Actions (Welle 2 Step 11)
// Spiegelt buildPythonAutomationRunActionSummary aus admin-panel/app.js (Z.3435).
// Pure Funktion: leitet aus einem Python-Commissioning-Lauf und dem
// Testing-Register-Payload eine Liste empfohlener Folge-Aktionen ab
// (Runtime, Evidence, Play-Store-Blocker).
//
// Inkl. der zwei kleinen Pure-Predicates isOpenTestingRegisterStatus und
// isPlayStoreTestingRegisterItem (app.js Z.3323/3327), damit das Modul
// unabhaengig vom App-Container testbar ist.
import { register } from "../core/registry.js";

const RUNTIME_CHECK_IDS = ["cloud-project-id", "ai-runtime-config", "app-check-mode"];
const PLAYSTORE_TOKENS = [
  "playstore",
  "play-store",
  "reviewer",
  "data safety",
  "privacy policy",
  "iarc",
  "store listing",
  "app access",
];

function _isOpenStatus(status) {
  return ["fail", "manual_required", "not_run"].includes(String(status || "not_run"));
}

function _isPlayStoreItem(item) {
  const tokens = [
    String(item?.id || ""),
    String(item?.groupId || ""),
    String(item?.groupTitle || ""),
    String(item?.title || ""),
    String(item?.details || ""),
  ]
    .join(" ")
    .toLowerCase();
  return PLAYSTORE_TOKENS.some((token) => tokens.includes(token));
}

function _buildActions(run, payload) {
  if (!run) return [];

  const checks = Array.isArray(run?.evaluation?.checks) ? run.evaluation.checks : [];
  const openCheckIds = new Set(
    checks.filter((item) => String(item?.status || "") !== "pass").map((item) => String(item?.id || ""))
  );
  const actions = [];

  if (RUNTIME_CHECK_IDS.some((id) => openCheckIds.has(id))) {
    const missingLabels = checks
      .filter((item) => openCheckIds.has(String(item?.id || "")) && RUNTIME_CHECK_IDS.includes(String(item?.id || "")))
      .map((item) => String(item?.title || item?.id || ""));
    actions.push({
      id: "runtime",
      title: "Runtime-Konfiguration nachziehen",
      detail: `Im Python-Lauf sind noch Runtime-Punkte offen: ${missingLabels.join(", ")}.`,
      buttonLabel: "Zum Setup-Tab",
      action: "openRuntimeSetupView()",
    });
  }

  const evidenceCounts = run?.evidenceCoverage?.counts || {};
  const openEvidenceCount = Number(evidenceCounts.uncovered || 0) + Number(evidenceCounts.failed || 0);
  if (openEvidenceCount > 0) {
    actions.push({
      id: "evidence",
      title: "Offene Nachweise schließen",
      detail: `${openEvidenceCount} manuelle oder dokumentierte Nachweise fehlen oder stehen auf FAIL.`,
      buttonLabel: "Evidence-Backlog filtern",
      action: "openQaEvidenceBacklogView()",
    });
  }

  const registerItems = Array.isArray(payload?.items) ? payload.items : [];
  const playStoreBlockers = registerItems.filter(
    (item) => _isPlayStoreItem(item) && _isOpenStatus(item?.status)
  );
  if (playStoreBlockers.length > 0) {
    actions.push({
      id: "playstore",
      title: "Play-Store- und Reviewer-Blocker bearbeiten",
      detail: `${playStoreBlockers.length} QA-Einträge zu Play Store oder Reviewer-Guide sind noch offen.`,
      buttonLabel: "Play-Store-Blocker im QA-Register",
      action: "openQaPlayStoreBlockersView()",
    });
  }

  return actions;
}

export const buildPythonAutomationRunActionSummary = _buildActions;
export const isOpenTestingRegisterStatus = _isOpenStatus;
export const isPlayStoreTestingRegisterItem = _isPlayStoreItem;

register("pythonAutomationActions", {
  buildActions: _buildActions,
  isOpenStatus: _isOpenStatus,
  isPlayStoreItem: _isPlayStoreItem,
});
