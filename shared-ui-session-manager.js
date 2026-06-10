(function (global) {
  "use strict";

  var SESSION_CONFIG = {
    T1_IDLE_MINUTES: 15,
    T2_MAX_HOURS: 8,
    WARNING_MINUTES_BEFORE: 5,
  };

  var T2_MAX_MINUTES = SESSION_CONFIG.T2_MAX_HOURS * 60;
  var ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"];

  function MasterSessionManager(options) {
    this.lastActivityAt = Date.now();
    this.loggedInAt = null;
    this.warningShown = false;
    this.monitoringActive = false;
    this.idleCheckInterval = null;
    this.onLogout = options && typeof options.onLogout === "function" ? options.onLogout : null;
    this.onNotify = options && typeof options.onNotify === "function" ? options.onNotify : null;
    this.isActive = options && typeof options.isActive === "function" ? options.isActive : function () { return true; };
    this._activityHandler = this.recordActivity.bind(this);
  }

  MasterSessionManager.prototype.configure = function (options) {
    options = options || {};
    if (typeof options.onLogout === "function") this.onLogout = options.onLogout;
    if (typeof options.onNotify === "function") this.onNotify = options.onNotify;
    if (typeof options.isActive === "function") this.isActive = options.isActive;
  };

  MasterSessionManager.prototype.markLoggedIn = function () {
    this.loggedInAt = Date.now();
    this.recordActivity();
  };

  MasterSessionManager.prototype.start = function () {
    if (this.monitoringActive) {
      this.recordActivity();
      return;
    }
    ACTIVITY_EVENTS.forEach((evt) => {
      document.addEventListener(evt, this._activityHandler, { passive: true });
    });
    this.monitoringActive = true;
    this.idleCheckInterval = global.setInterval(this.checkIdle.bind(this), 60000);
    this.recordActivity();
  };

  MasterSessionManager.prototype.stop = function () {
    if (this.monitoringActive) {
      ACTIVITY_EVENTS.forEach((evt) => {
        document.removeEventListener(evt, this._activityHandler);
      });
      this.monitoringActive = false;
    }
    if (this.idleCheckInterval) {
      global.clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    this.warningShown = false;
    this.loggedInAt = null;
    this.hideBanner();
  };

  MasterSessionManager.prototype.recordActivity = function () {
    this.lastActivityAt = Date.now();
    this.warningShown = false;
    this.hideBanner();
  };

  MasterSessionManager.prototype.getIdleMinutes = function () {
    return (Date.now() - this.lastActivityAt) / 60000;
  };

  MasterSessionManager.prototype.getSessionAgeMinutes = function () {
    var authTime = this.loggedInAt;
    if (typeof firebase !== "undefined" && firebase.auth) {
      var user = firebase.auth().currentUser;
      if (user && user.metadata && user.metadata.lastSignInTime) {
        authTime = new Date(user.metadata.lastSignInTime).getTime();
      }
    }
    if (!authTime) return 0;
    return (Date.now() - authTime) / 60000;
  };

  MasterSessionManager.prototype.checkIdle = function () {
    if (!this.isActive()) return;

    var idleMinutes = this.getIdleMinutes();
    if (idleMinutes >= SESSION_CONFIG.T1_IDLE_MINUTES) {
      this.notify("Session abgelaufen — bitte neu anmelden.", "error");
      this.showBanner("Session abgelaufen — bitte neu anmelden.", "error");
      this.logout();
      return;
    }

    var sessionAgeMinutes = this.getSessionAgeMinutes();
    if (sessionAgeMinutes >= T2_MAX_MINUTES) {
      this.notify("Session abgelaufen — 8-Stunden-Limit erreicht.", "error");
      this.showBanner("Session abgelaufen — 8-Stunden-Limit erreicht.", "error");
      this.logout();
      return;
    }

    var warningThreshold = T2_MAX_MINUTES - SESSION_CONFIG.WARNING_MINUTES_BEFORE;
    if (sessionAgeMinutes >= warningThreshold && !this.warningShown) {
      var remaining = Math.max(1, Math.ceil(T2_MAX_MINUTES - sessionAgeMinutes));
      this.showBanner(
        "Ihre Sitzung läuft in ca. " + remaining + " Minute(n) ab. Bitte aktiv bleiben oder neu anmelden.",
        "warning"
      );
      this.warningShown = true;
    }
  };

  MasterSessionManager.prototype.ensureActiveSession = function () {
    if (!this.isActive()) {
      this.notify("Bitte zuerst anmelden.", "error");
      return false;
    }
    if (this.getIdleMinutes() >= SESSION_CONFIG.T1_IDLE_MINUTES) {
      this.notify("Session abgelaufen — bitte neu anmelden.", "error");
      this.logout();
      return false;
    }
    if (this.getSessionAgeMinutes() >= T2_MAX_MINUTES) {
      this.notify("Session abgelaufen — 8-Stunden-Limit erreicht.", "error");
      this.logout();
      return false;
    }
    this.recordActivity();
    return true;
  };

  MasterSessionManager.prototype.showBanner = function (message, level) {
    var banner = document.getElementById("session-expiry-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "session-expiry-banner";
      banner.className = "session-expiry-banner";
      document.body.prepend(banner);
    }
    banner.className = "session-expiry-banner session-expiry-banner--" + (level || "warning");
    banner.textContent = message;
    banner.hidden = false;
  };

  MasterSessionManager.prototype.hideBanner = function () {
    var banner = document.getElementById("session-expiry-banner");
    if (banner) banner.hidden = true;
  };

  MasterSessionManager.prototype.notify = function (message, type) {
    if (typeof this.onNotify === "function") {
      this.onNotify(message, type || "info");
      return;
    }
    if (typeof console !== "undefined") console.info("[session-manager]", message);
  };

  MasterSessionManager.prototype.logout = function () {
    this.stop();
    if (typeof this.onLogout === "function") {
      this.onLogout();
    }
  };

  global.MiniMasterSessionManager = MasterSessionManager;
})(typeof window !== "undefined" ? window : globalThis);
