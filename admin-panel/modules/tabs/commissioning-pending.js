// MiniMaster Admin-Panel - Commissioning Pending Filter (Welle 2 Step 4)
// Vertikaler Schnitt fuer Tab "Inbetriebnahme". Enthaelt nur DOM-freie,
// deterministische Helfer zur Klassifikation und Filterung der "pending"-
// Items eines Commissioning-Reports. UI-/State-abhaengige Funktionen
// (buildCommissioningSnapshot mit new Date(), buildCommissioningQaApproval-
// Summary, renderCommissioningReport) bleiben in app.js.
//
// Spiegelt 1:1: isCoveredCommissioningPendingItem,
// filterVisibleCommissioningPendingItems.
import { register } from "../core/registry.js";

const COVERED_PROJECT_ID = "Cloud Project ID setzen.";
const COVERED_RUNTIME_AI = "KI-Runtime-Konfiguration vervollst\u00e4ndigen.";
const COVERED_PREFIX_AI_RUNTIME = "KI-Konfiguration im Runtime-Block vollst\u00e4ndig ausf\u00fcllen";
const COVERED_PREFIX_QA_RELEASE = "QA-Freigabe offen:";
const COVERED_PREFIX_QA_EVIDENCE = "QA-Nachweis offen:";
const COVERED_PREFIX_PLAYSTORE = "Play-Store-Readiness:";

const COVERED_EXACT = new Set([COVERED_PROJECT_ID, COVERED_RUNTIME_AI]);
const COVERED_PREFIXES = [
  COVERED_PREFIX_AI_RUNTIME,
  COVERED_PREFIX_QA_RELEASE,
  COVERED_PREFIX_QA_EVIDENCE,
  COVERED_PREFIX_PLAYSTORE,
];

function _isCoveredPendingItem(item) {
  const text = String(item == null ? "" : item).trim();
  if (!text) return false;
  if (COVERED_EXACT.has(text)) return true;
  for (const prefix of COVERED_PREFIXES) {
    if (text.startsWith(prefix)) return true;
  }
  return false;
}

function _filterVisiblePendingItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => !_isCoveredPendingItem(item));
}

export const isCoveredCommissioningPendingItem = _isCoveredPendingItem;
export const filterVisibleCommissioningPendingItems = _filterVisiblePendingItems;
export const COMMISSIONING_COVERED_EXACT = COVERED_EXACT;
export const COMMISSIONING_COVERED_PREFIXES = COVERED_PREFIXES;

register("commissioningPending", {
  isCoveredItem: _isCoveredPendingItem,
  filterVisibleItems: _filterVisiblePendingItems,
  coveredExact: COVERED_EXACT,
  coveredPrefixes: COVERED_PREFIXES,
});
