var FIREBASE_STORAGE_KEY = "operatorFirebaseConfigOverride";
    var FIREBASE_FIELDS = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
    var FIREBASE_FIELD_IDS = ["fb-apiKey", "fb-authDomain", "fb-projectId", "fb-storageBucket", "fb-messagingSenderId", "fb-appId"];

    function getStoredFirebaseConfig() {
      try {
        var raw = localStorage.getItem(FIREBASE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function isValidFirebaseConfig(config) {
      if (!config || typeof config !== "object") return false;
      for (var i = 0; i < FIREBASE_FIELDS.length; i++) {
        var field = FIREBASE_FIELDS[i];
        var value = config[field];
        if (typeof value !== "string" || !value.trim() || value.indexOf("your-") !== -1) {
          return false;
        }
      }
      return true;
    }

    function setModalStatus(message, type) {
      var statusEl = document.getElementById("fb-status");
      statusEl.textContent = message;
      statusEl.className = type ? "modal-status " + type : "modal-status";
    }

    function populateFirebaseModal(config) {
      for (var i = 0; i < FIREBASE_FIELDS.length; i++) {
        var fieldName = FIREBASE_FIELDS[i];
        var input = document.getElementById(FIREBASE_FIELD_IDS[i]);
        input.value = config && config[fieldName] ? config[fieldName] : "";
      }
    }

    function renderConfigStatus() {
      var config = getStoredFirebaseConfig();
      var ready = isValidFirebaseConfig(config);
      var projectId = ready ? config.projectId : "Nicht konfiguriert";
      var statusText = ready ? "Vollständige Web-Konfiguration erkannt" : "Konfiguration fehlt oder enthält Platzhalter";
      var nextStep = ready ? "Panels öffnen und End-to-End prüfen" : "Firebase-Werte aus Console übernehmen";
      var pill = document.getElementById("config-status-pill");
      var infoBar = document.getElementById("info-bar-text");

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
      var config = {};
      for (var i = 0; i < FIREBASE_FIELDS.length; i++) {
        var input = document.getElementById(FIREBASE_FIELD_IDS[i]);
        var value = input.value.trim();
        if (!value || value.indexOf("your-") !== -1) {
          input.focus();
          throw new Error("Bitte alle Felder vollständig und ohne Platzhalter ausfüllen.");
        }
        config[FIREBASE_FIELDS[i]] = value;
      }
      return config;
    }

    function saveFirebaseConfig() {
      try {
        var config = collectFirebaseConfigFromInputs();
        localStorage.setItem(FIREBASE_STORAGE_KEY, JSON.stringify(config));
        setModalStatus("✅ Firebase-Konfiguration gespeichert. Admin-Dashboard und Eltern-Panel verwenden diese Werte beim nächsten Laden.", "success");
        renderConfigStatus();
        setTimeout(closeFirebaseModal, 2200);
      } catch (e) {
        setModalStatus(e.message || "Fehler beim Speichern der Firebase-Konfiguration.", "error");
      }
    }

    function normalizeBasePath(pathname) {
      return decodeURIComponent(String(pathname || "").replace(/\/[^/]*$/, "").replace(/^\//, "")).replace(/\//g, "\\");
    }

    function buildFullPath(relativePath, pathname) {
      var basePath = normalizeBasePath(pathname || location.pathname);
      return (basePath ? basePath + "\\" : "") + relativePath;
    }

    function copyPath(elementId) {
      var codeEl = document.getElementById(elementId);
      var relativePath = codeEl.textContent;
      var fullPath = buildFullPath(relativePath, location.pathname);
      var btn = codeEl.nextElementSibling;

      function markCopied() {
        btn.textContent = "✅ Kopiert!";
        btn.classList.add("copied");
        setTimeout(function () {
          btn.textContent = "📋 Kopieren";
          btn.classList.remove("copied");
        }, 1500);
      }

      return navigator.clipboard.writeText(fullPath).then(function () {
        markCopied();
      }).catch(function () {
        var ta = document.createElement("textarea");
        ta.value = fullPath;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        markCopied();
      });
    }

    document.getElementById("fb-modal").addEventListener("click", function (e) {
      if (e.target === this) closeFirebaseModal();
    });

    renderConfigStatus();

// Initialize event listeners for UI actions
function bindStartPageUiActions() {
    const bindClick = (id, handler) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", (e) => {
            handler(e);
        });
    };

    // Firebase modal controls
    bindClick("open-firebase-modal-btn-1", () => openFirebaseModal());
    bindClick("open-firebase-modal-btn-2", () => openFirebaseModal());
    bindClick("copy-master-apk-path-btn", () => copyPath("master-apk-path"));
    bindClick("copy-child-apk-path-btn", () => copyPath("child-apk-path"));
    bindClick("close-firebase-modal-btn", () => closeFirebaseModal());
    bindClick("save-firebase-config-btn", () => saveFirebaseConfig());
}

// Attach event listeners when DOM is ready
document.addEventListener("DOMContentLoaded", bindStartPageUiActions);
