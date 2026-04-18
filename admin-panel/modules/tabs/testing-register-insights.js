// MiniMaster Admin-Panel - Testing-Register Insights (Welle 2 Step 12)
// Spiegelt zwei kleine Pure-Aggregations-Helfer aus admin-panel/app.js:
//  - buildTestingRegisterDuplicateInsights (Z.3690): Kennzahlen aus
//    payload.duplicateInsights {count, sourceCount, entries}.
//  - buildTestingRegisterManualInsights (Z.3700): Bucket- und
//    Wave-Counts aus payload.manualInsights.
import { register } from "../core/registry.js";

function _duplicates(payload) {
  const entries = Array.isArray(payload?.duplicateInsights?.entries)
    ? payload.duplicateInsights.entries
    : [];
  return {
    count: Number(payload?.duplicateInsights?.count || 0),
    sourceCount: Number(payload?.duplicateInsights?.sourceCount || 0),
    entries,
  };
}

function _manual(payload) {
  const buckets = payload?.manualInsights?.buckets || {};
  const waves = payload?.manualInsights?.waves || {};
  return {
    total: Number(payload?.manualInsights?.total || 0),
    physical: Number(buckets["physical-manual"]?.count || 0),
    backlog: Number(buckets["automation-backlog"]?.count || 0),
    external: Number(buckets["external-evidence"]?.count || 0),
    wave1: Number(waves["wave-1"]?.count || 0),
    wave2: Number(waves["wave-2"]?.count || 0),
  };
}

export const buildTestingRegisterDuplicateInsights = _duplicates;
export const buildTestingRegisterManualInsights = _manual;

register("testingRegisterInsights", {
  buildDuplicates: _duplicates,
  buildManual: _manual,
});
