// MiniMaster Admin-Panel – Automation-Meta-Helfer (Welle 1 Step 4)
// Pure Status- und Typ-Helfer fuer das Python-Automations-Cockpit.
// 1:1 Spiegelung der Originale aus admin-panel/app.js. Diese bleiben dort
// als Fallback, bis Aufrufer in spaeteren Wellen migriert sind.

import { register } from "./registry.js";

function _formatPythonAutomationStatus(status) {
  if (status === "pass") return "✅ PASS";
  if (status === "manual_required") return "🟡 NACHWEIS OFFEN";
  if (status === "fail") return "❌ FAIL";
  if (status === "not_run") return "⏸ NOCH NICHT GELAUFEN";
  return "ℹ️ UNBEKANNT";
}

function _getPythonAutomationStatusMeta(status) {
  if (status === "pass") {
    return { label: "PASS", className: "python-status-pass", cardClass: "status-pass" };
  }
  if (status === "manual_required") {
    return { label: "NACHWEIS OFFEN", className: "python-status-manual_required", cardClass: "status-manual_required" };
  }
  if (status === "fail") {
    return { label: "FAIL", className: "python-status-fail", cardClass: "status-fail" };
  }
  return { label: "OFFEN", className: "python-status-not_run", cardClass: "status-not_run" };
}

function _formatPythonAutomationType(type, source = "") {
  if (type === "command") return "Lokales Gate-Kommando";
  if (type === "documented") return "Dokumentierter Testplan";
  if (type === "manual") return "Manueller Nachweis";
  if (source === "repo-test") return "Repository-Test-Evidenz";
  if (source === "device-suite") return "Device-Suite-Check";
  if (source === "static-analysis") return "Statische Analyse";
  if (source === "docs-validation") return "Dokument-Evidenzcheck";
  if (source === "playstore-readiness") return "Play-Store-Readiness";
  return "Automatisch bewertet";
}

function _getPythonAutomationTypeChipClass(type, source = "") {
  if (type === "command") return "python-automation-chip-command";
  if (type === "documented") return "python-automation-chip-documented";
  if (type === "manual") return "python-automation-chip-manual";
  if (source === "repo-test") return "python-automation-chip-auto";
  if (source === "device-suite") return "python-automation-chip-suite";
  if (source === "static-analysis") return "python-automation-chip-static";
  if (source === "docs-validation") return "python-automation-chip-docs";
  return "python-automation-chip-auto";
}

export const formatPythonAutomationStatus = _formatPythonAutomationStatus;
export const getPythonAutomationStatusMeta = _getPythonAutomationStatusMeta;
export const formatPythonAutomationType = _formatPythonAutomationType;
export const getPythonAutomationTypeChipClass = _getPythonAutomationTypeChipClass;

register("automationMeta", {
  status: _formatPythonAutomationStatus,
  statusMeta: _getPythonAutomationStatusMeta,
  type: _formatPythonAutomationType,
  typeChipClass: _getPythonAutomationTypeChipClass,
});
