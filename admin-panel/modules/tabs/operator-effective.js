// MiniMaster Admin-Panel - Operator-Effective-Config (Welle 2 Step 6)
// Spiegelt buildEffectiveOperatorConfig aus admin-panel/app.js (Z.314).
// Pure Funktion: nimmt aktuelle Operator-Config + Bootstrap-Config und
// liefert effektive Cloud/AI-Konfiguration unter Anwendung der Defaults
// und der Bootstrap-Project-ID-Fallback-Kette.
//
// Architektur-Aenderung wie Step 5: explizite Args statt App-Globals.
// defaults und isPlaceholderProjectId werden importiert bzw. exportiert.
import { register } from "../core/registry.js";
import { normalizeBootstrapFirebaseConfig, isPlaceholderProjectId } from "../core/firebase-config.js";

const defaultOperatorConfig = {
  cloud: {
    projectId: "",
    region: "europe-west1",
    appCheckMode: "enforced",
    releaseChannel: "prod",
  },
  ai: {
    provider: "gemini",
    model: "gemini-3.0-flash",
    temperature: 0.3,
    endpoint: "",
    keyRef: "",
    systemPrompt: "Du unterst\u00fctzt Operatoren beim Bearbeiten von Support-Tickets pr\u00e4zise und datenschutzkonform.",
  },
};

function _buildEffective(config, bootstrapConfig, defaults) {
  const d = defaults || defaultOperatorConfig;
  const normalizedBootstrap = normalizeBootstrapFirebaseConfig(bootstrapConfig) || {};
  const cloud = { ...d.cloud, ...((config && config.cloud) || {}) };
  const ai = { ...d.ai, ...((config && config.ai) || {}) };

  const runtimeProjectId = String(cloud.projectId || "").trim();
  const bootstrapProjectId = String(normalizedBootstrap.projectId || "").trim();
  const effectiveProjectId = !isPlaceholderProjectId(runtimeProjectId)
    ? runtimeProjectId
    : !isPlaceholderProjectId(bootstrapProjectId)
      ? bootstrapProjectId
      : String(d.cloud.projectId || "").trim();

  const recommendedKeyRef = effectiveProjectId
    ? `projects/${effectiveProjectId}/secrets/gemini-api-key/versions/latest`
    : "";
  const parsedTemperature = Number.parseFloat(String(ai.temperature == null ? d.ai.temperature : ai.temperature));

  return {
    cloud: {
      ...cloud,
      projectId: effectiveProjectId,
      region: String(cloud.region || "").trim() || d.cloud.region,
      appCheckMode: String(cloud.appCheckMode || "").trim() || d.cloud.appCheckMode,
      releaseChannel: String(cloud.releaseChannel || "").trim() || d.cloud.releaseChannel,
    },
    ai: {
      ...ai,
      provider: String(ai.provider || "").trim() || d.ai.provider,
      model: String(ai.model || "").trim() || d.ai.model,
      temperature: Number.isFinite(parsedTemperature) ? parsedTemperature : d.ai.temperature,
      endpoint: String(ai.endpoint || "").trim(),
      keyRef: String(ai.keyRef || "").trim() || recommendedKeyRef,
      systemPrompt: String(ai.systemPrompt || "").trim() || d.ai.systemPrompt,
    },
  };
}

export const buildEffectiveOperatorConfig = _buildEffective;
export const DEFAULT_OPERATOR_CONFIG = defaultOperatorConfig;

register("operatorEffective", {
  buildEffective: _buildEffective,
  defaults: defaultOperatorConfig,
});
