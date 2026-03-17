const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");

// Operator-Preload: Erweiterte Bridge mit CLI-Ausführung für das Operator Dashboard.
// Diese Preload-Datei wird NUR für das Operator-Fenster geladen.

contextBridge.exposeInMainWorld("miniMasterDesktop", {
  parentPanelPath: path.join(__dirname, "..", "web-control", "index.html"),
  adminPanelPath: path.join(__dirname, "..", "admin-panel", "index.html"),
  isOperatorContext: true,

  /**
   * Führt einen erlaubten CLI-Befehl aus und gibt stdout+stderr als String zurück.
   * @param {string} command - Der Befehl (z.B. "firebase deploy --only functions")
   * @param {string} cwd - Arbeitsverzeichnis
   * @returns {Promise<{code: number, output: string}>}
   */
  runCLI: (command, cwd) => ipcRenderer.invoke("run-cli", command, cwd),

  /**
   * Registriert einen Callback für Live-Ausgaben laufender CLI-Prozesse.
   * @param {function} callback - Empfängt {stream: "stdout"|"stderr", data: string, commandId: string}
   * @returns {function} cleanup – Entfernt den Listener
   */
  onCLIOutput: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("cli-output", handler);
    return () => ipcRenderer.removeListener("cli-output", handler);
  },

  /**
   * Bricht einen laufenden CLI-Prozess ab.
   * @param {string} commandId
   */
  abortCLI: (commandId) => ipcRenderer.invoke("abort-cli", commandId),
});
