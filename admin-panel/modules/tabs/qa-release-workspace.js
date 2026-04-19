import { register } from "../core/registry.js";

const STATUS_WEIGHT = {
  fail: 5,
  manual_required: 4,
  not_run: 3,
  skipped: 2,
  pass: 1,
};

const SEVERITY_WEIGHT = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function _nextAction(blocker) {
  const suiteId = String(blocker?.suiteRef || blocker?.id || "");
  const evidenceTargetId = String(blocker?.evidenceTargetId || blocker?.id || "");
  const prereqReason = String(blocker?.prereqReason || "").toLowerCase();

  if (String(blocker?.action || "") === "suite-run" && suiteId) {
    return {
      kind: "suite-run",
      label: blocker?.prereqsMet === false ? "Voraussetzungen prüfen" : "Suite erneut ausführen",
      detail: blocker?.prereqsMet === false
        ? String(blocker?.prereqReason || "Suite ist aktuell nicht lauffähig.")
        : "Den zugeordneten automatisierten Lauf erneut starten.",
      suiteId,
    };
  }

  if (String(blocker?.action || "") === "protocol") {
    return {
      kind: "protocol",
      label: "Manuellen Nachweis erfassen",
      detail: "Den vorhandenen Testfall im Evidenzformular nachtragen oder aktualisieren.",
      testId: evidenceTargetId,
    };
  }

  if (prereqReason.includes("emulator") || prereqReason.includes("adb") || prereqReason.includes("gerät")) {
    return {
      kind: "emulator-lab",
      label: "Emulator-/Gerätestatus prüfen",
      detail: String(blocker?.prereqReason || "Emulator-Labor und ADB-Status prüfen."),
    };
  }

  return {
    kind: "inspect",
    label: "Blocker prüfen",
    detail: String(blocker?.details || blocker?.successCriteria || "Release-Blocker im Register prüfen."),
  };
}

function _sortBlockers(blockers) {
  return [...(Array.isArray(blockers) ? blockers : [])].sort((left, right) => {
    const leftSeverity = SEVERITY_WEIGHT[String(left?.severity || "medium").toLowerCase()] || 0;
    const rightSeverity = SEVERITY_WEIGHT[String(right?.severity || "medium").toLowerCase()] || 0;
    if (rightSeverity !== leftSeverity) return rightSeverity - leftSeverity;

    const leftStatus = STATUS_WEIGHT[String(left?.status || "not_run").toLowerCase()] || 0;
    const rightStatus = STATUS_WEIGHT[String(right?.status || "not_run").toLowerCase()] || 0;
    if (rightStatus !== leftStatus) return rightStatus - leftStatus;

    return String(left?.title || left?.id || "").localeCompare(String(right?.title || right?.id || ""));
  });
}

function _buildViewModel(payload) {
  const data = payload && typeof payload === "object" ? payload : {};
  const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
  const blockers = _sortBlockers((data.blockers || []).map((item) => ({
    ...item,
    nextAction: _nextAction(item),
  })));
  const recentFailures = Array.isArray(data.recentFailures) ? data.recentFailures : [];
  const queue = Array.isArray(data.queue) ? data.queue : [];
  const agents = Array.isArray(data.agentWorkspace?.agents) ? data.agentWorkspace.agents : [];
  const synthesis = data.agentWorkspace?.synthesis || null;
  const emulatorSummary = data.emulators?.summary || {};
  const health = data.health || {};

  return {
    generatedAt: String(data.generatedAt || ""),
    blockers,
    recentFailures,
    queue,
    agents,
    synthesis,
    health,
    emulators: data.emulators || {},
    metrics: [
      { id: "release-blockers", label: "Release-Blocker", value: Number(summary.blockingCount || blockers.length || 0), tone: Number(summary.blockingCount || blockers.length || 0) > 0 ? "danger" : "success" },
      { id: "stale-evidence", label: "Veraltete Evidenz", value: Number(summary.staleEvidenceCount || 0), tone: Number(summary.staleEvidenceCount || 0) > 0 ? "warning" : "success" },
      { id: "running-jobs", label: "Laufende Jobs", value: Number(summary.runningJobs || 0), tone: Number(summary.runningJobs || 0) > 0 ? "info" : "neutral" },
      { id: "queued-jobs", label: "Queue", value: Number(summary.queuedJobs || 0), tone: Number(summary.queuedJobs || 0) > 0 ? "warning" : "neutral" },
      { id: "active-emulators", label: "Aktive Emulatoren", value: Number(summary.activeEmulators || emulatorSummary.runningCount || 0), tone: Number(summary.activeEmulators || emulatorSummary.runningCount || 0) > 0 ? "info" : "neutral" },
      { id: "agents", label: "Agenten", value: Number(summary.activeAgents || agents.length || 0), tone: Number(summary.activeAgents || agents.length || 0) > 0 ? "success" : "neutral" },
      { id: "critical-errors", label: "Kritische Fehler", value: Number(summary.criticalIssues || 0), tone: Number(summary.criticalIssues || 0) > 0 ? "danger" : "success" },
      { id: "health", label: "System-Health", value: String(summary.systemHealth || health.systemHealth || "OK"), tone: String(summary.systemHealth || health.systemHealth || "OK").toLowerCase() === "critical" ? "danger" : String(summary.systemHealth || health.systemHealth || "OK").toLowerCase() === "degraded" ? "warning" : "success" },
    ],
  };
}

