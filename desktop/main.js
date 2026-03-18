const path = require("path");
const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");

// ── Sicherheit: Nur explizit erlaubte CLI-Befehle ──────────────────────
const ALLOWED_COMMANDS = [
  "firebase",
  "npm",
  "npx",
  "node",
  "adb",
];

// Laufende Prozesse pro commandId
const runningProcesses = new Map();

function isCommandAllowed(command) {
  const trimmed = command.trim();
  // Erlaube mehrzeilige Befehle (z.B. "npm install\nnpm test") –
  // jede Zeile muss mit einem erlaubten Programm beginnen.
  const lines = trimmed.split(/\n/).map(l => l.trim()).filter(Boolean);
  return lines.every(line => {
    const first = line.split(/\s/)[0].replace(/\.bat$|\.cmd$|\.exe$/i, "");
    return ALLOWED_COMMANDS.includes(first.toLowerCase());
  });
}

function sanitizeArg(value) {
  // Entfernt Shell-Metazeichen aus einzelnen Argumenten
  return String(value).replace(/[;&|`$(){}[\]!<>]/g, "");
}

// ── IPC: CLI ausführen ─────────────────────────────────────────────────
ipcMain.handle("run-cli", (event, rawCommand, rawCwd) => {
  return new Promise((resolve, reject) => {
    const command = String(rawCommand || "").trim();
    const cwd = sanitizeArg(String(rawCwd || process.cwd()).trim());

    if (!command) {
      return reject(new Error("Kein Befehl angegeben."));
    }
    if (!isCommandAllowed(command)) {
      return reject(new Error(`Befehl nicht erlaubt. Erlaubt: ${ALLOWED_COMMANDS.join(", ")}`));
    }

    const commandId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    let output = "";

    // Mehrzeilige Befehle als Einzel-Skript über Shell ausführen
    const proc = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env },
    });

    runningProcesses.set(commandId, proc);

    proc.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
      event.sender.send("cli-output", { stream: "stdout", data: text, commandId });
    });

    proc.stderr.on("data", (data) => {
      const text = data.toString();
      output += text;
      event.sender.send("cli-output", { stream: "stderr", data: text, commandId });
    });

    proc.on("error", (err) => {
      runningProcesses.delete(commandId);
      reject(new Error(`Prozess-Fehler: ${err.message}`));
    });

    proc.on("close", (code) => {
      runningProcesses.delete(commandId);
      resolve({ code, output, commandId });
    });
  });
});

ipcMain.handle("abort-cli", (_event, commandId) => {
  const proc = runningProcesses.get(commandId);
  if (proc) {
    proc.kill("SIGTERM");
    runningProcesses.delete(commandId);
    return true;
  }
  return false;
});

// ── Fenster: Eltern-Panel ──────────────────────────────────────────────
function createParentWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "launcher.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

// ── Fenster: Operator Dashboard (mit CLI-Bridge) ───────────────────────
function createOperatorWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    title: "MiniMaster Operator Dashboard",
    webPreferences: {
      preload: path.join(__dirname, "operator-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "..", "admin-panel", "index.html"));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

// ── App-Start ──────────────────────────────────────────────────────────
// Startmodus: --operator öffnet direkt das Operator Dashboard
const isOperatorMode = process.argv.includes("--operator");

app.whenReady().then(() => {
  if (isOperatorMode) {
    createOperatorWindow();
  } else {
    createParentWindow();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isOperatorMode) {
        createOperatorWindow();
      } else {
        createParentWindow();
      }
    }
  });
});

app.on("window-all-closed", () => {
  // Alle laufenden CLI-Prozesse beenden
  for (const [id, proc] of runningProcesses) {
    proc.kill("SIGTERM");
    runningProcesses.delete(id);
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
