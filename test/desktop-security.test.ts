/// <reference types="jest" />

import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";

const loadDesktopModule = createRequire(__filename);

jest.mock("electron", () => ({
  app: {
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: Object.assign(jest.fn(), { getAllWindows: jest.fn(() => []) }),
  shell: { openExternal: jest.fn() },
  ipcMain: { handle: jest.fn() },
}));

describe("Desktop CLI security helpers", () => {
  const loadModule = () => loadDesktopModule("../desktop/main.js") as Record<string, any>;

  beforeEach(() => {
    jest.resetModules();
  });

  it("allows explicit multi-line commands from the allowlist", () => {
    const desktopMain = loadModule();

    expect(desktopMain.isCommandAllowed("npm test\nfirebase deploy --only functions")).toBe(true);
  });

  it("rejects unknown executables", () => {
    const desktopMain = loadModule();

    expect(desktopMain.isCommandAllowed("powershell -Command Get-Process")).toBe(false);
  });

  it("rejects shell control operators in command lines", () => {
    const desktopMain = loadModule();

    expect(desktopMain.isCommandAllowed("npm test && calc.exe")).toBe(false);
    expect(desktopMain.isCommandAllowed("firebase deploy --only functions | more")).toBe(false);
  });

  it("tokenizes quoted arguments without keeping quote characters", () => {
    const desktopMain = loadModule();

    expect(desktopMain.tokenizeCommandLine("firebase deploy --only \"functions,firestore\"")).toEqual([
      "firebase",
      "deploy",
      "--only",
      "functions,firestore",
    ]);
  });

  it("sanitizes cwd arguments without altering normal Windows paths", () => {
    const desktopMain = loadModule();

    expect(desktopMain.sanitizeArg("D:\\Tools\\MiniMaster")).toBe("D:\\Tools\\MiniMaster");
    expect(desktopMain.sanitizeArg("D:\\Tools\\MiniMaster;&del")).toBe("D:\\Tools\\MiniMasterdel");
  });

  it("creates the operator window with admin panel and operator preload", () => {
    const electron = loadDesktopModule("electron") as Record<string, any>;
    const loadFile = jest.fn();
    const setWindowOpenHandler = jest.fn();
    electron.BrowserWindow.mockImplementation(() => ({
      loadFile,
      webContents: { setWindowOpenHandler },
    }));

    const desktopMain = loadModule();

    desktopMain.createOperatorWindow();

    expect(electron.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      title: "MiniMaster Operator Dashboard",
      webPreferences: expect.objectContaining({
        preload: expect.stringContaining("operator-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      }),
    }));
    expect(loadFile).toHaveBeenCalledWith(expect.stringContaining(path.join("admin-panel", "index.html")));
    expect(setWindowOpenHandler).toHaveBeenCalled();
  });

  it("keeps the parent launcher wired to the web-control panel", () => {
    const launcherHtml = fs.readFileSync(path.join(__dirname, "..", "desktop", "launcher.html"), "utf8");

    expect(launcherHtml).toContain("../web-control/index.html");
    expect(launcherHtml).toContain("Eltern-Panel öffnen");
  });
});
