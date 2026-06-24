// Eltern-Onboarding Setup-Wizard fuer das MiniMaster Eltern-Panel.
// Alle Logik liegt hier (CSP: script-src 'self' https://www.gstatic.com),
// es gibt keine Inline-Event-Handler.

const WIZARD_ID = "parent-onboarding";
const TOTAL_STEPS = 7;
const STEP_LABELS = [
  "Willkommen",
  "Anmeldung",
  "Koppeln",
  "Regeln",
  "Aufgabe",
  "Abo",
  "Fertig"
];

const FIREBASE_STORAGE_KEY = "operatorFirebaseConfigOverride";
const fallbackFirebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "your-messaging-sender-id",
  appId: "your-app-id"
};

let app = null;
let db = null;
let functions = null;
let auth = null;
let appCheckConfigured = false;

let currentUser = null;
let currentStep = 0;
let completedSteps = [];

// Zusammenfassung fuer den letzten Schritt.
const summary = {
  childId: "",
  pairingCode: "",
  rulesSaved: false,
  taskCreated: false,
  subscription: ""
};

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = type ? "status " + type : "status";
}

function getAppCheckSiteKey() {
  const globalSiteKey = typeof window !== "undefined" ? window.MINIMASTER_APP_CHECK_SITE_KEY : null;
  if (globalSiteKey) {
    return globalSiteKey;
  }
  const host = typeof window !== "undefined" && window.location ? String(window.location.hostname || "") : "";
  const isLocalDev = host === "localhost" || host === "127.0.0.1";
  if (!isLocalDev) {
    return null;
  }
  try {
    return localStorage.getItem("minimasterAppCheckSiteKey");
  } catch {
    return null;
  }
}

function ensureAppCheckConfigured(appInstance, statusElementId) {
  if (appCheckConfigured) return true;
  const siteKey = getAppCheckSiteKey();
  if (!siteKey) {
    setStatus(statusElementId, "App Check ist nicht konfiguriert. Bitte zuerst im Operator-Dashboard einen reCAPTCHA-Site-Key hinterlegen.", "error");
    return false;
  }
  if (typeof firebase.appCheck !== "function") {
    setStatus(statusElementId, "Firebase App Check SDK wurde nicht geladen.", "error");
    return false;
  }
  firebase.appCheck(appInstance).activate(siteKey, true);
  appCheckConfigured = true;
  return true;
}

function loadFirebaseConfig() {
  try {
    const raw = localStorage.getItem(FIREBASE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && parsed.projectId && parsed.apiKey
        && !String(parsed.projectId).includes("your-")) {
      return parsed;
    }
  } catch (error) {
    console.warn("Firebase override konnte nicht geladen werden:", error);
  }
  try {
    const injected = typeof window !== "undefined" ? window.__MM_FIREBASE_CONFIG__ : null;
    if (injected && injected.projectId && injected.apiKey
        && !String(injected.projectId).includes("your-")) {
      return injected;
    }
  } catch (error) {
    console.warn("Injected Firebase-Konfiguration konnte nicht gelesen werden:", error);
  }
  return fallbackFirebaseConfig;
}

// ---- Schritt-Navigation & Fortschritt -------------------------------------

function isSignedIn() {
  return Boolean(currentUser);
}

// Schritte ab "Koppeln" (Index 2) benoetigen eine Anmeldung.
function isStepLocked(stepIndex) {
  return stepIndex >= 2 && !isSignedIn();
}

function renderProgress() {
  const container = document.getElementById("wizard-progress");
  if (!container) return;
  container.replaceChildren();
  for (let i = 0; i < TOTAL_STEPS; i += 1) {
    const dot = document.createElement("div");
    dot.className = "step-dot";
    if (i === currentStep) {
      dot.classList.add("active");
    } else if (completedSteps.includes(i)) {
      dot.classList.add("done");
    }
    dot.textContent = (i + 1) + ". " + STEP_LABELS[i];
    container.appendChild(dot);
  }
}

