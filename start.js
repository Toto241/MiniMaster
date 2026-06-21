const FIREBASE_STORAGE_KEY = "operatorFirebaseConfigOverride";
const FIREBASE_FIELDS = [
  { key: "apiKey",            inputId: "fb-apiKey" },
  { key: "authDomain",        inputId: "fb-authDomain" },
  { key: "projectId",         inputId: "fb-projectId" },
  { key: "storageBucket",     inputId: "fb-storageBucket" },
  { key: "messagingSenderId", inputId: "fb-messagingSenderId" },
  { key: "appId",             inputId: "fb-appId" },
];

const START_WORK_DEFAULT_ETA_SECONDS = 10;
const startWorkState = {
  hideTimer: null,
  tickTimer: null,
  startedAtMs: 0,
  etaSeconds: START_WORK_DEFAULT_ETA_SECONDS,
  label: "Arbeit in Gange",
};

function getStartWorkElements() {
  return {
    root: document.getElementById("global-work-status"),
    label: document.getElementById("global-work-label"),
    eta: document.getElementById("global-work-eta"),
  };
}

function formatStartEta(seconds) {
  const normalized = Math.max(1, Math.ceil(Number(seconds) || START_WORK_DEFAULT_ETA_SECONDS));
  if (normalized >= 60) {
    return Math.ceil(normalized / 60) + " min";
  }
  return normalized + "s";
}

function updateStartWorkIndicator() {
  const elements = getStartWorkElements();
  if (!elements.root || elements.root.hidden) return;

  const elapsedSeconds = Math.floor((Date.now() - startWorkState.startedAtMs) / 1000);
  const remainingSeconds = Math.max(1, startWorkState.etaSeconds - elapsedSeconds);
  const etaText = elapsedSeconds >= startWorkState.etaSeconds
    ? "Zeitliche Einschätzung: fast fertig …"
    : "Zeitliche Einschätzung: noch ca. " + formatStartEta(remainingSeconds);

  if (elements.label) elements.label.textContent = startWorkState.label;
  if (elements.eta) elements.eta.textContent = etaText;
}

function showStartWorkIndicator(label, etaSeconds) {
  const elements = getStartWorkElements();
  if (!elements.root) return;

  startWorkState.label = label || "Arbeit in Gange";
  startWorkState.etaSeconds = Math.max(3, Number(etaSeconds) || START_WORK_DEFAULT_ETA_SECONDS);
  startWorkState.startedAtMs = Date.now();

  if (startWorkState.hideTimer) {
    window.clearTimeout(startWorkState.hideTimer);
    startWorkState.hideTimer = null;
  }
  if (!startWorkState.tickTimer) {
    startWorkState.tickTimer = window.setInterval(updateStartWorkIndicator, 1000);
  }

  elements.root.hidden = false;
  updateStartWorkIndicator();
}

function hideStartWorkIndicator(delayMs = 0) {
  const elements = getStartWorkElements();
  if (!elements.root) return;

  if (startWorkState.hideTimer) {
    window.clearTimeout(startWorkState.hideTimer);
  }

  const hideNow = () => {
    elements.root.hidden = true;
    if (startWorkState.tickTimer) {
      window.clearInterval(startWorkState.tickTimer);
      startWorkState.tickTimer = null;
    }
  };

  if (delayMs > 0) {
    startWorkState.hideTimer = window.setTimeout(hideNow, delayMs);
  } else {
    hideNow();
  }
}

function runWithStartWorkIndicator(label, etaSeconds, action) {
  showStartWorkIndicator(label, etaSeconds);
  return Promise.resolve()
    .then(action)
    .finally(() => hideStartWorkIndicator(1200));
}

function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isPlaceholder(value) {
  return typeof value !== "string" || !value.trim() || value.includes("your-");
}

function isValidFirebaseConfig(config) {
  if (!config || typeof config !== "object") return false;
  return FIREBASE_FIELDS.every(({ key }) => !isPlaceholder(config[key]));
}

function setModalStatus(message, type) {
  const statusEl = document.getElementById("fb-status");
  statusEl.textContent = message;
  statusEl.className = type ? "modal-status " + type : "modal-status";
}

function populateFirebaseModal(config) {
  for (const { key, inputId } of FIREBASE_FIELDS) {
    const input = document.getElementById(inputId);
    input.value = config && config[key] ? config[key] : "";
  }
}

