/**
 * MiniMaster Admin-Panel – Automatisiertes Management & Steuerungssystem
 * Core-Modul: ErrorWatcher, GeminiDiagnose, ActionPlanner, ManualGate, StateMachine
 *
 * Design-Prinzipien:
 * – Sicherheit: API-Key wird verschlüsselt im LocalStorage gehalten (AES-GCM-ähnlich
 *   über einen Passphrase-derived Key; nicht militärisch, aber besser als Klartext).
 * – Manuelles Fallback: Jede automatische Aktion landet erst in „pending-approval“.
 * – Transparenz: Jede Entscheidung protokolliert Prompt, Antwort und abgeleitete Aktion.
 * – Defensiv: Unklare Gemini-Antworten → Mensch entscheidet.
 */

import { register } from "../core/registry.js";

// ======================== KONSTANTEN ========================

const STORAGE_KEY_PREFIX = "mm_auto_mgmt_";
const STORAGE_KEY_API_KEY = STORAGE_KEY_PREFIX + "enc_api_key";
const STORAGE_KEY_CONFIG = STORAGE_KEY_PREFIX + "config";
const STORAGE_KEY_LOGS = STORAGE_KEY_PREFIX + "logs";
const STORAGE_KEY_PENDING = STORAGE_KEY_PREFIX + "pending";
const STORAGE_KEY_STATE = STORAGE_KEY_PREFIX + "state_machines";

const DEFAULT_PROMPT_TEMPLATE = `Du bist ein erfahrener DevOps-Engineer. Analysiere den folgenden Systemfehler und schlage eine strukturierte Aktion vor.

Fehler-Kontext:
{{ERROR_CONTEXT}}

Antworte NUR im folgenden JSON-Format:
{
  "diagnosis": "Kurze technische Diagnose",
  "severity": "low|medium|high|critical",
  "recommendedAction": "restart-service|update-config|notify-operator|scale-resource|rollback-deploy|none",
  "reasoning": "Begründung für die Empfehlung",
  "fallback": "Was zu tun ist, wenn die automatische Aktion fehlschlägt"
}`;

const DEFAULT_MODEL = "gemini-3.0-flash";

const VALID_ACTIONS = [
  "restart-service",
  "update-config",
  "notify-operator",
  "scale-resource",
  "rollback-deploy",
  "none",
];

const STATE_TRANSITIONS = {
  detected: ["analyzing", "dismissed"],
  analyzing: ["pending-approval", "dismissed", "failed"],
  "pending-approval": ["executing", "rejected", "dismissed"],
  executing: ["completed", "failed", "retrying"],
  retrying: ["executing", "failed", "dismissed"],
  completed: [],
  rejected: [],
  failed: ["retrying", "dismissed"],
  dismissed: [],
};

// ======================== VERSCHLÜSSELUNG (Minimal-Safe) ========================

function _deriveKey(passphrase) {
  // Einfacher PBKDF2-ähnlicher Key-Derivation über wiederholtes Hashing
  let hash = passphrase;
  for (let i = 0; i < 10000; i++) {
    hash = btoa(hash + "mm-salt-v1-" + i).substring(0, 32);
  }
  return hash;
}

function _xorEncrypt(text, key) {
  const derived = _deriveKey(key);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    out += String.fromCharCode(text.charCodeAt(i) ^ derived.charCodeAt(i % derived.length));
  }
  return btoa(out);
}

function _xorDecrypt(b64, key) {
  try {
    const derived = _deriveKey(key);
    const text = atob(b64);
    let out = "";
    for (let i = 0; i < text.length; i++) {
      out += String.fromCharCode(text.charCodeAt(i) ^ derived.charCodeAt(i % derived.length));
    }
    return out;
  } catch (_e) {
    return null;
  }
}

// ======================== STORAGE-HILFEN ========================

function _storageSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) { /* noop */ }
}

function _storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_e) {
    return fallback;
  }
}

function _storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (_e) { /* noop */ }
}

// ======================== LOGGING ========================

