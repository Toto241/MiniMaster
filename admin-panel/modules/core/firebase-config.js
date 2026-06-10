// MiniMaster Admin-Panel - Firebase-Bootstrap-Konfig-Helfer (Welle 1 Step 7)
// Pure Funktionen aus admin-panel/app.js extrahiert, identisch zur Originallogik.
// Verwendung: window.MM.firebaseConfig.{has,normalize,...}
import { register } from "./registry.js";

const REQUIRED_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

function _hasComplete(config) {
  if (!config || typeof config !== "object") return false;
  return REQUIRED_KEYS.every(
    (key) => typeof config[key] === "string" && config[key].trim().length > 0,
  );
}

function _isPlaceholder(config) {
  if (!_hasComplete(config)) return true;
  return Object.values(config).some(
    (value) =>
      typeof value === "string" &&
      (value.includes("your-") || value.includes("your_project")),
  );
}

function _normalizeBootstrap(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object") return null;
  return {
    apiKey: String(rawConfig.apiKey || "").trim(),
    authDomain: String(rawConfig.authDomain || "").trim(),
    projectId: String(rawConfig.projectId || "").trim(),
    storageBucket: String(rawConfig.storageBucket || "").trim(),
    messagingSenderId: String(rawConfig.messagingSenderId || "").trim(),
    appId: String(rawConfig.appId || "").trim(),
  };
}

function _extractFromText(text) {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const directObjectMatch = text.match(/\{[\s\S]*\}/);
  if (!directObjectMatch) return null;
  try {
    const parsedDirect = JSON.parse(directObjectMatch[0]);
    const normalizedDirect = _normalizeBootstrap(parsedDirect);
    if (_hasComplete(normalizedDirect)) return normalizedDirect;
  } catch (_error) {
    // fallback
  }
  try {
    const objectLiteral = directObjectMatch[0]
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"');
    const parsedLiteral = JSON.parse(objectLiteral);
    const normalizedLiteral = _normalizeBootstrap(parsedLiteral);
    if (_hasComplete(normalizedLiteral)) return normalizedLiteral;
  } catch (_error) {
    return null;
  }
  return null;
}

function _extractFromGoogleServices(rawConfig, metaOut = null) {
  if (!rawConfig || typeof rawConfig !== "object") return null;
  const projectInfo = rawConfig.project_info;
  const clients = Array.isArray(rawConfig.client) ? rawConfig.client : [];
  if (!projectInfo || clients.length === 0) return null;

  const projectId = String(projectInfo.project_id || "").trim();
  const storageBucket = String(projectInfo.storage_bucket || "").trim();
  const messagingSenderId = String(projectInfo.project_number || "").trim();
  if (!projectId || !storageBucket || !messagingSenderId) return null;

  const preferredClient =
    clients.find((client) => {
      const packageName = client?.client_info?.android_client_info?.package_name;
      return packageName === "com.minimaster.childapp";
    }) || clients[0];

  const selectedPackageName = String(
    preferredClient?.client_info?.android_client_info?.package_name || "",
  ).trim();

  const apiKey = String(preferredClient?.api_key?.[0]?.current_key || "").trim();
  const appId = String(preferredClient?.client_info?.mobilesdk_app_id || "").trim();
  if (!apiKey || !appId) return null;

  if (metaOut && typeof metaOut === "object") {
    metaOut.format = "google-services.json";
    metaOut.packageName = selectedPackageName;
  }

  return _normalizeBootstrap({
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  });
}

function _isPlaceholderProjectId(projectId) {
  const normalized = String(projectId || "").trim().toLowerCase();
  return !normalized || normalized.includes("your-project");
}

export const hasCompleteFirebaseConfig = _hasComplete;
export const isPlaceholderFirebaseConfig = _isPlaceholder;
export const normalizeBootstrapFirebaseConfig = _normalizeBootstrap;
export const extractFirebaseConfigFromText = _extractFromText;
export const extractFirebaseConfigFromGoogleServices = _extractFromGoogleServices;
export const isPlaceholderProjectId = _isPlaceholderProjectId;

register("firebaseConfig", {
  hasComplete: _hasComplete,
  isPlaceholder: _isPlaceholder,
  normalizeBootstrap: _normalizeBootstrap,
  extractFromText: _extractFromText,
  extractFromGoogleServices: _extractFromGoogleServices,
  isPlaceholderProjectId: _isPlaceholderProjectId,
});
