// Operator session idle timeout, tier tracking, and re-auth prompts (AP-N3 Phase 1–3).
import { register } from "./registry.js";

const SESSION_CONFIG = {
  T1_IDLE_MINUTES: 15,
  T2_MAX_HOURS: 8,
  T3_MAX_HOURS: 2,
  T4_MAX_MINUTES: 30,
  WARNING_MINUTES_BEFORE: 5,
};

const TIER_MAX_MINUTES = {
  T1: SESSION_CONFIG.T1_IDLE_MINUTES,
  T2: SESSION_CONFIG.T2_MAX_HOURS * 60,
  T3: SESSION_CONFIG.T3_MAX_HOURS * 60,
  T4: SESSION_CONFIG.T4_MAX_MINUTES,
};

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"];

class SessionManager {
  constructor() {
    this.lastActivityAt = Date.now();
    this.loggedInAt = null;
    this.currentTier = "T2";
    this.tierGrantedAt = null;
    this.warningShown = false;
    this.monitoringActive = false;
    this.idleCheckInterval = null;
    this.onLogout = null;
    this.onNotify = null;
    this.verifyAdminPin = null;
    this.isAdminPinConfigured = null;
    this.hasFreshAdminVerification = null;
    this._activityHandler = () => this.recordActivity();
  }

  configure({
    onLogout,
    onNotify,
    verifyAdminPin,
    isAdminPinConfigured,
    hasFreshAdminVerification,
  } = {}) {
    if (typeof onLogout === "function") this.onLogout = onLogout;
    if (typeof onNotify === "function") this.onNotify = onNotify;
    if (typeof verifyAdminPin === "function") this.verifyAdminPin = verifyAdminPin;
    if (typeof isAdminPinConfigured === "function") this.isAdminPinConfigured = isAdminPinConfigured;
    if (typeof hasFreshAdminVerification === "function") {
      this.hasFreshAdminVerification = hasFreshAdminVerification;
    }
  }

  markLoggedIn() {
    this.loggedInAt = Date.now();
    this.currentTier = "T2";
    this.tierGrantedAt = Date.now();
    this.recordActivity();
  }

  start() {
    if (this.monitoringActive) {
      this.recordActivity();
      return;
    }
    ACTIVITY_EVENTS.forEach((evt) => {
      document.addEventListener(evt, this._activityHandler, { passive: true });
    });
    this.monitoringActive = true;
    this.idleCheckInterval = window.setInterval(() => this.checkIdle(), 60000);
    this.recordActivity();
  }

  stop() {
    if (this.monitoringActive) {
      ACTIVITY_EVENTS.forEach((evt) => {
        document.removeEventListener(evt, this._activityHandler);
      });
      this.monitoringActive = false;
    }
    if (this.idleCheckInterval) {
      window.clearInterval(this.idleCheckInterval);
      this.idleCheckInterval = null;
    }
    this.warningShown = false;
    this.loggedInAt = null;
    this.hideBanner();
  }

  recordActivity() {
    this.lastActivityAt = Date.now();
    this.warningShown = false;
    this.hideBanner();
  }

  getIdleMinutes() {
    return (Date.now() - this.lastActivityAt) / 60000;
  }

