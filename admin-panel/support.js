/**
 * Displays the support panel UI and wires up event handlers.
 * Callable names align with Firebase Functions: grantSupportAccess,
 * revokeSupportAccess, grantDebugAccess, analyzeWithDebugData.
 * @param {HTMLElement} container
 */
export function showSupportPanel(container) {
  container.innerHTML = `
    <h2>Support & Debugging</h2>
    <div class="support-actions">
      <button id="btn-grant-support" title="grantSupportAccess">Support-Zugriff gewähren</button>
      <button id="btn-revoke-support" title="revokeSupportAccess">Support-Zugriff entziehen</button>
      <button id="btn-grant-debug" title="grantDebugAccess">Debug-Zugriff gewähren</button>
      <button id="btn-analyze-debug" title="analyzeWithDebugData">Analyse mit Debug-Daten</button>
    </div>
    <div id="support-result" class="support-result"></div>
  `;

  const actions = [
    { id: "btn-grant-support", callable: "grantSupportAccess", pending: "grantSupportAccess wird angefordert...", success: "grantSupportAccess abgeschlossen." },
    { id: "btn-revoke-support", callable: "revokeSupportAccess", pending: "revokeSupportAccess wird ausgeführt...", success: "revokeSupportAccess abgeschlossen." },
    { id: "btn-grant-debug", callable: "grantDebugAccess", pending: "grantDebugAccess wird angefordert...", success: "grantDebugAccess abgeschlossen." },
    { id: "btn-analyze-debug", callable: "analyzeWithDebugData", pending: "analyzeWithDebugData läuft...", parseJson: true },
  ];

  for (const action of actions) {
    const btn = document.getElementById(action.id);
    if (!btn) continue;
    btn.addEventListener("click", () => callSupportCallable(action));
  }
}

async function callSupportCallable({ callable, pending, success, parseJson }) {
  updateResult(pending);
  try {
    const functionsApi = window.firebase?.functions?.();
    if (!functionsApi || typeof functionsApi.httpsCallable !== "function") {
      throw new Error("Firebase Functions nicht initialisiert.");
    }
    const fn = functionsApi.httpsCallable(callable);
    const response = await fn({});
    if (parseJson) {
      updateResult(`${callable} abgeschlossen: ` + JSON.stringify(response?.data || {}));
    } else {
      updateResult(success);
    }
  } catch (error) {
    updateResult(`${callable} Fehler: ` + error.message);
  }
}

function updateResult(message) {
  const resultElement = document.getElementById("support-result");
  if (resultElement) {
    resultElement.textContent = message;
  }
}
