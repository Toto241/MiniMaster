// MiniMaster Admin-Panel - Effective Platform State (Welle 2 Step 9)
// Spiegelt buildEffectivePlatformState aus admin-panel/app.js (Z.7264).
// Pure Funktion: merged Legacy-Platform-State mit aktuellen QA-Pass-Status
// ueber ein Mapping (legacyKey -> qaIds[]). Wenn ein QA-Test mit pass im
// Mapping vorhanden ist, wird der Legacy-Key auf true gesetzt.
//
// Architektur-Aenderung: mapping als 3. Param injizierbar (Original nutzt
// platformQaStateMapping als Modul-Konstante in app.js).
import { register } from "../core/registry.js";

const DEFAULT_MAPPING = {
  "ma-registration-flow": ["ma-registration-flow"],
  "ma-credentials-encrypted": ["static-ma-credentials-encrypted"],
  "ma-imei-fallback": ["static-ma-imei-fallback"],
  "ma-proguard-enabled": ["static-ma-proguard-enabled"],
  "ma-pairing-works": ["ma-pairing-works"],
  "ma-lock-unlock": ["ma-lock-unlock"],
  "ma-task-create": ["ma-task-create"],
  "ma-task-review": ["ma-task-review"],
  "ma-task-reject-ui": ["ma-task-reject-ui"],
  "ma-usage-rules-nav": ["ma-usage-rules-nav"],
  "ma-date-picker": ["ma-date-picker"],
  "ma-subscription-check": ["ma-subscription-check"],
  "ma-subscription-enforce": ["ma-subscription-enforce"],
  "ma-fcm-working": ["ma-fcm-working"],
  "ma-debug-hidden": ["static-ma-debug-hidden"],
  "ma-firebase-appcheck": ["ma-firebase-appcheck", "static-ma-appcheck"],
  "ma-offline-handling": ["ma-offline-handling"],
  "ma-qr-pairing": ["ma-qr-pairing"],
  "ca-pairing-flow": ["ca-pairing-flow"],
  "ca-fcm-sync": ["ca-fcm-sync", "static-ca-fcm-sync"],
  "ca-heartbeat": ["static-ca-heartbeat"],
  "ca-accessibility-active": ["ca-accessibility-active", "static-ca-accessibility"],
  "ca-app-blocking-effective": ["ca-app-blocking-effective"],
  "ca-overlay-secure": ["ca-overlay-secure", "static-ca-overlay"],
  "ca-uninstall-prevention": ["static-ca-uninstall-prevention"],
  "ca-settings-protection": ["ca-settings-protection"],
  "ca-device-admin-enforced": ["ca-device-admin-enforced", "static-ca-device-admin"],
  "ca-usage-limits": ["ca-usage-limits"],
  "ca-time-windows": ["ca-time-windows"],
  "ca-tamper-detection": ["ca-tamper-detection", "static-ca-tamper-detection"],
  "ca-task-proof": ["ca-task-proof"],
  "ca-boot-receiver": ["static-ca-boot-receiver"],
  "ca-factory-reset-protection": ["ca-factory-reset-protection"],
  "ca-root-detection": ["ca-root-detection"],
  "ca-permission-onboarding": ["ca-permission-onboarding"],
  "dt-csp-headers": ["static-dt-csp"],
  "dt-sri-hashes": ["static-dt-sri"],
  "dt-credential-security": ["static-dt-credential-security"],
  "dt-session-timeout": ["static-dt-session-timeout"],
  "dt-electron-builder": ["static-dt-electron-builder"],
  "dt-code-signing": ["dt-code-signing"],
  "dt-auto-update": ["dt-auto-update"],
  "dt-system-tray": ["dt-system-tray"],
  "dt-desktop-notifications": ["dt-desktop-notifications"],
  "dt-window-persistence": ["dt-window-persistence"],
  "dt-ipc-messaging": ["dt-ipc-messaging"],
  "dt-parent-panel-login": ["dt-parent-panel-login"],
  "dt-admin-panel-login": ["dt-admin-panel-login"],
  "dt-crash-reporting": ["dt-crash-reporting"],
};

function _buildEffective(platformState, payload, mapping) {
  const map = mapping || DEFAULT_MAPPING;
  const mergedState = { ...(platformState || {}) };
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const passedIds = new Set(
    items
      .filter((item) => String(item.status || "") === "pass")
      .map((item) => String(item.id || ""))
  );

  Object.entries(map).forEach(([legacyKey, qaIds]) => {
    if (mergedState[legacyKey]) return;
    const ids = Array.isArray(qaIds) ? qaIds : [];
    if (ids.some((testId) => passedIds.has(String(testId)))) {
      mergedState[legacyKey] = true;
    }
  });

  return mergedState;
}

export const buildEffectivePlatformState = _buildEffective;
export const PLATFORM_QA_STATE_MAPPING = DEFAULT_MAPPING;

register("effectivePlatformState", {
  buildEffective: _buildEffective,
  defaultMapping: DEFAULT_MAPPING,
});
