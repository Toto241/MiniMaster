// MiniMaster Admin-Panel - Operator-Config Guidance (Welle 2 Step 5)
// Vertikaler Schnitt fuer Tab "Operator-Konfiguration / KI-Runtime".
// Enthaelt nur DOM-freie, deterministische Helfer zur Validierung der
// Operator-Runtime-Config (Cloud-Project + KI-Provider/-Model/-Secret/-Prompt).
// UI-/State-Funktionen (renderOperatorConfigGuidance, applyGeminiRuntime-
// Template, applyBootstrapProjectIdToRuntime) bleiben in app.js.
//
// Spiegelt 1:1: buildOperatorConfigGuidance.
// Wichtige Aenderung: Original ruft ohne Args getOperatorConfigFormValues()
// und nutzt firebaseConfig als Bootstrap. Dieses Modul VERLANGT explizite
// Argumente, da es keinen Zugriff auf App-Globals hat. Der Aufrufer in
// app.js liefert die Defaults weiterhin selbst.
import { register } from "../core/registry.js";
import { normalizeBootstrapFirebaseConfig } from "../core/firebase-config.js";

function _trim(value) {
  return String(value == null ? "" : value).trim();
}

function _buildGuidance(config, bootstrapConfig) {
  const normalizedBootstrap = normalizeBootstrapFirebaseConfig(bootstrapConfig) || {};
  const runtimeProjectId = _trim(config?.cloud?.projectId);
  const bootstrapProjectId = _trim(normalizedBootstrap?.projectId);
  const aiProvider = _trim(config?.ai?.provider);
  const aiModel = _trim(config?.ai?.model);
  const aiKeyRef = _trim(config?.ai?.keyRef);
  const aiPrompt = _trim(config?.ai?.systemPrompt);
  const items = [];

  if (!runtimeProjectId) {
    items.push({
      id: "cloud-project-id",
      severity: "warn",
      title: "Cloud Project ID pflegen",
      detail: bootstrapProjectId
        ? `Runtime-Feld ist leer. Mit \"Bootstrap-Projekt \u00fcbernehmen\" kann ${bootstrapProjectId} direkt \u00fcbernommen werden.`
        : "Runtime-Feld ist leer. Trage die produktive Firebase-Projekt-ID bewusst ein.",
    });
  } else if (bootstrapProjectId && runtimeProjectId !== bootstrapProjectId) {
    items.push({
      id: "cloud-project-id",
      severity: "warn",
      title: "Project-ID-Abweichung pr\u00fcfen",
      detail: `Runtime nutzt ${runtimeProjectId}, Bootstrap liefert ${bootstrapProjectId}. Diese Abweichung sollte bewusst dokumentiert sein.`,
    });
  } else {
    items.push({
      id: "cloud-project-id",
      severity: "ok",
      title: "Cloud Project ID konsistent",
      detail: runtimeProjectId
        ? `Runtime und Bootstrap zeigen auf ${runtimeProjectId}.`
        : "Project ID wird separat gepflegt.",
    });
  }

  const missingAiFields = [
    !aiProvider ? "provider" : "",
    !aiModel ? "model" : "",
    !aiKeyRef ? "keyRef" : "",
    !aiPrompt ? "systemPrompt" : "",
  ].filter(Boolean);

  if (missingAiFields.length > 0) {
    items.push({
      id: "ai-runtime-config",
      severity: "warn",
      title: "KI-Runtime vervollst\u00e4ndigen",
      detail: `Es fehlen: ${missingAiFields.join(", ")}. Die Schaltfl\u00e4che \"Gemini-Vorlage einsetzen\" erg\u00e4nzt die Standardwerte schneller und konsistenter.`,
    });
  } else {
    items.push({
      id: "ai-runtime-config",
      severity: "ok",
      title: "KI-Runtime vollst\u00e4ndig",
      detail: `${aiProvider}/${aiModel} ist vollst\u00e4ndig hinterlegt; Secret-Referenz und System-Prompt sind gesetzt.`,
    });
  }

  if (
    aiProvider.toLowerCase() === "gemini" &&
    aiKeyRef &&
    runtimeProjectId &&
    !aiKeyRef.includes(runtimeProjectId)
  ) {
    items.push({
      id: "ai-keyref-project-mismatch",
      severity: "warn",
      title: "Gemini-Secret-Referenz pr\u00fcfen",
      detail: `keyRef verweist nicht sichtbar auf das Runtime-Projekt ${runtimeProjectId}. Pr\u00fcfe Secret-Region und Projektbezug vor dem Go-Live.`,
    });
  }

  return {
    isReady: items.every((item) => item.severity === "ok"),
    projectId: runtimeProjectId,
    bootstrapProjectId,
    aiProvider,
    items,
  };
}

export const buildOperatorConfigGuidance = _buildGuidance;

register("operatorConfig", {
  buildGuidance: _buildGuidance,
});