function updateNavButtons() {
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  if (prevBtn) {
    prevBtn.disabled = currentStep === 0;
  }
  if (nextBtn) {
    const isLast = currentStep === TOTAL_STEPS - 1;
    nextBtn.textContent = isLast ? "Abschliessen" : "Weiter";
    // Auf dem Anmelde-Schritt darf erst weiter, wenn angemeldet.
    nextBtn.disabled = currentStep === 1 && !isSignedIn();
  }
}

function showStep(stepIndex) {
  let target = Math.max(0, Math.min(TOTAL_STEPS - 1, stepIndex));
  // Gesperrte Schritte (nicht angemeldet) werden auf den Anmelde-Schritt umgeleitet.
  if (isStepLocked(target)) {
    target = 1;
  }
  currentStep = target;

  const steps = document.querySelectorAll(".wizard-step");
  steps.forEach((stepEl) => {
    const idx = Number(stepEl.getAttribute("data-step"));
    stepEl.classList.toggle("active", idx === currentStep);
  });

  if (currentStep === TOTAL_STEPS - 1) {
    renderSummary();
  }

  renderProgress();
  updateNavButtons();
}

function markStepCompleted(stepIndex) {
  if (!completedSteps.includes(stepIndex)) {
    completedSteps.push(stepIndex);
  }
}

async function persistProgress(status) {
  if (!functions) return;
  try {
    const setProgress = functions.httpsCallable("setWizardProgress");
    await setProgress({
      wizardId: WIZARD_ID,
      currentStep,
      completedSteps,
      status: status || (currentStep === TOTAL_STEPS - 1 ? "completed" : "in_progress")
    });
  } catch (error) {
    // Fortschritt darf den Assistenten nicht blockieren.
    console.warn("Fortschritt konnte nicht gespeichert werden:", error && error.message);
  }
}

async function goToStep(stepIndex) {
  showStep(stepIndex);
  await persistProgress();
}

async function handleNext() {
  markStepCompleted(currentStep);
  if (currentStep === TOTAL_STEPS - 1) {
    await persistProgress("completed");
    return;
  }
  await goToStep(currentStep + 1);
}

async function handlePrev() {
  await goToStep(currentStep - 1);
}

async function loadSavedProgress() {
  if (!functions) return;
  try {
    const getProgress = functions.httpsCallable("getWizardProgress");
    const result = await getProgress({ wizardId: WIZARD_ID });
    const data = result && result.data ? result.data : {};
    const saved = data.progress || data;
    if (saved && typeof saved.currentStep === "number") {
      currentStep = Math.max(0, Math.min(TOTAL_STEPS - 1, saved.currentStep));
    }
    if (saved && Array.isArray(saved.completedSteps)) {
      completedSteps = saved.completedSteps.filter((n) => typeof n === "number");
    }
  } catch (error) {
    console.warn("Gespeicherter Fortschritt konnte nicht geladen werden:", error && error.message);
  }
  showStep(currentStep);
}

// ---- Hilfsfunktion: childId aus den Eingabefeldern ableiten ----------------

function syncChildIdFields(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return;
  summary.childId = trimmed;
  ["pair-child-id", "rules-child-id", "task-child-id"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && !el.value.trim()) {
      el.value = trimmed;
    }
  });
}

function requireFunctions(statusId) {
  if (!functions || !isSignedIn()) {
    setStatus(statusId, "Bitte zuerst anmelden, bevor Sie fortfahren.", "error");
    return false;
  }
  if (!ensureAppCheckConfigured(app, statusId)) {
    return false;
  }
  return true;
}

// ---- Schritt 3: Kopplung ---------------------------------------------------

