// MiniMaster Admin-Panel - Legal/PlayStore-Tab Pure Helfer (Welle 2 Step 1)
import { register } from "../core/registry.js";

const STORAGE_KEY = "playStoreReadinessState";
const RECOMMENDED_PRIVACY_URL = "https://minimaster.app/privacy";
const RECOMMENDED_SUPPORT_EMAIL = "privacy@minimaster.app";

const CHECK_KEYS = [
  "dataSafety",
  "iarc",
  "listing",
  "privacyUrlLinked",
  "permissionsDeclaration",
  "appAccessGuide",
  "securityRotationDone",
  "goNoGoSignedOff",
];

function _defaultState() {
  const checks = {};
  for (const key of CHECK_KEYS) checks[key] = false;
  return {
    checks,
    privacyUrl: "",
    supportEmail: "",
    listingUrl: "",
    releaseNotes: "",
    updatedAt: null,
  };
}

function _loadState(storage) {
  const defaults = _defaultState();
  try {
    const raw = (storage || globalThis.localStorage)?.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      checks: { ...defaults.checks, ...(parsed.checks || {}) },
      privacyUrl: parsed.privacyUrl || "",
      supportEmail: parsed.supportEmail || "",
      listingUrl: parsed.listingUrl || "",
      releaseNotes: parsed.releaseNotes || "",
      updatedAt: parsed.updatedAt || null,
    };
  } catch (_error) {
    return defaults;
  }
}

function _saveState(state, storage) {
  (storage || globalThis.localStorage)?.setItem(STORAGE_KEY, JSON.stringify(state));
}

function _buildEffectiveState(state) {
  const base = state || _defaultState();
  return {
    ...base,
    privacyUrl: String(base?.privacyUrl || "").trim() || RECOMMENDED_PRIVACY_URL,
    supportEmail: String(base?.supportEmail || "").trim() || RECOMMENDED_SUPPORT_EMAIL,
  };
}

function _validateForSave(state) {
  if (!state) return { ok: false, code: "missing-state", message: "Kein State zum Speichern uebergeben." };
  const privacyUrl = String(state.privacyUrl || "").trim();
  if (!privacyUrl || !/^https:\/\//i.test(privacyUrl)) {
    return { ok: false, code: "invalid-privacy-url", message: "Bitte eine gueltige Privacy-Policy-URL mit https:// eintragen." };
  }
  const email = String(state.supportEmail || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, code: "invalid-email", message: "Bitte eine gueltige Support-/Privacy-E-Mail eintragen." };
  }
  return { ok: true };
}

function _computeReadiness(state) {
  const checks = state?.checks || {};
  const total = CHECK_KEYS.length;
  const completed = CHECK_KEYS.reduce((sum, key) => sum + (checks[key] ? 1 : 0), 0);
  const ready = completed === total
    && Boolean(String(state?.privacyUrl || "").trim())
    && Boolean(String(state?.supportEmail || "").trim());
  return { total, completed, ready };
}

function _buildReviewerGuide(state, options) {
  const opts = options || {};
  const date = opts.date || new Date().toLocaleDateString("de-DE");
  const privacyUrl = state?.privacyUrl || "(nicht eingetragen)";
  const supportEmail = state?.supportEmail || "(nicht eingetragen)";
  const listingUrl = state?.listingUrl || "(nicht eingetragen)";
  const releaseNotes = state?.releaseNotes || "(keine Hinweise)";

  return [
    "APP-ACCESS-ANLEITUNG FUER PLAY-STORE-REVIEWER",
    "Stand: " + date,
    "",
    "=== App-Name ===",
    "MiniMaster - Kindersicherung & Elternkontrolle",
    "",
    "=== Privacy Policy ===",
    privacyUrl,
    "",
    "=== Support- & Datenschutz-E-Mail ===",
    supportEmail,
    "",
    "=== Play-Console-Listing ===",
    listingUrl,
    "",
    "=== Release-Notizen / Hinweise ===",
    releaseNotes,
  ].join("\n");
}

function _buildExportPayload(state, options) {
  const opts = options || {};
  return {
    exportedAt: opts.exportedAt || new Date().toISOString(),
    tool: "MiniMaster Admin Panel",
    type: "play-store-readiness",
    ...(state || _defaultState()),
  };
}

export const STORAGE_KEY_PLAYSTORE = STORAGE_KEY;
export const CHECK_KEYS_PLAYSTORE = CHECK_KEYS;
export const defaultPlayStoreReadinessState = _defaultState;
export const loadPlayStoreReadinessState = _loadState;
export const savePlayStoreReadinessState = _saveState;
export const buildEffectivePlayStoreReadinessState = _buildEffectiveState;
export const validatePlayStoreReadinessForSave = _validateForSave;
export const computePlayStoreReadinessSummary = _computeReadiness;
export const buildReviewerGuideText = _buildReviewerGuide;
export const buildPlayStoreReadinessExportPayload = _buildExportPayload;

register("legalPlaystore", {
  storageKey: STORAGE_KEY,
  checkKeys: CHECK_KEYS,
  recommendedPrivacyUrl: RECOMMENDED_PRIVACY_URL,
  recommendedSupportEmail: RECOMMENDED_SUPPORT_EMAIL,
  defaultState: _defaultState,
  load: _loadState,
  save: _saveState,
  buildEffective: _buildEffectiveState,
  validateForSave: _validateForSave,
  computeReadiness: _computeReadiness,
  buildReviewerGuide: _buildReviewerGuide,
  buildExportPayload: _buildExportPayload,
});
