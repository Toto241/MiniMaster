// MiniMaster Admin-Panel - Testing-Register Priorities & Labels (Welle 2 Step 13)
// Spiegelt vier kleine Pure-Helfer aus admin-panel/app.js:
//  - getTestingRegisterStatusPriority   (Z.3490)
//  - getTestingRegisterSeverityPriority (Z.3507)
//  - formatTestingRegisterGroupTitle    (Z.3515)
//  - getTestingRegisterActionLabel      (Z.3731)
// Alle vier sind im Test-Harness exportiert und damit direkt
// paritaetisch testbar.
import { register } from "../core/registry.js";

function _statusPriority(status) {
  if (status === "fail") return 0;
  if (status === "manual_required") return 1;
  if (status === "not_run") return 2;
  if (status === "pass") return 3;
  return 4;
}

function _severityPriority(severity) {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "medium") return 2;
  if (severity === "low") return 3;
  return 4;
}

function _formatGroupTitle(item) {
  const title = String(item?.groupTitle || "-");
  const groupId = String(item?.groupId || "");
  if (groupId === "repo-tests-unsupported") return `Unsupported: ${title}`;
  if (item?.blockingForRelease) return `Release: ${title}`;
  return title;
}

function _actionLabel(item) {
  const action = String(item?.action || "commissioning-run");
  if (action === "suite-run") return "Suite-Start";
  if (action === "protocol") return "Nachweis-Protokoll";
  if (action === "external-protocol") return "Externer Lauf + Nachweis";
  const source = String(item?.source || "");
  if (source === "repo-test") return "Repository-Tests pr\u00fcfen";
  if (source === "docs-validation") return "Dokument-Check ausf\u00fchren";
  if (source === "static-analysis") return "Static-Checks ausf\u00fchren";
  return "Python-Commissioning-Lauf";
}

export const getTestingRegisterStatusPriority = _statusPriority;
export const getTestingRegisterSeverityPriority = _severityPriority;
export const formatTestingRegisterGroupTitle = _formatGroupTitle;
export const getTestingRegisterActionLabel = _actionLabel;

register("testingRegisterPriorities", {
  statusPriority: _statusPriority,
  severityPriority: _severityPriority,
  formatGroupTitle: _formatGroupTitle,
  actionLabel: _actionLabel,
});