async function createPairingCode() {
  if (!requireFunctions("pairing-status")) return;
  const childIdInput = document.getElementById("pair-child-id");
  const childId = childIdInput ? childIdInput.value.trim() : "";
  if (!childId) {
    setStatus("pairing-status", "Bitte zuerst eine Kind-Bezeichnung eingeben.", "error");
    return;
  }
  syncChildIdFields(childId);
  setStatus("pairing-status", "Erzeuge Kopplungscode...", "");
  try {
    const callable = functions.httpsCallable("createPairingCode");
    const result = await callable({ childId });
    const data = result && result.data ? result.data : {};
    const code = data.pairingCode || data.code || data.codeValue || "";
    const box = document.getElementById("pairing-code-box");
    if (box && code) {
      box.hidden = false;
      box.textContent = String(code);
    }
    summary.pairingCode = String(code || "");
    setStatus("pairing-status", code ? "Kopplungscode erzeugt. Bitte am Kindgeraet eingeben." : "Code erzeugt.", "success");
    markStepCompleted(2);
  } catch (error) {
    setStatus("pairing-status", "Kopplungscode fehlgeschlagen: " + (error && error.message ? error.message : "Unbekannter Fehler"), "error");
  }
}

async function generatePairingLink() {
  if (!requireFunctions("pairing-status")) return;
  const childIdInput = document.getElementById("pair-child-id");
  const childId = childIdInput ? childIdInput.value.trim() : "";
  if (!childId) {
    setStatus("pairing-status", "Bitte zuerst eine Kind-Bezeichnung eingeben.", "error");
    return;
  }
  syncChildIdFields(childId);
  setStatus("pairing-status", "Erzeuge Kopplungslink...", "");
  try {
    const callable = functions.httpsCallable("generatePairingLink");
    const result = await callable({ childId });
    const data = result && result.data ? result.data : {};
    const link = data.pairingLink || data.link || data.url || "";
    const box = document.getElementById("pairing-link-box");
    if (box) {
      box.hidden = false;
      if (link) {
        box.innerHTML = "Kopplungslink: <strong>" + escapeHtml(link) + "</strong>";
      } else {
        box.textContent = "Kopplungslink wurde erzeugt.";
      }
    }
    setStatus("pairing-status", "Kopplungslink erzeugt. Bitte am Kindgeraet oeffnen.", "success");
    markStepCompleted(2);
  } catch (error) {
    setStatus("pairing-status", "Kopplungslink fehlgeschlagen: " + (error && error.message ? error.message : "Unbekannter Fehler"), "error");
  }
}

// ---- Schritt 4: Regeln -----------------------------------------------------

async function saveRules() {
  if (!requireFunctions("rules-status")) return;
  const childId = (document.getElementById("rules-child-id")?.value || "").trim();
  const dailyLimitRaw = (document.getElementById("rules-daily-limit")?.value || "").trim();
  const bedtimeStart = (document.getElementById("rules-bedtime-start")?.value || "").trim();
  const bedtimeEnd = (document.getElementById("rules-bedtime-end")?.value || "").trim();

  if (!childId) {
    setStatus("rules-status", "Bitte eine Kind-Bezeichnung eingeben.", "error");
    return;
  }
  const dailyLimit = dailyLimitRaw === "" ? null : Number(dailyLimitRaw);
  if (dailyLimit !== null && (!Number.isFinite(dailyLimit) || dailyLimit < 0)) {
    setStatus("rules-status", "Bitte ein gueltiges Tageslimit in Minuten angeben.", "error");
    return;
  }
  syncChildIdFields(childId);
  setStatus("rules-status", "Speichere Regeln...", "");
  try {
    const callable = functions.httpsCallable("setUsageRules");
    await callable({
      childId,
      usageRules: {
        dailyLimit,
        bedtimeStart,
        bedtimeEnd
      }
    });
    summary.rulesSaved = true;
    setStatus("rules-status", "Regeln gespeichert.", "success");
    markStepCompleted(3);
  } catch (error) {
    setStatus("rules-status", "Regeln konnten nicht gespeichert werden: " + (error && error.message ? error.message : "Unbekannter Fehler"), "error");
  }
}