function renderConfigStatus() {
  const config = getStoredFirebaseConfig();
  const ready = isValidFirebaseConfig(config);
  const projectId = ready ? config.projectId : "Nicht konfiguriert";
  const statusText = ready ? "Vollständige Web-Konfiguration erkannt" : "Konfiguration fehlt oder enthält Platzhalter";
  const nextStep = ready ? "Panels öffnen und End-to-End prüfen" : "Firebase-Werte aus Console übernehmen";
  const pill = document.getElementById("config-status-pill");
  const infoBar = document.getElementById("info-bar-text");

  document.getElementById("config-status-text").textContent = statusText;
  document.getElementById("config-project-text").textContent = projectId;
  document.getElementById("next-step-text").textContent = nextStep;

  if (ready) {
    pill.textContent = "✅ Firebase-Konfiguration gespeichert · Projekt: " + config.projectId;
    pill.className = "status-pill config-pill-ready";
    infoBar.textContent = "MiniMaster ist mit lokaler Firebase-Webkonfiguration vorbereitet. Empfohlen: Admin-Panel und Eltern-Panel kurz gegentesten.";
  } else {
    pill.textContent = "⚠️ Keine produktive Firebase-Konfiguration erkannt";
    pill.className = "status-pill config-pill-missing";
    infoBar.textContent = "Es wurden noch keine vollständigen Firebase-Webwerte erkannt. Bitte Konfiguration speichern, bevor Panels produktiv genutzt werden.";
  }
}

function openFirebaseModal() {
  populateFirebaseModal(getStoredFirebaseConfig());
  setModalStatus("", "");
  document.getElementById("fb-modal").classList.add("open");
}

function closeFirebaseModal() {
  document.getElementById("fb-modal").classList.remove("open");
}

function collectFirebaseConfigFromInputs() {
  const config = {};
  for (const { key, inputId } of FIREBASE_FIELDS) {
    const input = document.getElementById(inputId);
    const value = input.value.trim();
    if (isPlaceholder(value)) {
      input.focus();
      throw new Error("Bitte alle Felder vollständig und ohne Platzhalter ausfüllen.");
    }
    config[key] = value;
  }
  return config;
}

function saveFirebaseConfig() {
  try {
    showStartWorkIndicator("Firebase-Konfiguration wird gespeichert", 6);
    const config = collectFirebaseConfigFromInputs();
    localStorage.setItem(FIREBASE_STORAGE_KEY, JSON.stringify(config));
    setModalStatus("✅ Firebase-Konfiguration gespeichert. Admin-Dashboard und Eltern-Panel verwenden diese Werte beim nächsten Laden.", "success");
    renderConfigStatus();
    setTimeout(closeFirebaseModal, 2200);
  } catch (e) {
    setModalStatus(e.message || "Fehler beim Speichern der Firebase-Konfiguration.", "error");
  } finally {
    hideStartWorkIndicator(1200);
  }
}

function normalizeBasePath(pathname) {
  return decodeURIComponent(String(pathname || "").replace(/\/[^/]*$/, "").replace(/^\//, "")).replace(/\//g, "\\");
}

function buildFullPath(relativePath, pathname) {
  const basePath = normalizeBasePath(pathname || location.pathname);
  return (basePath ? basePath + "\\" : "") + relativePath;
}

function copyPath(elementId) {
  const codeEl = document.getElementById(elementId);
  const relativePath = codeEl.textContent;
  const fullPath = buildFullPath(relativePath, location.pathname);
  const btn = codeEl.nextElementSibling;

  function markCopied() {
    btn.textContent = "✅ Kopiert!";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "📋 Kopieren";
      btn.classList.remove("copied");
    }, 1500);
  }

  return navigator.clipboard.writeText(fullPath).then(markCopied).catch(() => {
    // Fallback für file:// und ältere Browser ohne Clipboard-API-Permission.
    const ta = document.createElement("textarea");
    ta.value = fullPath;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      markCopied();
    } finally {
      document.body.removeChild(ta);
    }
  });
}

function bindStartPageUiActions() {
  const bindClick = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", handler);
  };

  bindClick("open-firebase-modal-btn-1", openFirebaseModal);
  bindClick("open-firebase-modal-btn-2", openFirebaseModal);
  bindClick("copy-master-apk-path-btn", () => runWithStartWorkIndicator("APK-Pfad wird kopiert", 4, () => copyPath("master-apk-path")));
  bindClick("copy-child-apk-path-btn", () => runWithStartWorkIndicator("APK-Pfad wird kopiert", 4, () => copyPath("child-apk-path")));
  bindClick("close-firebase-modal-btn", closeFirebaseModal);
  bindClick("save-firebase-config-btn", saveFirebaseConfig);

  document.querySelectorAll("a.btn[href]").forEach((link) => {
    if (link.__workStatusBound) return;
    link.__workStatusBound = true;
    link.addEventListener("click", () => {
      const label = (link.textContent || "Panel wird geöffnet").trim() || "Panel wird geöffnet";
      showStartWorkIndicator(label + " läuft", 8);
      hideStartWorkIndicator(3500);
    });
  });

  const modal = document.getElementById("fb-modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeFirebaseModal();
    });
  }

  renderConfigStatus();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindStartPageUiActions);
} else {
  bindStartPageUiActions();
}