function _findBlocker(payload, blockerId) {
  const viewModel = _buildViewModel(payload);
  return viewModel.blockers.find((item) => String(item?.id || "") === String(blockerId || "")) || null;
}

function _clipboardPayload(blocker, format = "compact") {
  const item = blocker && typeof blocker === "object" ? blocker : {};
  const normalizedFormat = String(format || "compact").toLowerCase();
  const lines = [
    `Titel: ${String(item.title || item.id || "-")}`,
    `Status: ${String(item.status || "-")}`,
    `Severity: ${String(item.severity || "-")}`,
    `Gruppe: ${String(item.groupTitle || item.groupId || "-")}`,
    `Suite: ${String(item.suiteRef || "-")}`,
    `Aktualisiert: ${String(item.updatedAt || "-")}`,
    `Details: ${String(item.details || item.successCriteria || "-")}`,
    `Nächste Aktion: ${String(item.nextAction?.label || "-")}`,
    `Aktion-Detail: ${String(item.nextAction?.detail || "-")}`,
    `Dokumentation: ${String(item.documentation || "-")}`,
  ];

  if (normalizedFormat === "github") {
    return [
      `## ${String(item.title || item.id || "Release-Blocker")}`,
      "",
      `- Status: ${String(item.status || "-")}`,
      `- Severity: ${String(item.severity || "-")}`,
      `- Gruppe: ${String(item.groupTitle || item.groupId || "-")}`,
      `- Suite: ${String(item.suiteRef || "-")}`,
      `- Aktualisiert: ${String(item.updatedAt || "-")}`,
      "",
      "### Details",
      String(item.details || item.successCriteria || "-"),
      "",
      "### Nächste Aktion",
      `${String(item.nextAction?.label || "-")}: ${String(item.nextAction?.detail || "-")}`,
      "",
      "### Dokumentation",
      String(item.documentation || "-") || "-",
    ].join("\n");
  }

  if (normalizedFormat === "ai") {
    return [
      "Analysiere folgenden MiniMaster Release-Blocker im QA Release Workspace.",
      ...lines,
      `PrereqsMet: ${String(item.prereqsMet)}`,
      `PrereqReason: ${String(item.prereqReason || "-")}`,
      `AutomationType: ${String(item.automationType || "-")}`,
    ].join("\n");
  }

  if (normalizedFormat === "debug") {
    return JSON.stringify(item, null, 2);
  }

  return lines.join("\n");
}

register("qaReleaseWorkspace", {
  buildViewModel: _buildViewModel,
  findBlocker: _findBlocker,
  buildClipboardPayload: _clipboardPayload,
  buildNextAction: _nextAction,
});

export const buildQaReleaseWorkspaceViewModel = _buildViewModel;
export const findQaReleaseWorkspaceBlocker = _findBlocker;
export const buildQaReleaseClipboardPayload = _clipboardPayload;
export const buildQaReleaseNextAction = _nextAction;
