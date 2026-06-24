/*
 * MiniMaster — Kind-Geräte-Pairing & Berechtigungen Wizard.
 *
 * Geführter Assistent für das Kind-Gerät: anonyme Anmeldung, Kopplung an ein
 * Eltern-Konto (Code oder Pairing-Link/Token), informative Berechtigungs-
 * Übersicht und Fortschritts-Persistierung über Cloud Functions.
 *
 * CSP: Keine Inline-Handler — alle Events werden hier via addEventListener
 * gebunden. Nur die in dieser Suite erlaubten Callables werden verwendet.
 */
(function () {
  "use strict";

  var WIZARD_ID = "child-pairing";
  var APP_NAME = "child-pairing-wizard";
  var FUNCTIONS_REGION = "europe-west1";

  var STEP_IDS = ["step-welcome", "step-signin", "step-pair", "step-permissions", "step-done"];
  var STEP_LABELS = ["Willkommen", "Anmeldung", "Koppeln", "Berechtigungen", "Fertig"];

  var app = null;
  var auth = null;
  var functions = null;
  var appCheckConfigured = false;

  var currentStep = 0;
  var completedSteps = [];
  var wizardStatus = "in_progress";

  var currentUser = null;
  var pairingDone = false;
  var pairingResult = null; // { childId, masterId }
  var progressSaveSupported = true;

  // ---------------------------------------------------------------------------
  // Hilfsfunktionen
  // ---------------------------------------------------------------------------

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(elementId, message, type) {
    var el = byId(elementId);
    if (!el) return;
    el.textContent = message;
    el.classList.remove("success", "error");
    if (type === "success" || type === "error") {
      el.classList.add(type);
    }
  }

  function friendlyError(error) {
    if (!error) return "Unbekannter Fehler.";
    if (typeof error === "string") return error;
    if (error.message) return String(error.message);
    return "Unbekannter Fehler.";
  }

  function markCompleted(stepIndex) {
    if (completedSteps.indexOf(stepIndex) === -1) {
      completedSteps.push(stepIndex);
      completedSteps.sort(function (a, b) { return a - b; });
    }
  }

  // ---------------------------------------------------------------------------
  // Firebase-Initialisierung (mirror parent-panel Pattern)
  // ---------------------------------------------------------------------------

  function getAppCheckSiteKey() {
    if (typeof window !== "undefined" && window.MINIMASTER_APP_CHECK_SITE_KEY) {
      return window.MINIMASTER_APP_CHECK_SITE_KEY;
    }
    return null;
  }

  function ensureAppCheck(appInstance) {
    if (appCheckConfigured) return;
    try {
      var siteKey = getAppCheckSiteKey();
      if (siteKey && typeof firebase.appCheck === "function") {
        firebase.appCheck(appInstance).activate(siteKey, true);
        appCheckConfigured = true;
      }
    } catch (error) {
      console.warn("App Check konnte nicht aktiviert werden:", error);
    }
  }

  function initFirebase() {
    if (typeof firebase === "undefined" || typeof firebase.initializeApp !== "function") {
      setStatus("wizard-progress-status", "Firebase-SDK wurde nicht geladen.", "error");
      return false;
    }

    var config = (typeof window !== "undefined") ? window.__MM_FIREBASE_CONFIG__ : null;
    if (!config || !config.projectId || String(config.projectId).indexOf("your-") !== -1) {
      setStatus(
        "wizard-progress-status",
        "Firebase-Konfiguration fehlt. Bitte zuerst auf der Startseite konfigurieren.",
        "error"
      );
      return false;
    }

    try {
      app = firebase.initializeApp(config, APP_NAME);
    } catch (error) {
      // Falls die App bereits existiert, vorhandene Instanz verwenden.
      try {
        app = firebase.app(APP_NAME);
      } catch (innerError) {
        setStatus("wizard-progress-status", "Firebase konnte nicht initialisiert werden: " + friendlyError(innerError), "error");
        return false;
      }
    }

    ensureAppCheck(app);

    try {
      auth = firebase.app(APP_NAME).auth();
      functions = firebase.app(APP_NAME).functions(FUNCTIONS_REGION);
    } catch (error) {
      setStatus("wizard-progress-status", "Firebase-Dienste konnten nicht geladen werden: " + friendlyError(error), "error");
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Wizard-Navigation & Fortschrittsanzeige
  // ---------------------------------------------------------------------------

  function renderStepPills() {
    var container = byId("wizard-steps");
    if (!container) return;
    container.textContent = "";
    for (var i = 0; i < STEP_LABELS.length; i++) {
      var pill = document.createElement("div");
      pill.className = "step-pill";
      if (i === currentStep) {
        pill.className += " active";
      } else if (completedSteps.indexOf(i) !== -1) {
        pill.className += " done";
      }
      pill.textContent = (i + 1) + ". " + STEP_LABELS[i];
      container.appendChild(pill);
    }
    var fill = byId("progress-fill");
    if (fill) {
      var pct = Math.round((currentStep / (STEP_LABELS.length - 1)) * 100);
      fill.style.inlineSize = pct + "%";
    }
  }

  function showStep(index) {
    if (index < 0) index = 0;
    if (index > STEP_IDS.length - 1) index = STEP_IDS.length - 1;
    currentStep = index;

    for (var i = 0; i < STEP_IDS.length; i++) {
      var sectionEl = byId(STEP_IDS[i]);
      if (!sectionEl) continue;
      if (i === index) {
        sectionEl.classList.add("active");
      } else {
        sectionEl.classList.remove("active");
      }
    }

    updateNavButtons();
    renderStepPills();

    if (index === STEP_IDS.length - 1) {
      renderSummary();
    }
  }

  function updateNavButtons() {
    var backBtn = byId("wizard-back-btn");
    var nextBtn = byId("wizard-next-btn");
    if (backBtn) {
      backBtn.disabled = currentStep === 0;
    }
    if (nextBtn) {
      if (currentStep === STEP_IDS.length - 1) {
        nextBtn.disabled = true;
        nextBtn.textContent = "Fertig";
      } else {
        nextBtn.disabled = !canAdvance(currentStep);
        nextBtn.textContent = "Weiter";
      }
    }
  }

  function canAdvance(stepIndex) {
    // Schritt 2 (Anmeldung): erst weiter, wenn angemeldet.
    if (stepIndex === 1) {
      return Boolean(currentUser);
    }
    // Schritt 3 (Koppeln): erst weiter, wenn Kopplung erfolgreich.
    if (stepIndex === 2) {
      return pairingDone;
    }
    return true;
  }

  function goNext() {
    if (currentStep >= STEP_IDS.length - 1) return;
    if (!canAdvance(currentStep)) {
      updateNavButtons();
      return;
    }
    markCompleted(currentStep);
    var target = currentStep + 1;
    if (target === STEP_IDS.length - 1) {
      wizardStatus = "completed";
      markCompleted(target);
    }
    showStep(target);
    saveProgress();
  }

  function goBack() {
    if (currentStep <= 0) return;
    showStep(currentStep - 1);
    saveProgress();
  }

  // ---------------------------------------------------------------------------
  // Fortschritts-Persistierung (nur nach Anmeldung; blockiert nie)
  // ---------------------------------------------------------------------------

  function saveProgress() {
    if (!functions || !currentUser || !progressSaveSupported) return;
    try {
      var callable = functions.httpsCallable("setWizardProgress");
      callable({
        wizardId: WIZARD_ID,
        currentStep: currentStep,
        completedSteps: completedSteps.slice(),
        status: wizardStatus
      }).catch(function (error) {
        console.warn("Fortschritt konnte nicht gespeichert werden:", error);
      });
    } catch (error) {
      console.warn("Fortschritt konnte nicht gespeichert werden:", error);
    }
  }

  function loadProgress() {
    if (!functions || !currentUser) return Promise.resolve();
    var callable;
    try {
      callable = functions.httpsCallable("getWizardProgress");
    } catch (error) {
      console.warn("Fortschritt konnte nicht geladen werden:", error);
      return Promise.resolve();
    }
    return callable({ wizardId: WIZARD_ID })
      .then(function (res) {
        var data = res && res.data ? res.data : null;
        var progress = data && data.progress ? data.progress : data;
        if (!progress || typeof progress !== "object") return;
        if (Array.isArray(progress.completedSteps)) {
          for (var i = 0; i < progress.completedSteps.length; i++) {
            var v = Number(progress.completedSteps[i]);
            if (!isNaN(v)) markCompleted(v);
          }
        }
        if (progress.status === "completed") {
          wizardStatus = "completed";
        }
        var resumeStep = Number(progress.currentStep);
        // Nicht vor die Anmeldung zurückspringen; mindestens Schritt 2 (Koppeln),
        // sofern bereits weiter fortgeschritten.
        if (!isNaN(resumeStep) && resumeStep > currentStep && resumeStep <= STEP_IDS.length - 1) {
          // Koppeln-Schritt nur überspringen, wenn schon abgeschlossen.
          if (resumeStep > 2 && !pairingDone) {
            showStep(2);
          } else {
            showStep(resumeStep);
          }
        } else {
          renderStepPills();
        }
      })
      .catch(function (error) {
        console.warn("Fortschritt konnte nicht geladen werden:", error);
      });
  }

  // ---------------------------------------------------------------------------
  // Schritt 2: Anmeldung
  // ---------------------------------------------------------------------------

  function startAuth() {
    if (!auth) return;
    setStatus("signin-status", "Anmeldung wird vorbereitet …");

    auth.onAuthStateChanged(function (user) {
      if (user) {
        currentUser = user;
        setStatus("signin-status", "Angemeldet. Geräte-Kennung: " + escapeHtml(user.uid), "success");
        progressSaveSupported = true;
        // Fortschritt erst jetzt laden/speichern (benötigt angemeldeten Nutzer).
        loadProgress().then(function () {
          updateNavButtons();
          saveProgress();
        });
        return;
      }
      currentUser = null;
      signInAnonymously();
    });
  }

  function signInAnonymously() {
    if (!auth) return;
    setStatus("signin-status", "Gerät wird anonym angemeldet …");
    auth.signInAnonymously().catch(function (error) {
      setStatus(
        "signin-status",
        "Anmeldung fehlgeschlagen: " + friendlyError(error) + " — bitte erneut versuchen.",
        "error"
      );
      updateNavButtons();
    });
  }

  // ---------------------------------------------------------------------------
  // Schritt 3: Koppeln
  // ---------------------------------------------------------------------------

  function extractToken(raw) {
    var value = String(raw || "").trim();
    if (!value) return "";
    // Versuche, einen Token-Parameter aus einer URL zu extrahieren.
    if (value.indexOf("http://") === 0 || value.indexOf("https://") === 0) {
      try {
        var url = new URL(value);
        var keys = ["pairingToken", "token", "pairing_token", "pt"];
        for (var i = 0; i < keys.length; i++) {
          var found = url.searchParams.get(keys[i]);
          if (found) return found.trim();
        }
        if (url.hash) {
          var hash = url.hash.replace(/^#/, "");
          var params = new URLSearchParams(hash);
          for (var j = 0; j < keys.length; j++) {
            var hv = params.get(keys[j]);
            if (hv) return hv.trim();
          }
        }
      } catch (error) {
        // Keine gültige URL — als rohen Token behandeln.
      }
    }
    return value;
  }

  function applyPairingSuccess(data) {
    pairingDone = true;
    pairingResult = {
      childId: data && (data.childId || data.childImei || data.child) ? (data.childId || data.childImei || data.child) : (currentUser ? currentUser.uid : null),
      masterId: data && (data.masterId || data.masterImei || data.master) ? (data.masterId || data.masterImei || data.master) : null
    };
    var parts = [];
    if (pairingResult.childId) parts.push("Kind-ID: " + pairingResult.childId);
    if (pairingResult.masterId) parts.push("Eltern-ID: " + pairingResult.masterId);
    var detail = parts.length ? " (" + parts.join(", ") + ")" : "";
    setStatus("pair-status", "Kopplung erfolgreich!" + detail, "success");
    markCompleted(2);
    updateNavButtons();
    renderStepPills();
    saveProgress();
  }

  function validateCode() {
    if (!functions) return;
    var input = byId("pairing-code-input");
    var code = input ? String(input.value || "").trim() : "";
    if (!/^\d{6}$/.test(code)) {
      setStatus("pair-status", "Bitte einen gültigen 6-stelligen Code eingeben.", "error");
      return;
    }
    setStatus("pair-status", "Code wird geprüft …");
    var callable;
    try {
      callable = functions.httpsCallable("validatePairingCode");
    } catch (error) {
      setStatus("pair-status", "Prüfung nicht möglich: " + friendlyError(error), "error");
      return;
    }
    callable({ pairingCode: code })
      .then(function (res) {
        var data = res && res.data ? res.data : {};
        if (data.valid === false) {
          setStatus("pair-status", "Code ist ungültig oder abgelaufen.", "error");
          return;
        }
        setStatus("pair-status", "Code sieht gültig aus. Klicke auf „Koppeln“, um fortzufahren.", "success");
      })
      .catch(function (error) {
        setStatus("pair-status", "Code-Prüfung fehlgeschlagen: " + friendlyError(error), "error");
      });
  }

  function pairWithCode() {
    if (!ensureSignedIn()) return;
    var input = byId("pairing-code-input");
    var code = input ? String(input.value || "").trim() : "";
    if (!/^\d{6}$/.test(code)) {
      setStatus("pair-status", "Bitte einen gültigen 6-stelligen Code eingeben.", "error");
      return;
    }
    setStatus("pair-status", "Kopplung wird durchgeführt …");
    callPair({ pairingCode: code });
  }

  function pairWithLink() {
    if (!ensureSignedIn()) return;
    var input = byId("pairing-link-input");
    var token = extractToken(input ? input.value : "");
    if (!token) {
      setStatus("pair-status", "Bitte einen Pairing-Link oder Token einfügen.", "error");
      return;
    }
    setStatus("pair-status", "Kopplung wird durchgeführt …");
    callPair({ pairingToken: token });
  }

  function ensureSignedIn() {
    if (!currentUser) {
      setStatus("pair-status", "Bitte zuerst die Anmeldung in Schritt 2 abschließen.", "error");
      return false;
    }
    if (!functions) {
      setStatus("pair-status", "Firebase-Dienste sind nicht verfügbar.", "error");
      return false;
    }
    return true;
  }

  function callPair(payload) {
    var callable;
    try {
      callable = functions.httpsCallable("pairAuthenticatedChild");
    } catch (error) {
      setStatus("pair-status", "Kopplung nicht möglich: " + friendlyError(error), "error");
      return;
    }
    callable(payload)
      .then(function (res) {
        var data = res && res.data ? res.data : {};
        if (data.success === false) {
          setStatus("pair-status", "Kopplung fehlgeschlagen: " + escapeHtml(data.message || "Unbekannter Fehler."), "error");
          return;
        }
        applyPairingSuccess(data);
      })
      .catch(function (error) {
        setStatus("pair-status", "Kopplung fehlgeschlagen: " + friendlyError(error), "error");
      });
  }

  // ---------------------------------------------------------------------------
  // Schritt 4: Berechtigungen (rein informativ)
  // ---------------------------------------------------------------------------

  function updatePermissionStatus() {
    var checklist = byId("permission-checklist");
    if (!checklist) return;
    var boxes = checklist.querySelectorAll('input[type="checkbox"]');
    var total = boxes.length;
    var checked = 0;
    for (var i = 0; i < boxes.length; i++) {
      if (boxes[i].checked) checked++;
    }
    if (checked === total && total > 0) {
      setStatus("permission-status", "Alle Punkte bestätigt. Denk daran: erteilt werden sie in der App/den OS-Einstellungen.", "success");
    } else {
      setStatus("permission-status", "Bestätigt: " + checked + " von " + total + " Punkten.");
    }
  }

  // ---------------------------------------------------------------------------
  // Schritt 5: Zusammenfassung
  // ---------------------------------------------------------------------------

  function renderSummary() {
    var list = byId("summary-list");
    if (!list) return;
    list.textContent = "";

    function addItem(html) {
      var li = document.createElement("li");
      li.innerHTML = html;
      list.appendChild(li);
    }

    addItem("<strong>Anmeldung:</strong> " + (currentUser
      ? "Gerät angemeldet (" + escapeHtml(currentUser.uid) + ")"
      : "nicht angemeldet"));

    if (pairingDone) {
      var detail = "gekoppelt";
      if (pairingResult) {
        var bits = [];
        if (pairingResult.childId) bits.push("Kind-ID " + escapeHtml(pairingResult.childId));
        if (pairingResult.masterId) bits.push("Eltern-ID " + escapeHtml(pairingResult.masterId));
        if (bits.length) detail += " — " + bits.join(", ");
      }
      addItem("<strong>Kopplung:</strong> " + detail);
    } else {
      addItem("<strong>Kopplung:</strong> noch nicht abgeschlossen");
    }

    addItem("<strong>Berechtigungen:</strong> in der nativen App / den OS-Einstellungen erteilen " +
      "(Android: Bedienungshilfen + Overlay, iOS: Bildschirmzeit/Family Controls)");
  }

  // ---------------------------------------------------------------------------
  // Event-Bindung
  // ---------------------------------------------------------------------------

  function bindEvents() {
    var nextBtn = byId("wizard-next-btn");
    if (nextBtn) nextBtn.addEventListener("click", goNext);

    var backBtn = byId("wizard-back-btn");
    if (backBtn) backBtn.addEventListener("click", goBack);

    var retryBtn = byId("retry-signin-btn");
    if (retryBtn) retryBtn.addEventListener("click", signInAnonymously);

    var validateBtn = byId("validate-code-btn");
    if (validateBtn) validateBtn.addEventListener("click", validateCode);

    var pairCodeBtn = byId("pair-code-btn");
    if (pairCodeBtn) pairCodeBtn.addEventListener("click", pairWithCode);

    var pairLinkBtn = byId("pair-link-btn");
    if (pairLinkBtn) pairLinkBtn.addEventListener("click", pairWithLink);

    var checklist = byId("permission-checklist");
    if (checklist) {
      var boxes = checklist.querySelectorAll('input[type="checkbox"]');
      for (var i = 0; i < boxes.length; i++) {
        boxes[i].addEventListener("change", updatePermissionStatus);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  function start() {
    bindEvents();
    showStep(0);

    var ready = initFirebase();
    if (!ready) {
      // Wizard bleibt benutzbar (informativ), aber ohne Backend-Funktionen.
      setStatus("signin-status", "Firebase ist nicht verfügbar. Anmeldung/Kopplung nicht möglich.", "error");
      updateNavButtons();
      return;
    }

    setStatus("wizard-progress-status", "Assistent bereit.", "success");
    startAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
