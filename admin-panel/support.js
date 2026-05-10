/**
 * Displays the support panel UI and wires up event handlers.
 * @param {HTMLElement} container
 */
export function showSupportPanel(container) {
  container.innerHTML = `
    <h2>Support & Debugging</h2>
    <div class="support-actions">
      <button id="btn-grant-support">Support-Zugriff gewähren</button>
      <button id="btn-revoke-support">Support-Zugriff entziehen</button>
      <button id="btn-grant-debug">Debug-Zugriff gewähren</button>
      <button id="btn-analyze-debug">Analyse mit Debug-Daten</button>
    </div>
    <div id="support-result" class="support-result"></div>
  `;

  const actions = [
    { id: "btn-grant-support",  endpoint: "/api/support/grant",  pending: "Support-Zugriff wird angefordert...", success: "Support-Zugriff gewährt." },
    { id: "btn-revoke-support", endpoint: "/api/support/revoke", pending: "Support-Zugriff wird entzogen...",    success: "Support-Zugriff entzogen." },
    { id: "btn-grant-debug",    endpoint: "/api/debug/grant",    pending: "Debug-Zugriff wird angefordert...",   success: "Debug-Zugriff gewährt." },
    { id: "btn-analyze-debug",  endpoint: "/api/debug/analyze",  pending: "Debug-Analyse wird gestartet...",     parseJson: true },
  ];

  for (const action of actions) {
    const btn = document.getElementById(action.id);
    if (!btn) continue;
    btn.addEventListener("click", () => callBackend(action));
  }
}

async function callBackend({ endpoint, pending, success, parseJson }) {
  updateResult(pending);
  try {
    const response = await fetch(endpoint, { method: "POST" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    if (parseJson) {
      const data = await response.json();
      updateResult("Analyse abgeschlossen: " + JSON.stringify(data));
    } else {
      updateResult(success);
    }
  } catch (error) {
    updateResult("Fehler: " + error.message);
  }
}

function updateResult(message) {
  const resultElement = document.getElementById("support-result");
  if (resultElement) {
    resultElement.textContent = message;
  }
}
