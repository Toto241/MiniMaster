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

  document.getElementById('btn-grant-support').addEventListener('click', async () => {
    await grantSupportAccess();
  });
  document.getElementById('btn-revoke-support').addEventListener('click', async () => {
    await revokeSupportAccess();
  });
  document.getElementById('btn-grant-debug').addEventListener('click', async () => {
    await grantDebugAccess();
  });
  document.getElementById('btn-analyze-debug').addEventListener('click', async () => {
    await analyzeWithDebugData();
  });
}

/**
 * Grants support access via backend API.
 */
async function grantSupportAccess() {
  updateResult('Support-Zugriff wird angefordert...');
  try {
    const response = await fetch('/api/support/grant', { method: 'POST' });
    if (!response.ok) throw new Error('Fehler beim Gewähren');
    updateResult('Support-Zugriff gewährt.');
  } catch (error) {
    updateResult('Fehler: ' + error.message);
  }
}

/**
 * Revokes support access via backend API.
 */
async function revokeSupportAccess() {
  updateResult('Support-Zugriff wird entzogen...');
  try {
    const response = await fetch('/api/support/revoke', { method: 'POST' });
    if (!response.ok) throw new Error('Fehler beim Entziehen');
    updateResult('Support-Zugriff entzogen.');
  } catch (error) {
    updateResult('Fehler: ' + error.message);
  }
}

/**
 * Grants debug access via backend API.
 */
async function grantDebugAccess() {
  updateResult('Debug-Zugriff wird angefordert...');
  try {
    const response = await fetch('/api/debug/grant', { method: 'POST' });
    if (!response.ok) throw new Error('Fehler beim Gewähren');
    updateResult('Debug-Zugriff gewährt.');
  } catch (error) {
    updateResult('Fehler: ' + error.message);
  }
}

/**
 * Sends debug data for analysis via backend API.
 */
async function analyzeWithDebugData() {
  updateResult('Debug-Analyse wird gestartet...');
  try {
    const response = await fetch('/api/debug/analyze', { method: 'POST' });
    if (!response.ok) throw new Error('Fehler bei Analyse');
    const data = await response.json();
    updateResult('Analyse abgeschlossen: ' + JSON.stringify(data));
  } catch (error) {
    updateResult('Fehler: ' + error.message);
  }
}

/**
 * Updates the result area with a message.
 * @param {string} message
 */
function updateResult(message) {
  const resultElement = document.getElementById('support-result');
  if (resultElement) {
    resultElement.textContent = message;
  }
}