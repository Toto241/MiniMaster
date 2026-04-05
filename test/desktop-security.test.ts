/// <reference types="jest" />

import { createRequire } from "module";

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
});
