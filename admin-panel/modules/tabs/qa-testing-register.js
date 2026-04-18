// MiniMaster Admin-Panel - QA Testing-Register Pure Helfer (Welle 2 Step 2)
// Vertikaler Schnitt fuer Tab "Qualitaetssicherung". Enthaelt nur DOM-freie,
// deterministische Helfer rund um das Testing-Register. UI-/DOM-spezifische
// Funktionen (Filter aus Inputs, Render, escape mit DOM) bleiben in app.js.
//
// Spiegelt 1:1: isOpenTestingRegisterStatus, isPlayStoreTestingRegisterItem,
// getTestingRegisterStatusPriority, getTestingRegisterSeverityPriority,
// formatTestingRegisterGroupTitle, formatTestingRegisterSourceLabel,
// getTestingRegisterSourceChipClass, getTestingRegisterItemById,
// isTestingRegisterReleaseBlockerOpen, parseTestingRegisterTimestamp,
// formatTestingRegisterAge, escapeTestingRegisterText.
import { register } from "../core/registry.js";

const OPEN_STATUSES = ["fail", "manual_required", "not_run"];
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
const PRIMARY_FILTER_TYPES = new Set([
  "all",
  "open",
  "evidenceOpen",
  "blocking",
  "automatic",
  "manual",
  "playStoreBlocking",
  "commissioning",
  "approvals",
]);

function _isOpenStatus(status) {
  return OPEN_STATUSES.includes(String(status || "not_run"));
}

function _isPlayStoreItem(item) {
  const tokens = [
    String(item?.id || ""),
    String(item?.groupId || ""),
    String(item?.groupTitle || ""),
    String(item?.title || ""),
    String(item?.details || ""),
  ].join(" ").toLowerCase();
  return PLAYSTORE_TOKENS.some((token) => tokens.includes(token));
}

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

function _formatSourceLabel(source) {
  if (source === "register-derivative") return "Quelle: Abgeleiteter QA-Check";
  if (source === "repo-test") return "Quelle: Repository-Tests";
  if (source === "device-suite") return "Quelle: Device-Suite";
  if (source === "static-analysis") return "Quelle: Statische Analyse";
  if (source === "docs-validation") return "Quelle: Dokument-Check";
  if (source === "playstore-readiness") return "Quelle: Play-Store-Readiness";
  if (source === "command") return "Quelle: Lokales Gate";
  if (source === "manual") return "Quelle: Manueller Nachweis";
  if (source === "docs") return "Quelle: Dokumentierter Testplan";
  return source ? `Quelle: ${String(source)}` : "";
}

function _sourceChipClass(source) {
  if (source === "register-derivative") return "python-automation-chip-auto";
  if (source === "repo-test") return "python-automation-chip-auto";
  if (source === "device-suite") return "python-automation-chip-suite";
  if (source === "static-analysis") return "python-automation-chip-static";
  if (source === "docs-validation") return "python-automation-chip-docs";
  if (source === "playstore-readiness") return "python-automation-chip-auto";
  if (source === "command") return "python-automation-chip-command";
  if (source === "manual") return "python-automation-chip-manual";
  if (source === "docs") return "python-automation-chip-documented";
  return "python-automation-chip-neutral";
}

function _itemById(itemId, payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.find((item) => String(item?.id || "") === String(itemId || "")) || null;
}

function _isReleaseBlockerOpen(item) {
  if (!item || !item.blockingForRelease) return false;
  const status = String(item.status || "not_run");
  if (item.staleEvidence) return true;
  if (!item.hasSuccessfulRun) return true;
  return status !== "pass";
}

function _parseTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function _formatAge(value, nowMs) {
  const parsed = _parseTimestamp(value);
  if (!parsed) return "noch kein Zeitstempel";
  const reference = typeof nowMs === "number" ? nowMs : Date.now();
  const diffMs = Math.max(0, reference - parsed.getTime());
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "heute aktualisiert";
  if (diffDays === 1) return "vor 1 Tag aktualisiert";
  if (diffDays < 30) return `vor ${diffDays} Tagen aktualisiert`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return "vor 1 Monat aktualisiert";
  return `vor ${diffMonths} Monaten aktualisiert`;
}

function _escapeText(text) {
  return String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const OPEN_TESTING_REGISTER_STATUSES = OPEN_STATUSES;
export const PLAYSTORE_TESTING_REGISTER_TOKENS = PLAYSTORE_TOKENS;
export const PRIMARY_TESTING_REGISTER_FILTER_TYPES = PRIMARY_FILTER_TYPES;
export const isOpenTestingRegisterStatus = _isOpenStatus;
export const isPlayStoreTestingRegisterItem = _isPlayStoreItem;
export const getTestingRegisterStatusPriority = _statusPriority;
export const getTestingRegisterSeverityPriority = _severityPriority;
export const formatTestingRegisterGroupTitle = _formatGroupTitle;
export const formatTestingRegisterSourceLabel = _formatSourceLabel;
export const getTestingRegisterSourceChipClass = _sourceChipClass;
export const getTestingRegisterItemById = _itemById;
export const isTestingRegisterReleaseBlockerOpen = _isReleaseBlockerOpen;
export const parseTestingRegisterTimestamp = _parseTimestamp;
export const formatTestingRegisterAge = _formatAge;
export const escapeTestingRegisterText = _escapeText;

register("qaTestingRegister", {
  openStatuses: OPEN_STATUSES,
  playstoreTokens: PLAYSTORE_TOKENS,
  primaryFilterTypes: PRIMARY_FILTER_TYPES,
  isOpenStatus: _isOpenStatus,
  isPlayStoreItem: _isPlayStoreItem,
  statusPriority: _statusPriority,
  severityPriority: _severityPriority,
  formatGroupTitle: _formatGroupTitle,
  formatSourceLabel: _formatSourceLabel,
  sourceChipClass: _sourceChipClass,
  itemById: _itemById,
  isReleaseBlockerOpen: _isReleaseBlockerOpen,
  parseTimestamp: _parseTimestamp,
  formatAge: _formatAge,
  escapeText: _escapeText,
});
