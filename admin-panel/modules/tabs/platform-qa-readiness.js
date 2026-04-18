// MiniMaster Admin-Panel - Platform-QA Readiness Summary (Welle 2 Step 8)
// Spiegelt buildPlatformQaReadinessSummary aus admin-panel/app.js (Z.7283).
// Pure Funktion: aggregiert Testing-Register-Items pro Plattform (master/child/
// desktop) zu Total/Done/Critical/High-Counts plus Prozent-Wert.
//
// Architektur-Aenderung: groups als 2. Param injizierbar (Original nutzt
// platformQaRegisterGroups als Modul-Konstante in app.js).
import { register } from "../core/registry.js";

const DEFAULT_GROUPS = {
  masterApp: {
    label: "MasterApp (Eltern-Android)",
    groupIds: ["functional-readiness-masterapp", "static-readiness-masterapp"],
  },
  childApp: {
    label: "ChildApp (Kind-Android)",
    groupIds: ["functional-readiness-childapp", "static-readiness-childapp"],
  },
  desktop: {
    label: "Desktop-App (Heim-PC)",
    groupIds: ["functional-readiness-desktop", "static-readiness-desktop"],
  },
};

function _buildSummary(payload, groups) {
  const groupDefs = groups || DEFAULT_GROUPS;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const platformStatus = {};
  let totalCritical = 0;
  let doneCritical = 0;
  let totalHigh = 0;
  let doneHigh = 0;
  let totalAll = 0;
  let doneAll = 0;

  for (const [platformKey, config] of Object.entries(groupDefs)) {
    const groupIds = Array.isArray(config?.groupIds) ? config.groupIds : [];
    const relevantItems = items.filter((item) => groupIds.includes(String(item.groupId || "")));
    let pCritical = 0;
    let pCriticalDone = 0;
    let pHigh = 0;
    let pHighDone = 0;
    let pTotal = 0;
    let pDone = 0;

    relevantItems.forEach((item) => {
      const severity = String(item.severity || "");
      const isPass = String(item.status || "") === "pass";
      pTotal++;
      totalAll++;
      if (severity === "critical") {
        pCritical++;
        totalCritical++;
      }
      if (severity === "high") {
        pHigh++;
        totalHigh++;
      }
      if (isPass) {
        pDone++;
        doneAll++;
        if (severity === "critical") {
          pCriticalDone++;
          doneCritical++;
        }
        if (severity === "high") {
          pHighDone++;
          doneHigh++;
        }
      }
    });

    platformStatus[platformKey] = {
      label: config?.label || platformKey,
      total: pTotal,
      done: pDone,
      critical: pCritical,
      criticalDone: pCriticalDone,
      high: pHigh,
      highDone: pHighDone,
      percent: pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0,
      source: "qa-register",
    };
  }

  return {
    platformStatus,
    totals: {
      totalAll,
      doneAll,
      totalCritical,
      doneCritical,
      totalHigh,
      doneHigh,
    },
    hasData: totalAll > 0,
  };
}

export const buildPlatformQaReadinessSummary = _buildSummary;
export const PLATFORM_QA_REGISTER_GROUPS = DEFAULT_GROUPS;

register("platformQaReadiness", {
  buildSummary: _buildSummary,
  defaultGroups: DEFAULT_GROUPS,
});