async function saveBlacklist() {
  if (!requireFunctions("blacklist-status")) return;
  const childId = (document.getElementById("rules-child-id")?.value || "").trim();
  const raw = (document.getElementById("rules-blacklist")?.value || "").trim();
  if (!childId) {
    setStatus("blacklist-status", "Bitte eine Kind-Bezeichnung eingeben.", "error");
    return;
  }
  const blacklist = raw
    ? raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    : [];
  syncChildIdFields(childId);
  setStatus("blacklist-status", "Speichere App-Blacklist...", "");
  try {
    const callable = functions.httpsCallable("updateAppBlacklist");
    await callable({ childId, blacklist });
    setStatus("blacklist-status", "App-Blacklist gespeichert (" + blacklist.length + " App(s)).", "success");
  } catch (error) {
    setStatus("blacklist-status", "App-Blacklist fehlgeschlagen: " + (error && error.message ? error.message : "Unbekannter Fehler"), "error");
  }
}

// ---- Schritt 5: Aufgabe ----------------------------------------------------

async function createTask() {
  if (!requireFunctions("task-status")) return;
  const childId = (document.getElementById("task-child-id")?.value || "").trim();
  const description = (document.getElementById("task-description")?.value || "").trim();
  if (!childId) {
    setStatus("task-status", "Bitte eine Kind-Bezeichnung eingeben.", "error");
    return;
  }
  if (!description) {
    setStatus("task-status", "Bitte eine Aufgabenbeschreibung eingeben.", "error");
    return;
  }
  syncChildIdFields(childId);
  setStatus("task-status", "Lege Aufgabe an...", "");
  try {
    const callable = functions.httpsCallable("createTask");
    await callable({ childId, description });
    summary.taskCreated = true;
    setStatus("task-status", "Aufgabe wurde angelegt.", "success");
    markStepCompleted(4);
  } catch (error) {
    setStatus("task-status", "Aufgabe konnte nicht angelegt werden: " + (error && error.message ? error.message : "Unbekannter Fehler"), "error");
  }
}

// ---- Schritt 6: Abo --------------------------------------------------------

async function loadSubscription() {
  if (!requireFunctions("subscription-status")) return;
  setStatus("subscription-status", "Lade Abo-Status...", "");
  try {
    const callable = functions.httpsCallable("getSubscriptionStatus");
    const result = await callable();
    const data = result && result.data ? result.data : {};
    const status = data.status || data.subscriptionStatus || (data.trial ? "trial" : "unbekannt");
    const details = document.getElementById("subscription-details");
    if (details) {
      const lines = [];
      if (data.status || data.subscriptionStatus) lines.push("Status: " + escapeHtml(String(data.status || data.subscriptionStatus)));
      if (data.plan) lines.push("Plan: " + escapeHtml(String(data.plan)));
      if (data.trialEndsAt || data.trialEnd) lines.push("Test endet: " + escapeHtml(String(data.trialEndsAt || data.trialEnd)));
      if (data.expiresAt || data.currentPeriodEnd) lines.push("Abo bis: " + escapeHtml(String(data.expiresAt || data.currentPeriodEnd)));
      details.innerHTML = lines.length ? lines.join("<br>") : "Keine weiteren Details verfuegbar.";
    }
    summary.subscription = String(status);
    setStatus("subscription-status", "Abo-Status: " + String(status), "success");
    markStepCompleted(5);
  } catch (error) {
    setStatus("subscription-status", "Abo-Status konnte nicht geladen werden: " + (error && error.message ? error.message : "Unbekannter Fehler"), "error");
  }
}

// ---- Schritt 7: Zusammenfassung -------------------------------------------

