// MiniMaster Admin-Panel – Module Bootstrap (Welle 1 / Top-Down Step 1)
// Wird vor admin-panel/app.js als <script type="module"> geladen.
// Importiert alle Core-Module, die sich selbststaendig auf window.MM registrieren.

import "./core/registry.js";
import "./core/sanitize.js";
import "./core/command.js";
import "./core/format.js";
import "./core/automation-meta.js";
import "./core/encoding.js";
import "./core/error-codes.js";
import "./core/error-codes.js";
import "./core/security.js";
import "./core/firebase-config.js";
import "./core/dates.js";
import "./core/event-delegation.js";
import "./core/crypto-debug.js";
import "./tabs/legal-playstore.js";
import "./tabs/qa-testing-register.js";
import "./tabs/firebase-deployment.js";
import "./tabs/firebase-recovery.js";
import "./tabs/commissioning-pending.js";
import "./tabs/operator-config.js";
import "./tabs/operator-effective.js";
import "./tabs/operator-assistant.js";
import "./tabs/platform-qa-readiness.js";
import "./tabs/effective-platform-state.js";
import "./tabs/commissioning-qa.js";
import "./tabs/python-automation-actions.js";
import "./tabs/testing-register-insights.js";
import "./tabs/testing-register-priorities.js";

// Bootstrap-Marker fuer Diagnostik / kuenftige Smoke-Checks.
if (typeof window !== "undefined" && window.MM) {
  window.MM.bootstrappedAt = Date.now();
  if (typeof console !== "undefined" && typeof console.info === "function") {
    console.info(
      "[MM] Module bootstrap abgeschlossen:",
      window.MM.list().join(", ")
    );
  }
}
