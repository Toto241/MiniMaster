// MiniMaster Admin-Panel - Commissioning QA (Welle 2 Step 10)
// Buendelt zwei verwandte Pure-Helfer fuer das Commissioning-Tab:
//  - summarizeApprovals(items): zaehlt confirmed/open Eintraege
//    (entspricht dem reinen Aggregations-Teil von
//    buildCommissioningQaApprovalSummary in admin-panel/app.js Z.6509;
//    der I/O-Teil getCommissioningQaApprovalItems Z.6467 verbleibt im
//    App-Container, da er auf zahlreiche App-Globals zugreift).
//  - buildValidationSummaryFromResults(results): aggregiert die
//    Setup-Validation-Resultate (app.js Z.6523) - im Test-Harness als
//    direkter Export verfuegbar, daher paritaetisch testbar.
import { register } from "../core/registry.js";

function _summarizeApprovals(items) {
  const list = Array.isArray(items) ? items : [];
  const confirmed = list.filter((item) => String(item?.status || "") === "pass");
  const open = list.filter((item) => String(item?.status || "") !== "pass");
  return {
    items: list,
    confirmed,
    open,
    totalCount: list.length,
    confirmedCount: confirmed.length,
    openCount: open.length,
  };
}

function _buildValidationSummary(results) {
  if (!Array.isArray(results) || results.length === 0) return null;

  let ok = 0;
  let warn = 0;
  let errorCount = 0;
  results.forEach((result) => {
    if (result?.status === "ok") ok++;
    if (result?.status === "warn") warn++;
    if (result?.status === "error") errorCount++;
  });

  const startsWith = (prefix) => (result) => String(result?.check || "").startsWith(prefix);

  return {
    ok,
    warn,
    errorCount,
    checks: {
      adminAuthOk: results.some((result) => result?.check === "Admin Authentication" && result.status === "ok"),
      firestoreAccessOk: results.filter(startsWith("Firestore Collection")).every((result) => result.status === "ok"),
      functionsReachable: results.filter(startsWith("Function (")).every((result) => result.status === "ok" || result.status === "warn"),
      storageHealthOk: results.some((result) => result?.check === "Backend Storage Health" && result.status === "ok"),
      aiConfigured: results.some((result) => result?.check === "AI Secret Configuration" && result.status === "ok"),
      webControlConfigReady: results.some((result) => result?.check === "Shared Web-Control Firebase Config" && result.status === "ok"),
    },
  };
}

export const summarizeApprovals = _summarizeApprovals;
export const buildValidationSummaryFromResults = _buildValidationSummary;

register("commissioningQa", {
  summarizeApprovals: _summarizeApprovals,
  buildValidationSummary: _buildValidationSummary,
});