  getSessionAgeMinutes() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    const authTime = user && user.metadata && user.metadata.lastSignInTime
      ? new Date(user.metadata.lastSignInTime).getTime()
      : this.loggedInAt;
    if (!authTime) return 0;
    return (Date.now() - authTime) / 60000;
  }

  getTierMaxMinutes(tier = this.currentTier) {
    return TIER_MAX_MINUTES[tier] || TIER_MAX_MINUTES.T2;
  }

  checkIdle() {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user) return;

    const idleMinutes = this.getIdleMinutes();
    if (idleMinutes >= SESSION_CONFIG.T1_IDLE_MINUTES) {
      this.notify("Session abgelaufen — bitte neu anmelden.", "error");
      this.logout();
      return;
    }

    const sessionAgeMinutes = this.getSessionAgeMinutes();
    if (sessionAgeMinutes >= TIER_MAX_MINUTES.T2) {
      this.notify("Session abgelaufen — 8-Stunden-Limit erreicht.", "error");
      this.logout();
      return;
    }

    const warningThreshold = this.getTierMaxMinutes() - SESSION_CONFIG.WARNING_MINUTES_BEFORE;
    if (sessionAgeMinutes >= warningThreshold && !this.warningShown) {
      const remaining = Math.max(1, Math.ceil(this.getTierMaxMinutes() - sessionAgeMinutes));
      this.showBanner(`Ihre Sitzung läuft in ca. ${remaining} Minute(n) ab. Bitte erneut anmelden oder aktiv bleiben.`, "warning");
      this.warningShown = true;
    }
  }

  async ensureTier(targetTier) {
    const sessionAgeMinutes = this.getSessionAgeMinutes();
    const maxMinutes = TIER_MAX_MINUTES[targetTier] || TIER_MAX_MINUTES.T2;
    if (sessionAgeMinutes > maxMinutes) {
      this.notify(`Session zu alt für ${targetTier}-Aktionen. Bitte neu anmelden.`, "error");
      return false;
    }

    if (targetTier === "T3" || targetTier === "T4") {
      const promoted = await this.promoteToTier(targetTier);
      if (!promoted) {
        this.notify("Re-Authentifizierung abgebrochen oder fehlgeschlagen.", "warning");
      }
      return promoted;
    }

    if (this._tierRank(this.currentTier) >= this._tierRank(targetTier)) {
      return true;
    }

    const promoted = await this.promoteToTier(targetTier);
    if (!promoted) {
      this.notify("Re-Authentifizierung abgebrochen oder fehlgeschlagen.", "warning");
    }
    return promoted;
  }

  async promoteToTier(targetTier) {
    const user = typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null;
    if (!user || !user.email) {
      this.notify("Re-Auth erfordert ein E-Mail-Konto.", "error");
      return false;
    }

    const password = await this.promptForPassword(
      targetTier === "T4"
        ? "Kritische Aktion — Passwort zur Bestätigung eingeben:"
        : "Privilegierte Aktion — Passwort zur Bestätigung eingeben:"
    );
    if (!password) return false;

    try {
      const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
      await user.reauthenticateWithCredential(credential);
    } catch (error) {
      this.notify(`Re-Auth fehlgeschlagen: ${error.message || error}`, "error");
      return false;
    }

    if (targetTier === "T4") {
      const pinRequired = await this._isAdminPinRequired();
      if (pinRequired) {
        const fresh = await this._hasFreshAdminVerification();
        if (!fresh) {
          const pinOk = await this._confirmAdminPin();
          if (!pinOk) return false;
        }
      }
    }

    this.currentTier = targetTier;
    this.tierGrantedAt = Date.now();
    this.recordActivity();
    return true;
  }

  async _isAdminPinRequired() {
    if (typeof this.isAdminPinConfigured === "function") {
      try {
        return await this.isAdminPinConfigured();
      } catch (_error) {
        return false;
      }
    }
    return false;
  }

  async _hasFreshAdminVerification() {
    if (typeof this.hasFreshAdminVerification === "function") {
      try {
        return await this.hasFreshAdminVerification();
      } catch (_error) {
        return false;
      }
    }
    return false;
  }

  async _confirmAdminPin() {
    if (typeof this.verifyAdminPin !== "function") {
      this.notify("Admin-PIN-Verifikation ist nicht konfiguriert.", "error");
      return false;
    }

    const pin = await this.promptForAdminPin();
    if (!pin) return false;

    try {
      await this.verifyAdminPin(pin);
      return true;
    } catch (error) {
      this.notify(`Admin-PIN ungültig: ${error.message || error}`, "error");
      return false;
    }
  }

  promptForPassword(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "session-reauth-overlay";
      overlay.innerHTML = `
        <div class="session-reauth-modal" role="dialog" aria-modal="true">
          <h3>Sitzung bestätigen</h3>
          <p>${message}</p>
          <input type="password" id="session-reauth-password" autocomplete="current-password" />
          <div class="setup-actions">
            <button type="button" class="btn btn-secondary" data-reauth-action="cancel">Abbrechen</button>
            <button type="button" class="btn btn-primary" data-reauth-action="confirm">Bestätigen</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const input = overlay.querySelector("#session-reauth-password");
      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay.querySelector('[data-reauth-action="cancel"]').addEventListener("click", () => cleanup(null));
      overlay.querySelector('[data-reauth-action="confirm"]').addEventListener("click", () => {
        cleanup(input.value || null);
      });
      input.focus();
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") cleanup(input.value || null);
        if (event.key === "Escape") cleanup(null);
      });
    });
  }

  promptForAdminPin() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "session-reauth-overlay";
      overlay.innerHTML = `
        <div class="session-reauth-modal" role="dialog" aria-modal="true">
          <h3>Admin-PIN bestätigen</h3>
          <p>Kritische Aktion — bitte die Operator-Admin-PIN eingeben (6–8 Ziffern).</p>
          <input type="password" id="session-admin-pin" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="8" />
          <div class="setup-actions">
            <button type="button" class="btn btn-secondary" data-pin-action="cancel">Abbrechen</button>
            <button type="button" class="btn btn-primary" data-pin-action="confirm">Bestätigen</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      const input = overlay.querySelector("#session-admin-pin");
      const cleanup = (value) => {
        overlay.remove();
        resolve(value);
      };
      overlay.querySelector('[data-pin-action="cancel"]').addEventListener("click", () => cleanup(null));
      overlay.querySelector('[data-pin-action="confirm"]').addEventListener("click", () => {
        cleanup(input.value || null);
      });
      input.focus();
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") cleanup(input.value || null);
        if (event.key === "Escape") cleanup(null);
      });
    });
  }

  showBanner(message, level = "warning") {
    let banner = document.getElementById("session-expiry-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "session-expiry-banner";
      banner.className = "session-expiry-banner";
      document.body.prepend(banner);
    }
    banner.className = `session-expiry-banner session-expiry-banner--${level}`;
    banner.textContent = message;
    banner.hidden = false;
  }

  hideBanner() {
    const banner = document.getElementById("session-expiry-banner");
    if (banner) banner.hidden = true;
  }

  notify(message, type = "info") {
    if (typeof this.onNotify === "function") {
      this.onNotify(message, type);
      return;
    }
    if (typeof console !== "undefined") console.info(`[session-manager] ${message}`);
  }

  logout() {
    this.stop();
    if (typeof this.onLogout === "function") {
      this.onLogout();
    }
  }

  _tierRank(tier) {
    return { T1: 1, T2: 2, T3: 3, T4: 4 }[tier] || 2;
  }
}

const sessionManager = new SessionManager();
register("sessionManager", sessionManager);
export default sessionManager;
