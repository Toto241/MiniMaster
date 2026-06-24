const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");

const WINDOW_STATE_FILE = "window-state.json";
const CRASH_REPORT_FILE = "desktop-crash-reports.jsonl";
let crashHandlersRegistered = false;

// ── Sicherheit: Nur explizit erlaubte CLI-Befehle ──────────────────────
const ALLOWED_COMMANDS = [
  "pwsh",
  "firebase",
  "npm",
  "npx",
  "node",
  "adb",
];

// Laufende Prozesse pro commandId
const runningProcesses = new Map();

const WINDOWS_EXECUTABLE_MAP = {
  pwsh: "pwsh.exe",
  firebase: "firebase.cmd",
  npm: "npm.cmd",
  npx: "npx.cmd",
  node: "node.exe",
  adb: "adb.exe",
};

function getWindowStateFilePath() {
  const basePath = typeof app.getPath === "function" ? app.getPath("userData") : process.cwd();
  return path.join(basePath, WINDOW_STATE_FILE);
}

function sanitizeWindowState(rawState) {
  if (!rawState || typeof rawState !== "object") {
    return null;
  }

  const nextState = {};
  if (Number.isFinite(rawState.width) && rawState.width >= 640) {
    nextState.width = Math.round(rawState.width);
  }
  if (Number.isFinite(rawState.height) && rawState.height >= 480) {
    nextState.height = Math.round(rawState.height);
  }
  if (Number.isFinite(rawState.x)) {
    nextState.x = Math.round(rawState.x);
  }
  if (Number.isFinite(rawState.y)) {
    nextState.y = Math.round(rawState.y);
  }

  return Object.keys(nextState).length > 0 ? nextState : null;
}

function readWindowStateStore() {
  const statePath = getWindowStateFilePath();
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch (_error) {
    return {};
  }
}

function loadWindowState(windowKey, fallbackBounds) {
  const stateStore = readWindowStateStore();
  const persisted = sanitizeWindowState(stateStore[windowKey]);
  return persisted ? { ...fallbackBounds, ...persisted } : { ...fallbackBounds };
}

function saveWindowState(windowKey, bounds) {
  const sanitizedBounds = sanitizeWindowState(bounds);
  if (!sanitizedBounds) {
    return;
  }

  const statePath = getWindowStateFilePath();
  const stateStore = readWindowStateStore();
  stateStore[windowKey] = sanitizedBounds;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(stateStore, null, 2), "utf8");
}

function attachWindowStatePersistence(win, windowKey) {
  if (!win || typeof win.on !== "function" || typeof win.getBounds !== "function") {
    return;
  }

  win.on("close", () => {
    saveWindowState(windowKey, win.getBounds());
  });
}

function getCrashReportFilePath() {
  const basePath = typeof app.getPath === "function" ? app.getPath("userData") : process.cwd();
  return path.join(basePath, CRASH_REPORT_FILE);
}

function normalizeCrashPayload(payload) {
  if (payload instanceof Error) {
    return {
      name: payload.name,
      message: payload.message,
      stack: payload.stack || "",
    };
  }
  if (payload && typeof payload === "object") {
    return payload;
  }
  return { message: String(payload ?? "unknown") };
}

function appendCrashReport(kind, payload) {
  const crashPath = getCrashReportFilePath();
  const report = {
    kind,
    timestamp: new Date().toISOString(),
    payload: normalizeCrashPayload(payload),
  };
  fs.mkdirSync(path.dirname(crashPath), { recursive: true });
  fs.appendFileSync(crashPath, `${JSON.stringify(report)}\n`, "utf8");
  return report;
}

function registerCrashHandlers() {
  if (crashHandlersRegistered) {
    return;
  }
  crashHandlersRegistered = true;

  process.on("uncaughtException", (error) => {
    appendCrashReport("uncaught-exception", error);
  });

  process.on("unhandledRejection", (reason) => {
    appendCrashReport("unhandled-rejection", reason);
  });

  if (typeof app.on === "function") {
    app.on("render-process-gone", (_event, _webContents, details) => {
      appendCrashReport("render-process-gone", details || {});
    });

    app.on("child-process-gone", (_event, details) => {
      appendCrashReport("child-process-gone", details || {});
    });
  }
}

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
  const windowState = loadWindowState("parent", {
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
  });
  const win = new BrowserWindow({
    ...windowState,
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

  attachWindowStatePersistence(win, "parent");

  return win;
}

// ── Fenster: Operator Dashboard (mit CLI-Bridge) ───────────────────────
function createOperatorWindow() {
  const windowState = loadWindowState("operator", {
    width: 1400,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
  });
  const win = new BrowserWindow({
    ...windowState,
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

  attachWindowStatePersistence(win, "operator");

  return win;
}

// ── App-Start ──────────────────────────────────────────────────────────
// Startmodus: --operator öffnet direkt das Operator Dashboard
const isOperatorMode = process.argv.includes("--operator");

function startDesktopApp() {
  app.whenReady().then(() => {
    registerCrashHandlers();

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
  getWindowStateFilePath,
  loadWindowState,
  saveWindowState,
  attachWindowStatePersistence,
  getCrashReportFilePath,
  appendCrashReport,
  registerCrashHandlers,
  normalizeCommandName,
  hasRejectedControlTokens,
  resolveExecutable,
  createParentWindow,
  createOperatorWindow,
  startDesktopApp,
};
