/// <reference types="jest" />

import * as fs from "fs";
import { createRequire } from "module";
import * as path from "path";

const loadDesktopModule = createRequire(__filename);
const actualFs = jest.requireActual("fs") as typeof import("fs");

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn((targetPath: fs.PathOrFileDescriptor, options?: any) => jest.requireActual("fs").readFileSync(targetPath, options)),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

jest.mock("electron", () => ({
  app: {
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    quit: jest.fn(),
    getPath: jest.fn(() => path.join("D:", "Tools", "MiniMaster", ".tmp-electron")),
  },
  BrowserWindow: Object.assign(jest.fn(), { getAllWindows: jest.fn(() => []) }),
  shell: { openExternal: jest.fn() },
  ipcMain: { handle: jest.fn() },
}));

describe("Desktop CLI security helpers", () => {
  const loadModule = () => loadDesktopModule("../desktop/main.js") as Record<string, any>;

  beforeEach(() => {
    jest.resetModules();
    const mockedFs = loadDesktopModule("fs") as Record<string, jest.Mock>;
    mockedFs.readFileSync.mockImplementation((targetPath: fs.PathOrFileDescriptor, options?: any) => actualFs.readFileSync(targetPath, options));
    mockedFs.writeFileSync.mockReset();
    mockedFs.mkdirSync.mockReset();
    mockedFs.appendFileSync.mockReset();
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
    const on = jest.fn();
    const getBounds = jest.fn(() => ({ width: 1400, height: 900, x: 120, y: 80 }));
    electron.BrowserWindow.mockImplementation(() => ({
      loadFile,
      on,
      getBounds,
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
    expect(on).toHaveBeenCalledWith("close", expect.any(Function));
  });

  it("reuses persisted parent window bounds when available", () => {
    const electron = loadDesktopModule("electron") as Record<string, any>;
    const mockedFs = loadDesktopModule("fs") as Record<string, jest.Mock>;
    mockedFs.readFileSync.mockImplementation((targetPath: fs.PathOrFileDescriptor, encoding?: any) => {
      if (String(targetPath).endsWith("window-state.json") && encoding === "utf8") {
        return JSON.stringify({ parent: { width: 1280, height: 840, x: 64, y: 96 } });
      }
      return actualFs.readFileSync(targetPath, encoding);
    });

    electron.BrowserWindow.mockImplementation(() => ({
      loadFile: jest.fn(),
      on: jest.fn(),
      getBounds: jest.fn(() => ({ width: 1280, height: 840, x: 64, y: 96 })),
      webContents: { setWindowOpenHandler: jest.fn() },
    }));

    const desktopMain = loadModule();
    desktopMain.createParentWindow();

    expect(electron.BrowserWindow).toHaveBeenCalledWith(expect.objectContaining({
      width: 1280,
      height: 840,
      x: 64,
      y: 96,
    }));
  });

  it("persists operator window bounds on close", () => {
    const electron = loadDesktopModule("electron") as Record<string, any>;
    const mockedFs = loadDesktopModule("fs") as Record<string, jest.Mock>;
    mockedFs.readFileSync.mockImplementation((targetPath: fs.PathOrFileDescriptor, encoding?: any) => {
      if (String(targetPath).endsWith("window-state.json") && encoding === "utf8") {
        throw new Error("missing");
      }
      return actualFs.readFileSync(targetPath, encoding);
    });

    let closeHandler: (() => void) | undefined;
    electron.BrowserWindow.mockImplementation(() => ({
      loadFile: jest.fn(),
      on: jest.fn((eventName: string, handler: () => void) => {
        if (eventName === "close") {
          closeHandler = handler;
        }
      }),
      getBounds: jest.fn(() => ({ width: 1500, height: 920, x: 40, y: 55 })),
      webContents: { setWindowOpenHandler: jest.fn() },
    }));

    const desktopMain = loadModule();
    desktopMain.createOperatorWindow();
    expect(closeHandler).toBeDefined();

    closeHandler?.();

    expect(mockedFs.mkdirSync).toHaveBeenCalled();
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining("window-state.json"),
      expect.stringContaining("\"operator\""),
      "utf8",
    );
  });

  it("writes structured crash reports to the user data directory", () => {
    const mockedFs = loadDesktopModule("fs") as Record<string, jest.Mock>;
    const desktopMain = loadModule();

    desktopMain.appendCrashReport("uncaught-exception", new Error("boom"));

    expect(mockedFs.mkdirSync).toHaveBeenCalled();
    expect(mockedFs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining("desktop-crash-reports.jsonl"),
      expect.stringContaining("\"kind\":\"uncaught-exception\""),
      "utf8",
    );
    expect(mockedFs.appendFileSync.mock.calls[0][1]).toContain("\"message\":\"boom\"");
  });

  it("registers Electron crash handlers for process and renderer failures", () => {
    const electron = loadDesktopModule("electron") as Record<string, any>;
    const desktopMain = loadModule();
    const processOn = jest.spyOn(process, "on");

    desktopMain.registerCrashHandlers();

    expect(processOn).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(processOn).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
    expect(electron.app.on).toHaveBeenCalledWith("render-process-gone", expect.any(Function));
    expect(electron.app.on).toHaveBeenCalledWith("child-process-gone", expect.any(Function));

    processOn.mockRestore();
  });

  it("keeps the parent launcher wired to the web-control panel", () => {
    const launcherHtml = fs.readFileSync(path.join(__dirname, "..", "desktop", "launcher.html"), "utf8");

    expect(launcherHtml).toContain("../web-control/index.html");
    expect(launcherHtml).toContain("Eltern-Panel öffnen");
  });
});
