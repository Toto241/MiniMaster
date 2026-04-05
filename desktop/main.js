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

const WINDOWS_EXECUTABLE_MAP = {
  firebase: "firebase.cmd",
  npm: "npm.cmd",
  npx: "npx.cmd",
  node: "node.exe",
  adb: "adb.exe",
};

function splitCommandLines(command) {
  return String(command || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

function tokenizeCommandLine(line) {
  const tokens = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
  let match;

  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }

  return tokens;
}

function normalizeCommandName(command) {
  return String(command || "").replace(/\.bat$|\.cmd$|\.exe$/i, "").toLowerCase();
}

function hasRejectedControlTokens(tokens) {
  return tokens.some(token => /^(?:&&|\|\||[;|<>]|>>)$/.test(token));
}

function resolveExecutable(command) {
  const normalized = normalizeCommandName(command);
  if (process.platform === "win32") {
    return WINDOWS_EXECUTABLE_MAP[normalized] || command;
  }
  return normalized;
}

function isCommandAllowed(command) {
  const lines = splitCommandLines(command);
  return lines.every(line => {
    const tokens = tokenizeCommandLine(line);
    if (tokens.length === 0 || hasRejectedControlTokens(tokens.slice(1))) {
      return false;
    }
    return ALLOWED_COMMANDS.includes(normalizeCommandName(tokens[0]));
  });
}

function sanitizeArg(value) {
  // Entfernt Shell-Metazeichen aus einzelnen Argumenten
  return String(value).replace(/[;&|`$(){}[\]!<>]/g, "");
}

async function runCommandSequence(lines, cwd, onOutput, onProcess) {
  let lastCode = 0;
  for (const line of lines) {
    const tokens = tokenizeCommandLine(line);
    if (tokens.length === 0) {
      continue;
    }

    lastCode = await new Promise((resolve, reject) => {
      const [command, ...args] = tokens;
      const proc = spawn(resolveExecutable(command), args, {
        cwd,
        shell: false,
        windowsHide: true,
        env: { ...process.env },
      });

      onProcess(proc);
      proc.stdout.on("data", (data) => onOutput("stdout", data.toString()));
      proc.stderr.on("data", (data) => onOutput("stderr", data.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => resolve(code ?? 0));
    });

    if (lastCode !== 0) {
      break;
    }
  }

  return lastCode;
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
    const lines = splitCommandLines(command);
    const processState = {
      proc: null,
      kill() {
        if (this.proc) {
          this.proc.kill("SIGTERM");
        }
      },
    };

    runningProcesses.set(commandId, processState);

    runCommandSequence(
      lines,
      cwd,
      (stream, text) => {
        output += text;
        event.sender.send("cli-output", { stream, data: text, commandId });
      },
      (proc) => {
        processState.proc = proc;
      },
    )
      .then((code) => {
        runningProcesses.delete(commandId);
        resolve({ code, output, commandId });
      })
      .catch((err) => {
        runningProcesses.delete(commandId);
        reject(new Error(`Prozess-Fehler: ${err.message}`));
      });
  });
});

ipcMain.handle("abort-cli", (_event, commandId) => {
  const processState = runningProcesses.get(commandId);
  if (processState) {
    processState.kill();
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

function startDesktopApp() {
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
    for (const [id, processState] of runningProcesses) {
      processState.kill();
      runningProcesses.delete(id);
    }
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

if (require.main === module) {
  startDesktopApp();
}

module.exports = {
  ALLOWED_COMMANDS,
  splitCommandLines,
  tokenizeCommandLine,
  isCommandAllowed,
  sanitizeArg,
  normalizeCommandName,
  hasRejectedControlTokens,
  resolveExecutable,
  startDesktopApp,
};