function renderSummary() {
  const box = document.getElementById("summary-box");
  if (!box) return;
  const lines = [];
  lines.push("Angemeldet: " + (isSignedIn() ? "Ja (" + escapeHtml(currentUser.email || currentUser.uid) + ")" : "Nein"));
  lines.push("Kind-Bezeichnung: " + (summary.childId ? escapeHtml(summary.childId) : "—"));
  lines.push("Kopplungscode: " + (summary.pairingCode ? escapeHtml(summary.pairingCode) : "—"));
  lines.push("Regeln gespeichert: " + (summary.rulesSaved ? "Ja" : "Nein"));
  lines.push("Erste Aufgabe: " + (summary.taskCreated ? "Angelegt" : "Nein"));
  lines.push("Abo-Status: " + (summary.subscription ? escapeHtml(summary.subscription) : "Nicht geprueft"));
  box.innerHTML = lines.join("<br>");
}

// ---- Anmeldung -------------------------------------------------------------

function applyAuthState(user) {
  currentUser = user || null;
  const loginHint = document.getElementById("auth-login-hint");
  if (isSignedIn()) {
    const label = currentUser.email ? currentUser.email + " · " + currentUser.uid : currentUser.uid;
    setStatus("auth-status", "Angemeldet als " + label, "success");
    if (loginHint) loginHint.hidden = true;
    markStepCompleted(1);
  } else {
    setStatus("auth-status", "Sie sind nicht angemeldet.", "error");
    if (loginHint) loginHint.hidden = false;
  }
  // Wenn der aktuell sichtbare Schritt gesperrt ist, zurueck zur Anmeldung.
  if (isStepLocked(currentStep)) {
    showStep(1);
  } else {
    updateNavButtons();
    renderProgress();
  }
}

// ---- Initialisierung -------------------------------------------------------

function bindUiActions() {
  document.getElementById("btn-prev")?.addEventListener("click", () => { handlePrev(); });
  document.getElementById("btn-next")?.addEventListener("click", () => { handleNext(); });
  document.getElementById("btn-create-pairing-code")?.addEventListener("click", () => { createPairingCode(); });
  document.getElementById("btn-generate-pairing-link")?.addEventListener("click", () => { generatePairingLink(); });
  document.getElementById("btn-save-rules")?.addEventListener("click", () => { saveRules(); });
  document.getElementById("btn-save-blacklist")?.addEventListener("click", () => { saveBlacklist(); });
  document.getElementById("btn-create-task")?.addEventListener("click", () => { createTask(); });
  document.getElementById("btn-load-subscription")?.addEventListener("click", () => { loadSubscription(); });

  document.getElementById("pair-child-id")?.addEventListener("change", (e) => { syncChildIdFields(e.target.value); });
  document.getElementById("rules-child-id")?.addEventListener("change", (e) => { syncChildIdFields(e.target.value); });
  document.getElementById("task-child-id")?.addEventListener("change", (e) => { syncChildIdFields(e.target.value); });
}

function initFirebase() {
  const config = loadFirebaseConfig();
  if (!config || !config.projectId || String(config.projectId).includes("your-")) {
    setStatus("auth-status", "Firebase-Konfiguration fehlt. Bitte zuerst auf der Startseite konfigurieren.", "error");
    return;
  }
  app = firebase.initializeApp(config, "parent-onboarding-wizard");
  if (!ensureAppCheckConfigured(app, "auth-status")) {
    // App Check fehlt: Anmeldung kann angezeigt werden, Callables erst spaeter.
  }
  db = firebase.firestore(app);
  functions = firebase.app("parent-onboarding-wizard").functions("europe-west1");
  auth = firebase.app("parent-onboarding-wizard").auth();

  auth.onAuthStateChanged((user) => {
    applyAuthState(user);
    if (user) {
      // Fortschritt erst nach Anmeldung laden (Callables benoetigen Auth).
      loadSavedProgress();
    }
  });
}

bindUiActions();
showStep(0);
renderProgress();
updateNavButtons();
initFirebase();