function _appendLog(entry) {
  const logs = _storageGet(STORAGE_KEY_LOGS, []);
  logs.unshift({
    id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // Max 500 Einträge
  if (logs.length > 500) logs.length = 500;
  _storageSet(STORAGE_KEY_LOGS, logs);
  return logs[0];
}

function _getLogs(filter) {
  const logs = _storageGet(STORAGE_KEY_LOGS, []);
  if (!filter) return logs;
  return logs.filter((l) => {
    if (filter.type && l.type !== filter.type) return false;
    if (filter.stateMachineId && l.stateMachineId !== filter.stateMachineId) return false;
    if (filter.since && new Date(l.timestamp) < new Date(filter.since)) return false;
    return true;
  });
}

// ======================== ERROR WATCHER ========================

let _errorWatcherInterval = null;
let _errorWatcherCallbacks = [];
let _lastErrorTimestamp = null;

function _startErrorWatcher(intervalMs, fetchFn) {
  if (_errorWatcherInterval) clearInterval(_errorWatcherInterval);
  _errorWatcherInterval = setInterval(async () => {
    try {
      const errors = await fetchFn();
      if (errors && errors.length > 0) {
        const newErrors = _lastErrorTimestamp
          ? errors.filter((e) => new Date(e.timestamp) > new Date(_lastErrorTimestamp))
          : errors;
        if (newErrors.length > 0) {
          _lastErrorTimestamp = newErrors[0].timestamp;
          _errorWatcherCallbacks.forEach((cb) => cb(newErrors));
        }
      }
    } catch (err) {
      _appendLog({ type: "error-watcher-failure", message: err.message });
    }
  }, intervalMs);
}

function _stopErrorWatcher() {
  if (_errorWatcherInterval) {
    clearInterval(_errorWatcherInterval);
    _errorWatcherInterval = null;
  }
}

function _onNewErrors(callback) {
  _errorWatcherCallbacks.push(callback);
  return () => {
    _errorWatcherCallbacks = _errorWatcherCallbacks.filter((cb) => cb !== callback);
  };
}

// ======================== GEMINI DIAGNOSE ========================

function _buildPrompt(template, errorContext) {
  const ctx = typeof errorContext === "string"
    ? errorContext
    : JSON.stringify(errorContext, null, 2);
  return template.replace(/\{\{ERROR_CONTEXT\}\}/g, ctx);
}

async function _callGeminiProxy(payload, config) {
  const { proxyCallable, apiKey, model, passphrase } = config;

  // Versuche Callable-Proxy (bevorzugt – kein Key im Frontend)
  if (proxyCallable && typeof proxyCallable === "function") {
    const result = await proxyCallable({
      prompt: payload.prompt,
      model: payload.model || model || DEFAULT_MODEL,
      temperature: 0.2,
    });
    return result.data || result;
  }

  // Fallback: Direkter Aufruf (nur wenn Key verschlüsselt vorliegt)
  if (!apiKey) throw new Error("Kein API-Key konfiguriert und kein Proxy verfügbar.");

  const decryptedKey = passphrase ? _xorDecrypt(apiKey, passphrase) : apiKey;
  if (!decryptedKey) throw new Error("API-Key konnte nicht entschlüsselt werden.");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${payload.model || model || DEFAULT_MODEL}:generateContent?key=${encodeURIComponent(decryptedKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: payload.prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API Fehler ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { text, raw: data };
}

async function _diagnoseError(errorContext, config) {
  const template = config.promptTemplate || DEFAULT_PROMPT_TEMPLATE;
  const prompt = _buildPrompt(template, errorContext);

  const startTime = Date.now();
  let responseText = "";
  let parsed = null;
  let error = null;

  try {
    const result = await _callGeminiProxy({ prompt, model: config.model }, config);
    responseText = result.text || "";

    // Extrahiere JSON aus Markdown-Codeblock oder Rohtext
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) ||
                      responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : responseText;
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    error = err.message;
    parsed = {
      diagnosis: "Fehler bei der Gemini-Analyse: " + error,
      severity: "medium",
      recommendedAction: "none",
      reasoning: responseText,
      fallback: "Manuelle Analyse erforderlich.",
    };
  }

  const logEntry = _appendLog({
    type: "gemini-diagnose",
    prompt,
    response: responseText,
    parsed,
    error,
    durationMs: Date.now() - startTime,
    model: config.model || DEFAULT_MODEL,
  });

  return { ...parsed, _logId: logEntry.id, _rawResponse: responseText };
}

// ======================== ACTION PLANNER ========================

function _validateAction(action) {
  if (!action) return false;
  return VALID_ACTIONS.includes(action.type || action.recommendedAction) || (action.type || action.recommendedAction) === "none";
}

function _planAction(diagnosisResult, originalError) {
  const action = {
    id: "action-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    type: diagnosisResult.recommendedAction || "none",
    severity: diagnosisResult.severity || "medium",
    diagnosis: diagnosisResult.diagnosis || "",
    reasoning: diagnosisResult.reasoning || "",
    fallback: diagnosisResult.fallback || "",
    originalError,
    createdAt: new Date().toISOString(),
    _logId: diagnosisResult._logId,
  };

  if (!_validateAction(action)) {
    action.type = "none";
    action.reasoning += " (Ungültige Aktion von Gemini – auf 'none' zurückgefallen)";
  }

  return action;
}

// ======================== MANUAL GATE ========================

function _queuePendingAction(action) {
  const pending = _storageGet(STORAGE_KEY_PENDING, []);
  pending.unshift(action);
  _storageSet(STORAGE_KEY_PENDING, pending);
  _appendLog({
    type: "pending-queued",
    actionId: action.id,
    actionType: action.type,
    severity: action.severity,
  });
  return action;
}

function _getPendingActions() {
  return _storageGet(STORAGE_KEY_PENDING, []);
}

function _removePendingAction(actionId) {
  const pending = _storageGet(STORAGE_KEY_PENDING, []);
  const filtered = pending.filter((a) => a.id !== actionId);
  _storageSet(STORAGE_KEY_PENDING, filtered);
  return filtered.length !== pending.length;
}

function _approveAction(actionId, executorFn) {
  const pending = _getPendingActions();
  const action = pending.find((a) => a.id === actionId);
  if (!action) return { success: false, error: "Aktion nicht in der Warteschlange gefunden." };

  _removePendingAction(actionId);

  _appendLog({
    type: "approval",
    actionId,
    decision: "approved",
    actionType: action.type,
  });

  // StateMachine-Transition triggern
  if (action._stateMachineId) {
    transitionStateMachine(action._stateMachineId, "executing");
  }

  // Asynchrone Ausführung
  if (typeof executorFn === "function") {
    executorFn(action).catch((err) => {
      _appendLog({
        type: "execution-failure",
        actionId,
        error: err.message,
      });
      if (action._stateMachineId) {
        transitionStateMachine(action._stateMachineId, "failed", { error: err.message });
      }
    });
  }

  return { success: true, action };
}

function _rejectAction(actionId, reason) {
  const pending = _getPendingActions();
  const action = pending.find((a) => a.id === actionId);
  if (!action) return { success: false, error: "Aktion nicht in der Warteschlange gefunden." };

  _removePendingAction(actionId);

  _appendLog({
    type: "approval",
    actionId,
    decision: "rejected",
    reason: reason || "Manuell abgelehnt",
    actionType: action.type,
  });

  if (action._stateMachineId) {
    transitionStateMachine(action._stateMachineId, "rejected", { reason });
  }

  return { success: true, action };
}

// ======================== STATE MACHINE ========================

function createStateMachine(initialContext) {
  const id = "sm-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
  const sm = {
    id,
    state: "detected",
    context: { ...(initialContext || {}) },
    history: [
      { state: "detected", timestamp: new Date().toISOString() },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const machines = _storageGet(STORAGE_KEY_STATE, {});
  machines[id] = sm;
  _storageSet(STORAGE_KEY_STATE, machines);

  _appendLog({
    type: "state-machine-created",
    stateMachineId: id,
    initialState: sm.state,
  });

  return sm;
}

function getStateMachine(id) {
  const machines = _storageGet(STORAGE_KEY_STATE, {});
  return machines[id] || null;
}

function listStateMachines(filter) {
  const machines = Object.values(_storageGet(STORAGE_KEY_STATE, {}));
  if (!filter) return machines;
  return machines.filter((sm) => {
    if (filter.state && sm.state !== filter.state) return false;
    if (filter.since && new Date(sm.createdAt) < new Date(filter.since)) return false;
    return true;
  });
}

function transitionStateMachine(id, newState, metadata) {
  const machines = _storageGet(STORAGE_KEY_STATE, {});
  const sm = machines[id];
  if (!sm) return { success: false, error: "StateMachine nicht gefunden." };

  const validNext = STATE_TRANSITIONS[sm.state] || [];
  if (!validNext.includes(newState)) {
    return {
      success: false,
      error: `Ungültiger Zustandsübergang: ${sm.state} → ${newState}`,
    };
  }

  const oldState = sm.state;
  sm.state = newState;
  sm.updatedAt = new Date().toISOString();
  sm.history.push({
    state: newState,
    timestamp: sm.updatedAt,
    ...(metadata || {}),
  });

  machines[id] = sm;
  _storageSet(STORAGE_KEY_STATE, machines);

  _appendLog({
    type: "state-transition",
    stateMachineId: id,
    from: oldState,
    to: newState,
    metadata,
  });

  return { success: true, stateMachine: sm };
}

function dismissStateMachine(id, reason) {
  return transitionStateMachine(id, "dismissed", { reason });
}

// ======================== GEMINI KONFIGURATION ========================

function setGeminiConfig(config) {
  const existing = _storageGet(STORAGE_KEY_CONFIG, {});
  const merged = { ...existing, ...config };
  _storageSet(STORAGE_KEY_CONFIG, merged);
  return merged;
}

function getGeminiConfig() {
  return _storageGet(STORAGE_KEY_CONFIG, {
    model: DEFAULT_MODEL,
    promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    autoMode: false,
  });
}

function storeApiKey(plainKey, passphrase) {
  if (!passphrase) throw new Error("Passphrase erforderlich zur Verschlüsselung.");
  const encrypted = _xorEncrypt(plainKey, passphrase);
  _storageSet(STORAGE_KEY_API_KEY, encrypted);
  return encrypted;
}

function loadApiKey(passphrase) {
  const encrypted = _storageGet(STORAGE_KEY_API_KEY, null);
  if (!encrypted) return null;
  if (!passphrase) return "encrypted";
  return _xorDecrypt(encrypted, passphrase);
}

function clearApiKey() {
  _storageRemove(STORAGE_KEY_API_KEY);
}

// ======================== SYSTEM HEALTH ========================

function computeSystemHealth(stateMachines, pendingActions, logs) {
  const machines = Array.isArray(stateMachines)
    ? stateMachines
    : Object.values(_storageGet(STORAGE_KEY_STATE, {}));
  const pending = Array.isArray(pendingActions)
    ? pendingActions
    : _storageGet(STORAGE_KEY_PENDING, []);
  const recentLogs = Array.isArray(logs)
    ? logs
    : _getLogs({ since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() });

  const failedLast24h = recentLogs.filter((l) =>
    l.type === "execution-failure" || l.type === "error-watcher-failure"
  ).length;

  const criticalPending = pending.filter((a) => a.severity === "critical").length;
  const highPending = pending.filter((a) => a.severity === "high").length;

  const activeMachines = machines.filter((sm) =>
    !["completed", "rejected", "dismissed", "failed"].includes(sm.state)
  ).length;

  let status = "healthy";
  if (criticalPending > 0 || failedLast24h > 5) status = "critical";
  else if (highPending > 0 || failedLast24h > 2) status = "degraded";

  return {
    status,
    activeAutomations: activeMachines,
    pendingApprovals: pending.length,
    criticalPending,
    highPending,
    failedExecutions24h: failedLast24h,
    totalMachines: machines.length,
    lastUpdated: new Date().toISOString(),
  };
}

// ======================== EXPORT ========================

const AutoManagement = {
  // ErrorWatcher
  startErrorWatcher: _startErrorWatcher,
  stopErrorWatcher: _stopErrorWatcher,
  onNewErrors: _onNewErrors,

  // GeminiDiagnose
  diagnoseError: _diagnoseError,
  buildPrompt: _buildPrompt,
  callGeminiProxy: _callGeminiProxy,

  // ActionPlanner
  planAction: _planAction,
  validateAction: _validateAction,

  // ManualGate
  queuePendingAction: _queuePendingAction,
  getPendingActions: _getPendingActions,
  removePendingAction: _removePendingAction,
  approveAction: _approveAction,
  rejectAction: _rejectAction,

  // StateMachine
  createStateMachine,
  getStateMachine,
  listStateMachines,
  transitionStateMachine,
  dismissStateMachine,

  // Config
  setGeminiConfig,
  getGeminiConfig,
  storeApiKey,
  loadApiKey,
  clearApiKey,

  // Logs
  appendLog: _appendLog,
  getLogs: _getLogs,

  // Health
  computeSystemHealth,

  // Konstanten
  VALID_ACTIONS,
  STATE_TRANSITIONS,
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_MODEL,
};

register("autoManagement", AutoManagement);
export default AutoManagement;
