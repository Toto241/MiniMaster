import * as fs from "fs";
import * as path from "path";
import * as vm from "vm";

describe("master panel session timeout alignment", () => {
  const sharedSource = fs.readFileSync(
    path.join(__dirname, "..", "shared-ui-session-manager.js"),
    "utf8"
  );
  const webSource = fs.readFileSync(path.join(__dirname, "..", "web-control", "app.js"), "utf8");
  const parentSource = fs.readFileSync(path.join(__dirname, "..", "parent-panel", "app.js"), "utf8");
  const webIndex = fs.readFileSync(path.join(__dirname, "..", "web-control", "index.html"), "utf8");
  const parentIndex = fs.readFileSync(path.join(__dirname, "..", "parent-panel", "index.html"), "utf8");

  it("shared module defines 15min idle and 8h session limits", () => {
    expect(sharedSource).toContain("T1_IDLE_MINUTES: 15");
    expect(sharedSource).toContain("T2_MAX_HOURS: 8");
    expect(sharedSource).toContain("ensureActiveSession");
    expect(sharedSource).toContain("session-expiry-banner");
  });

  it("web-control uses shared session manager", () => {
    expect(webIndex).toContain("shared-ui-session-manager.js");
    expect(webSource).toContain("MiniMasterSessionManager");
    expect(webSource).toContain("ensureMasterSession()");
    expect(webSource).not.toContain("SESSION_TIMEOUT_MS = 30 * 60 * 1000");
    expect(webSource).toContain("if (!ensureMasterSession()) return;");
  });

  it("parent-panel uses shared session manager", () => {
    expect(parentIndex).toContain("shared-ui-session-manager.js");
    expect(parentSource).toContain("MiniMasterSessionManager");
    expect(parentSource).toContain("startMasterSessionMonitoring");
    expect(parentSource).toContain("ensureMasterSession");
  });

  it("MasterSessionManager logs out after idle timeout", () => {
    let loggedOut = false;
    const notified: string[] = [];
    const context = vm.createContext({
      firebase: { auth: () => ({ currentUser: null }) },
      document: {
        getElementById: () => null,
        createElement: () => ({ id: "", className: "", textContent: "", hidden: false }),
        body: { prepend: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
      },
      setInterval: () => 1,
      clearInterval: () => {},
      console,
      Date,
      MiniMasterSessionManager: undefined as unknown,
    });
    vm.runInContext(sharedSource, context);
    const Manager = context.MiniMasterSessionManager as new (opts: object) => {
      markLoggedIn: () => void;
      lastActivityAt: number;
      checkIdle: () => void;
      configure: (opts: object) => void;
    };
    const manager = new Manager({
      isActive: () => true,
      onLogout: () => { loggedOut = true; },
      onNotify: (msg: string) => { notified.push(msg); },
    });
    manager.markLoggedIn();
    manager.lastActivityAt = Date.now() - 16 * 60 * 1000;
    manager.checkIdle();
    expect(loggedOut).toBe(true);
    expect(notified.some((msg) => msg.includes("Session abgelaufen"))).toBe(true);
  });
});
