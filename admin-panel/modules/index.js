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
