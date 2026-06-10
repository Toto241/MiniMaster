/**
 * Debug utilities panel for the lightweight admin entry (`simple.html`).
 * Surfaces operator diagnostics without loading the full dashboard.
 */
export function showDebugPanel(container) {
  const crypto = typeof window !== "undefined" && window.MM && window.MM.cryptoDebug
    ? window.MM.cryptoDebug
    : null;

  const firebaseReady = typeof firebase !== "undefined" && firebase.apps && firebase.apps.length > 0;
  const authUser = firebaseReady && firebase.auth && firebase.auth().currentUser
    ? firebase.auth().currentUser.email || firebase.auth().currentUser.uid
    : null;

  const samplePayload = {
    panel: "simple-debug",
    firebaseReady,
    authUser,
    modules: typeof window !== "undefined" && window.MM && typeof window.MM.list === "function"
      ? window.MM.list()
      : [],
  };

  const pretty = crypto && typeof crypto.safeDebugStringify === "function"
    ? crypto.safeDebugStringify(samplePayload)
    : JSON.stringify(samplePayload, null, 2);

  container.innerHTML = `
    <h2>Debug &amp; Diagnose</h2>
    <p class="muted">Kompakte Diagnose für Support- und Setup-Szenarien. Für vollständige QA-, Setup- und Release-Tools bitte das vollständige Operator-Dashboard (<code>index.html</code>) verwenden.</p>
    <div class="setup-card">
      <h3>Laufzeitstatus</h3>
      <ul>
        <li>Firebase initialisiert: <strong>${firebaseReady ? "ja" : "nein"}</strong></li>
        <li>Angemeldeter Operator: <strong>${authUser || "—"}</strong></li>
        <li>Geladene Module: <strong>${samplePayload.modules.length}</strong></li>
      </ul>
    </div>
    <div class="setup-card">
      <h3>Diagnose-Snapshot</h3>
      <pre class="debug-json">${escapeHtml(pretty)}</pre>
      <div class="setup-actions">
        <button type="button" id="btn-copy-debug-json" class="btn btn-secondary">Snapshot kopieren</button>
        <a class="btn btn-primary" href="index.html#setup">Zum Setup-Tab</a>
        <a class="btn btn-secondary" href="index.html#qa">Zum QA-Tab</a>
      </div>
    </div>
    <div class="setup-card">
      <h3>Empfohlene Nächste Schritte</h3>
      <ol>
        <li>Im Setup-Tab <strong>Full Validation</strong> ausführen.</li>
        <li>Bei Geräteproblemen den QA-Reiter → USB-/Commissioning-Lauf starten.</li>
        <li>Bei Auth-Problemen Legacy-Auth-Monitor im Compliance-Tab prüfen.</li>
      </ol>
    </div>
  `;

  const copyBtn = container.querySelector("#btn-copy-debug-json");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pretty);
        copyBtn.textContent = "Kopiert";
      } catch (error) {
        copyBtn.textContent = "Kopieren fehlgeschlagen";
      }
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
